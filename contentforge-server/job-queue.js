require('dotenv').config()
const express = require('express')
const { spawn } = require('child_process')
const fs = require('fs')
const path = require('path')
const https = require('https')
const crypto = require('crypto')
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3')
const { imageToVideoClip, imageToVideoChain, lipsyncClip, extractLastFrame, concatClips } = require('./i2v')

const SCRIPT_PATH = '/root/.openclaw/workspace/reforhandle-content/make_tiktok_reforhandle.py'
const OUTPUT_DIR = '/root/.openclaw/workspace/contentforge-output'
const ENV_PATH = '/opt/reforhandle/.env.local'

const DEFAULT_VOICE_ID = 'nPczCjzI2devNBz1zQrb' // Brian (multilingual, supports Norwegian)

// Wait for .done marker file (Python renderer signals completion)
async function waitForFile(filePath, maxAttempts = 30) {
  const doneFile = filePath + '.done'
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise(r => setTimeout(r, 2000))
    if (fs.existsSync(doneFile)) {
      try {
        fs.unlinkSync(doneFile) // cleanup
        console.log(`[job-queue] Done file found for ${path.basename(filePath)} after ${i + 1} attempt(s)`)
      } catch (err) {
        console.warn(`[job-queue] Could not delete done file: ${err.message}`)
      }
      return true
    }
    console.log(`[job-queue] Waiting for done file... attempt ${i + 1}/${maxAttempts}`)
  }
  console.warn(`[job-queue] Done file not found for ${path.basename(filePath)} after ${maxAttempts} attempts`)
  return false
}

// In-memory registry of active jobs (survives for lifetime of this process)
const activeJobs = new Map()

const { exec } = require('child_process')
const { promisify } = require('util')
const execAsync = promisify(exec)

const router = express.Router()
router.use(express.json())

// ─── API Key Loader ───────────────────────────────────────────────────────────

// Parse KEY=VALUE lines from .env.local
function loadApiKeys() {
  try {
    const raw = fs.readFileSync(ENV_PATH, 'utf8')
    const keys = {}
    for (const line of raw.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const eq = trimmed.indexOf('=')
      if (eq < 0) continue
      keys[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim()
    }
    return keys
  } catch (err) {
    console.error('[job-queue] Failed to load API keys from', ENV_PATH, ':', err.message)
    return {}
  }
}

// ─── HTTP Helpers ─────────────────────────────────────────────────────────────

// POST request over HTTPS — returns { statusCode, body: Buffer }
function httpsPost(hostname, pathname, headers, bodyBuffer) {
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        method: 'POST',
        hostname,
        path: pathname,
        headers: { ...headers, 'Content-Length': bodyBuffer.length },
      },
      (res) => {
        const chunks = []
        res.on('data', (chunk) => chunks.push(chunk))
        res.on('end', () => resolve({ statusCode: res.statusCode, body: Buffer.concat(chunks) }))
      }
    )
    req.on('error', reject)
    req.write(bodyBuffer)
    req.end()
  })
}

// Download an HTTPS URL to a local file, follows one redirect level
function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destPath)
    https
      .get(url, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          file.destroy()
          fs.unlink(destPath, () => {})
          return downloadFile(res.headers.location, destPath).then(resolve).catch(reject)
        }
        res.pipe(file)
        file.on('finish', () => file.close(() => resolve(destPath)))
        file.on('error', (err) => {
          fs.unlink(destPath, () => {})
          reject(err)
        })
      })
      .on('error', (err) => {
        file.destroy()
        fs.unlink(destPath, () => {})
        reject(err)
      })
  })
}

// ─── Content Generation ───────────────────────────────────────────────────────

// To-pass loudnorm av en voiceover-fil (in-place): pass 1 maaler, pass 2
// legger EN konstant gain (linear). Maal I=-13 (hetere enn musikkens -16):
// stemmens topper skal ligge OVER musikkens i miksen (Lars 30/7).
function ffmpegPromise(args) {
  return new Promise((resolve, reject) => {
    const { execFile } = require('child_process')
    execFile('ffmpeg', args, { timeout: 60000 }, (err, _stdout, stderr) => {
      if (err) reject(new Error(String(stderr).slice(-300)))
      else resolve(String(stderr))
    })
  })
}
function probeDuration(p) {
  return new Promise((resolve) => {
    const { execFile } = require('child_process')
    execFile('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', p],
      { timeout: 15000 }, (err, stdout) => resolve(err ? 0 : parseFloat(String(stdout)) || 0))
  })
}
async function normalizeVoiceover(voPath) {
  const stderr1 = await ffmpegPromise(['-i', voPath, '-af', 'loudnorm=I=-13:TP=-1.0:LRA=11:print_format=json', '-f', 'null', '-'])
  const jsonMatch = stderr1.match(/\{[^{}]*"input_i"[^{}]*\}/)
  if (!jsonMatch) throw new Error('fant ikke maaleresultat')
  const m = JSON.parse(jsonMatch[0])
  const tmp = voPath + '.norm.mp3'
  await ffmpegPromise(['-y', '-i', voPath, '-af',
    `loudnorm=I=-13:TP=-1.0:LRA=11:measured_I=${m.input_i}:measured_TP=${m.input_tp}:measured_LRA=${m.input_lra}:measured_thresh=${m.input_thresh}:offset=${m.target_offset}:linear=true`,
    '-c:a', 'libmp3lame', '-b:a', '160k', tmp])
  fs.renameSync(tmp, voPath)
}

// Call ElevenLabs text-to-speech, save mp3 to outputPath — retries up to 3x
async function generateVoiceover(text, voiceId, outputPath, apiKey) {
  const bodyBuffer = Buffer.from(JSON.stringify({
    text,
    model_id: 'eleven_turbo_v2_5', language_code: 'no', apply_text_normalization: 'off',
    voice_settings: {
      stability: 0.5,
      similarity_boost: 0.75,
    },
  }))

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const { statusCode, body } = await httpsPost(
        'api.elevenlabs.io',
        `/v1/text-to-speech/${voiceId}`,
        {
          'xi-api-key': apiKey,
          'Content-Type': 'application/json',
          Accept: 'audio/mpeg',
        },
        bodyBuffer
      )

      if (statusCode !== 200) {
        throw new Error(
          `ElevenLabs returned ${statusCode}: ${body.toString('utf8').slice(0, 200)}`
        )
      }

      fs.writeFileSync(outputPath, body)
      console.log(`[job-queue] Voiceover saved → ${outputPath}`)
      return outputPath
    } catch (err) {
      console.error(`[job-queue] ElevenLabs attempt ${attempt}/3 failed:`, err.message)
      if (attempt === 3) throw err
      await new Promise((r) => setTimeout(r, 1000 * attempt))
    }
  }
}

// Call gpt-image-1, decode b64_json and save to outputPath

// Visual style prompts for gpt-image-1 in storytelling mode
const STYLE_PROMPTS = {
  tech:       'Premium 3D-rendered CGI scene, sleek metallic surfaces, dramatic studio lighting, deep shadows, photorealistic render. No text or typography.',
  editorial:  'Bold editorial photography, high-contrast composition, strong graphic lines, magazine cover quality, professional lighting. No text or typography.',
  warm:       'Warm golden-hour lifestyle photography, natural light, soft bokeh, inviting and human atmosphere, candid feel. No text or typography.',
  minimal:    'Clean minimalist scene, large negative space, muted Scandinavian palette, simple shapes, calm and airy mood. No text or typography.',
  painterly:  'Expressive painterly digital illustration, rich visible brushstrokes, vivid saturated colors, artistic cinematic mood. No text or typography.',
}

// Supported sizes: '9:16' (1024x1536 portrait), '1:1' (1024x1024), '16:9' (1536x1024)
const GPT_IMAGE_SIZES = {
  '9:16': '1024x1536',
  '1:1': '1024x1024',
  '16:9': '1536x1024',
}

async function generateImage(prompt, outputPath, apiKey, format = '9:16', r2UploadInfo = null) {
  if (!prompt) throw new Error('generateImage: prompt is required')
  const size = GPT_IMAGE_SIZES[format] || '1024x1536'
  console.log(`[job-queue] gpt-image-1 (${size}): "${prompt.substring(0, 60)}..."`)

  const response = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-image-1',
      prompt,
      n: 1,
      size,
      quality: 'medium',
    }),
  })

  if (!response.ok) {
    const errText = await response.text()
    throw new Error(`gpt-image-1 returned ${response.status}: ${errText.slice(0, 200)}`)
  }

  const json = await response.json()
  const b64 = json.data?.[0]?.b64_json
  if (!b64) throw new Error('No b64_json in gpt-image-1 response')

  const imageBuffer = Buffer.from(b64, 'base64')
  fs.writeFileSync(outputPath, imageBuffer)
  console.log(`[job-queue] Image saved → ${outputPath} (${imageBuffer.byteLength} bytes)`)

  // Upload to R2 if credentials provided
  let r2Url = null
  const hasR2Creds = process.env.R2_ENDPOINT && process.env.R2_ACCESS_KEY_ID && process.env.R2_SECRET_ACCESS_KEY
  console.log(`[job-queue] generateImage: r2UploadInfo=${!!r2UploadInfo}, hasR2Creds=${!!hasR2Creds}`)
  
  if (r2UploadInfo && hasR2Creds) {
    try {
      console.log(`[job-queue] Uploading image to R2: ${r2UploadInfo.imageName}`)
      const r2 = new S3Client({
        region: 'auto',
        endpoint: process.env.R2_ENDPOINT,
        credentials: {
          accessKeyId: process.env.R2_ACCESS_KEY_ID,
          secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
        },
      })

      const imageBuffer = fs.readFileSync(outputPath)
      const r2Key = `images/${r2UploadInfo.campaignId}/${r2UploadInfo.jobId}/${r2UploadInfo.imageName}`

      await r2.send(
        new PutObjectCommand({
          Bucket: process.env.R2_BUCKET_NAME || 'contentforge-assets',
          Key: r2Key,
          Body: imageBuffer,
          ContentType: 'image/png',
        })
      )

      r2Url = `${process.env.R2_PUBLIC_URL}/images/${r2UploadInfo.campaignId}/${r2UploadInfo.jobId}/${r2UploadInfo.imageName}`
      console.log(`[job-queue] Image uploaded to R2 ✅: ${r2Url}`)
    } catch (r2Err) {
      console.error(`[job-queue] R2 image upload failed ❌: ${r2Err.message}`)
    }
  } else if (r2UploadInfo) {
    console.warn(`[job-queue] R2 upload requested but credentials missing`)
  }

  return { localPath: outputPath, r2Url }
}

// ─── Config Builder ───────────────────────────────────────────────────────────

const DEFAULT_MUSIC_PATH = '/root/.openclaw/workspace/reforhandle-content/background_music.mp3'
const MUSIC_DIR = path.join(__dirname, 'music')

// Build a 3-segment config.json from user-supplied copy
function buildDynamicConfig(jobId, { headline, bodyCopy, service, cta, musicFile }) {
  const dir = `${OUTPUT_DIR}/${jobId}`
  const backgroundMusic = musicFile
    ? path.join(MUSIC_DIR, musicFile)
    : DEFAULT_MUSIC_PATH
  return {
    segments: [
      {
        bg: `${dir}/image_a.png`,
        vo_path: `${dir}/vo_1.mp3`,
        lines: [
          { text: headline, size: 64, bold: true, color: '#ffffff' },
          { text: bodyCopy, size: 36, bold: false, color: '#cccccc' },
        ],
        sub: 'reforhandle.no',
      },
      {
        bg: `${dir}/image_b.png`,
        vo_path: `${dir}/vo_2.mp3`,
        lines: [
          { text: service, size: 56, bold: true, color: '#ffffff' },
          { text: bodyCopy, size: 36, bold: false, color: '#cccccc' },
        ],
        sub: 'reforhandle.no',
      },
      {
        bg: `${dir}/image_c.png`,
        vo_path: `${dir}/vo_3.mp3`,
        lines: [
          { text: headline, size: 64, bold: true, color: '#ffffff' },
          { text: cta ? `${bodyCopy} ${cta}` : bodyCopy, size: 36, bold: false, color: '#cccccc' },
        ],
        sub: 'reforhandle.no',
      },
    ],
    output: `${dir}/output.mp4`,
    backgroundMusic,
  }
}

// ─── Routes ───────────────────────────────────────────────────────────────────

// POST /jobs — enqueue a new video production job
router.post('/', async (req, res) => {
  const {
    jobId: clientJobId,
    campaignId,
    productId,
    service,
    headline,
    bodyCopy,
    tone,
    voiceId,
    cta,
    musicFile, matchMusicLength,
    segments,
    video_format,
    imageStyle,
    logoUrl,
    outroCard,
    aiMotion,
    aiMotionEngine,
  } = req.body || {}

  if (!campaignId || !service) {
    return res.status(400).json({ error: 'Missing campaignId or service' })
  }
  // Allow either headline+bodyCopy (Reklame mode) OR segments (Storytelling mode)
  if (!segments && (!headline || !bodyCopy)) {
    return res.status(400).json({ error: 'Missing headline/bodyCopy or segments' })
  }

  const jobId = clientJobId || crypto.randomUUID()
  const jobDir = `${OUTPUT_DIR}/${jobId}`

  // DEBUG: Log music file
  console.log('[DEBUG MUSIC] musicFile received:', musicFile)

  try {
    fs.mkdirSync(jobDir, { recursive: true })
  } catch (err) {
    console.error(`[job-queue] Failed to create job dir ${jobDir}:`, err)
    return res.status(500).json({ error: 'Failed to create job directory' })
  }

  console.log(`[job-queue] Queuing job ${jobId}`, { campaignId, service, headline, tone })
  activeJobs.set(jobId, { startTime: Date.now(), status: 'generating' })

  // Respond immediately — generation + render run in background
  res.json({ jobId, status: 'queued' })

  setImmediate(async () => {
    try {
      const keys = loadApiKeys()
      const elevenKey = keys.ELEVENLABS_API_KEY
      const openaiKey = keys.OPENAI_API_KEY

      if (!elevenKey) throw new Error('ELEVENLABS_API_KEY not found in ' + ENV_PATH)
      if (!openaiKey) throw new Error('OPENAI_API_KEY not found in ' + ENV_PATH)

      const vid = voiceId || DEFAULT_VOICE_ID
      const mood = tone || 'professional'
      let config
      let configPath
      let imageUrls = [] // Collect image URLs for webhook

      // Handle Storytelling mode (segments) vs Reklame mode (headline/bodyCopy)
      if (segments && Array.isArray(segments) && segments.length > 0) {
        // STORYTELLING MODE: Use segments directly.
        //
        // Establish ONE canonical ordered array up front and use it for BOTH
        // voiceover generation AND config.json building. This guarantees
        // vo_<n>.mp3 / image_<n>.png / sub all refer to the same segment.
        // We sort by `index` when present (start-production now stamps a clean
        // 0-based sequential index that matches the editor's array order);
        // segments without a numeric index keep their incoming array position.
        const orderedSegments = segments
          .map((s, i) => ({ s, i }))
          .sort((a, b) => {
            const ai = typeof a.s.index === 'number' ? a.s.index : a.i
            const bi = typeof b.s.index === 'number' ? b.s.index : b.i
            return ai - bi
          })
          .map(({ s }) => s)

        console.log(`[job-queue] Storytelling mode: Processing ${orderedSegments.length} segments for job ${jobId}...`)
        const segImageUrls = []
        for (let i = 0; i < orderedSegments.length; i++) {
          const segment = orderedSegments[i]
          console.log(`[job-queue] Segment ${i + 1}: text="${(segment.text || '').slice(0, 50)}..." | vo="${(segment.voiceover || segment.text || '').slice(0, 50)}..."`)
          
          // Use the APPROVED (previewed) voiceover if available — ElevenLabs is
          // non-deterministic, so regenerating gives a different take than the one the
          // user reviewed and approved. Fall back to fresh generation only if missing.
          const voPath = `${jobDir}/vo_${i + 1}.mp3`
          if (segment.voiceoverUrl) {
            console.log(`[job-queue] Segment ${i + 1}: Downloading approved voiceover from ${segment.voiceoverUrl.substring(0, 60)}...`)
            try {
              const voRes = await fetch(segment.voiceoverUrl)
              if (!voRes.ok) throw new Error(`HTTP ${voRes.status}`)
              const voBuf = Buffer.from(await voRes.arrayBuffer())
              // Egen-innspilte opptak (MediaRecorder) er webm/mp4, ikke mp3 —
              // transkod alt som ikke ER mp3, saa resten av pipelinen alltid
              // faar formatet den forventer (2026-07-30, «Les inn selv»).
              const looksMp3 = voBuf.slice(0, 3).toString() === 'ID3' || (voBuf[0] === 0xff && (voBuf[1] & 0xe0) === 0xe0)
              if (looksMp3) {
                fs.writeFileSync(voPath, voBuf)
              } else {
                const rawPath = `${jobDir}/vo_${i + 1}_raw`
                fs.writeFileSync(rawPath, voBuf)
                await new Promise((resolve, reject) => {
                  const p = spawn('ffmpeg', ['-y', '-i', rawPath, '-vn', '-c:a', 'libmp3lame', '-b:a', '160k', voPath])
                  p.on('close', (code) => (code === 0 ? resolve(null) : reject(new Error(`ffmpeg transcode exit ${code}`))))
                  p.on('error', reject)
                })
                fs.unlink(rawPath, () => {})
                console.log(`[job-queue] Segment ${i + 1}: Transcoded own recording -> mp3`)
              }
              console.log(`[job-queue] Segment ${i + 1}: Approved voiceover saved (${voBuf.byteLength} bytes)`)
            } catch (voErr) {
              console.error(`[job-queue] Segment ${i + 1}: approved voiceover download failed, regenerating:`, voErr.message)
              await generateVoiceover(segment.voiceover || segment.text, vid, voPath, elevenKey)
            }
          } else {
            await generateVoiceover(segment.voiceover || segment.text, vid, voPath, elevenKey)
          }

          // Normaliser ALLE stemmer til fast nivaa (I=-16) — ogsaa AI-stemmene
          // (Lars 30/7: «den maa jo ogsaa leveres i riktig nivaa»). Medleyen
          // normaliseres til samme referanse, saa duck-nivaaene faar kjent
          // betydning. TO-PASS — aldri pumping. Feiler den, beholdes originalen.
          try {
            await normalizeVoiceover(voPath)
            console.log(`[job-queue] Segment ${i + 1}: Voiceover normalisert til -16 LUFS`)
          } catch (nErr) {
            console.error(`[job-queue] Segment ${i + 1}: normalisering hoppet over:`, nErr.message)
          }

          const localImagePath = `${jobDir}/image_${i + 1}.png`

          // Use pre-generated image from draft if available; otherwise generate a visual scene
          if (segment.imageUrl) {
            console.log(`[job-queue] Segment ${i + 1}: Downloading pre-generated image from ${segment.imageUrl.substring(0, 60)}...`)
            try {
              const imgRes = await fetch(segment.imageUrl)
              if (!imgRes.ok) throw new Error(`HTTP ${imgRes.status}`)
              const imgBuf = await imgRes.arrayBuffer()
              fs.writeFileSync(localImagePath, Buffer.from(imgBuf))
              console.log(`[job-queue] Segment ${i + 1}: Pre-generated image saved (${Buffer.from(imgBuf).byteLength} bytes)`)
              imageUrls.push(segment.imageUrl)
              segImageUrls[i] = segment.imageUrl
            } catch (dlErr) {
              console.warn(`[job-queue] Segment ${i + 1}: Download failed (${dlErr.message}), generating new image...`)
              const visualPrompt = `Cinematic photorealistic scene that visually illustrates: "${segment.text.substring(0, 200)}". No text, words, letters, or typography anywhere in the image. Professional photography, dramatic lighting.`
              const imageResult = await generateImage(visualPrompt, localImagePath, openaiKey, video_format, { campaignId, jobId, imageName: `image_${i + 1}.png` })
              if (imageResult.r2Url) imageUrls.push(imageResult.r2Url)
              segImageUrls[i] = imageResult.r2Url || null
            }
          } else {
            // No pre-generated image — generate a visual scene (not raw text as prompt)
            const stylePrefix = (imageStyle && STYLE_PROMPTS[imageStyle]) ? STYLE_PROMPTS[imageStyle] + ' ' : 'Cinematic photorealistic scene. Professional photography, dramatic lighting. '
            const visualPrompt = segment.imagePrompt || `${stylePrefix}Visual scene illustrating: "${segment.text.substring(0, 180)}". No text, words, letters, or typography anywhere in the image.`
            console.log(`[job-queue] Segment ${i + 1}: Generating image with visual prompt...`)
            const imageResult = await generateImage(visualPrompt, localImagePath, openaiKey, video_format, { campaignId, jobId, imageName: `image_${i + 1}.png` })
            if (imageResult.r2Url) imageUrls.push(imageResult.r2Url)
            segImageUrls[i] = imageResult.r2Url || null
          }
        }

        // «Film = musikkens lengde» (Lars 30/7): musikklengde / antall
        // segmenter = segmentlengde. Hvert segments hviletid = andelen minus
        // faktisk stemmelengde (+0,4 s gap). Regnes FOER animasjonen (31/7):
        // kjedegenereringen trenger maallengden for aa bestille klipp i riktig
        // lengde. Cap 60 s per segment mot ekstreme kilder.
        const voDurs = []
        for (let i = 0; i < orderedSegments.length; i++) {
          try { voDurs.push(await probeDuration(`${jobDir}/vo_${i + 1}.mp3`)) }
          catch (pErr) { voDurs.push(0) }
        }
        let computedHolds = null
        if (matchMusicLength && musicFile) {
          try {
            const musicDur = await probeDuration(path.join(MUSIC_DIR, musicFile))
            if (musicDur > 1) {
              const share = musicDur / orderedSegments.length
              computedHolds = voDurs.map((voDur) => Math.min(60, Math.max(0, share - (voDur + 0.4))))
              console.log(`[job-queue] Film=musikk: ${musicDur.toFixed(1)}s / ${orderedSegments.length} segmenter -> hold ${computedHolds.map((h) => h.toFixed(1)).join(', ')}`)
            }
          } catch (mErr) {
            console.error('[job-queue] Film=musikk-beregning hoppet over:', mErr.message)
          }
        }
        // Endelig hviletid + maallengde per segment. Maa speile rendererens
        // formel (duration = vo + 0.4 + hold) — styrer baade i2v-bestilling
        // og config-skrivingen lenger ned.
        const segHolds = orderedSegments.map((seg, i) =>
          computedHolds ? computedHolds[i] : (Number(seg.holdSeconds) > 0 ? Math.min(Number(seg.holdSeconds), 60) : 0))
        const targetDurs = orderedSegments.map((seg, i) => voDurs[i] + 0.4 + segHolds[i])

        // AI-bevegelse (kjedegenerering 31/7): hvert stillbilde blir ETT
        // sammenhengende bevegelsesklipp i hele segmentets lengde («riktig
        // lengde, ingen boomeranging»). Segmenter lengre enn motorens maks
        // kjedes: neste ledd saas fra forrige ledds siste bilde. Parallelt
        // per segment; stillbilde-fallback som foer om alt feiler.
        let segClips = []
        if (aiMotion) {
          const engine = aiMotionEngine || 'pixverse'
          const _toAnimate = orderedSegments.filter((s) => (s.motion && s.motion !== 'none') || s.animate === true).length
          console.log(`[job-queue] AI-bevegelse PA (${engine}) - animerer ${_toAnimate} av ${orderedSegments.length} segmenter (per-segment valg)`)
          const motionPrompt = 'subtle cinematic camera push-in and gentle ambient motion only. The people stay still and do NOT talk - mouths closed, no lip movement, no speaking or singing. Photorealistic, no text or letters.'
          const _r = await Promise.allSettled(orderedSegments.map(async (seg, i) => {
            const motion = seg.motion || (seg.animate === true ? 'move' : 'none')
            if (motion === 'none') return null
            const url = segImageUrls[i]
            if (!url) throw new Error('mangler bilde-URL')
            const clipPath = `${jobDir}/clip_${i + 1}.mp4`
            const chainDir = `${jobDir}/chain_${i + 1}`
            fs.mkdirSync(chainDir, { recursive: true })
            const uploadFrame = (buf, name) => uploadBufferToR2(buf, `videos/${jobId}/chain_${i + 1}_${name}`, 'image/png')
            // +0,5 s margin: rendereren trimmer eksakt uansett; et klipp som
            // ender et hakk for KORT ville derimot utloest nodlosningen.
            const targetSec = targetDurs[i] + 0.5
            if (motion === 'talk') {
              // Lip-sync: bruk godkjent voiceover-URL; ellers last opp den genererte vo-fila
              let audioUrl = seg.voiceoverUrl || null
              if (!audioUrl) {
                const voBuf = fs.readFileSync(`${jobDir}/vo_${i + 1}.mp3`)
                audioUrl = await uploadBufferToR2(voBuf, `videos/${jobId}/vo_${i + 1}.mp3`, 'audio/mpeg')
              }
              const talkPath = `${jobDir}/talk_${i + 1}.mp4`
              await lipsyncClip({ imageUrl: url, audioUrl, outPath: talkPath, log: (m) => console.log(m) })
              const talkDur = await probeDuration(talkPath)
              const rest = targetSec - talkDur
              if (rest < 1.0) {
                fs.copyFileSync(talkPath, clipPath)
                return clipPath
              }
              // Rolig hale: kjede saadd fra snakkeklippets siste bilde, saa
              // personen blir staaende levende etter replikken (30/7). Feiler
              // halen, brukes snakkeklippet alene og rendereren fyller resten
              // (boomerang som kjent, akseptert nodlosning).
              try {
                const seedPng = `${chainDir}/talk_seed.png`
                await extractLastFrame(talkPath, seedPng)
                const seedUrl = await uploadFrame(fs.readFileSync(seedPng), 'talk_seed.png')
                const idlePath = `${chainDir}/idle.mp4`
                await imageToVideoChain({ imageUrl: seedUrl, prompt: motionPrompt, engine, targetSec: rest, resolution: '720p', outPath: idlePath, workDir: chainDir, uploadFrame, log: (m) => console.log(m) })
                await concatClips([talkPath, idlePath], clipPath)
                console.log(`[job-queue] segment ${i + 1}: snakk ${talkDur.toFixed(1)}s + rolig hale ${rest.toFixed(1)}s skjotet`)
              } catch (tailErr) {
                console.warn(`[job-queue] segment ${i + 1}: rolig hale feilet (${tailErr.message}) - bruker snakkeklippet alene`)
                fs.copyFileSync(talkPath, clipPath)
              }
              return clipPath
            }
            const chain = await imageToVideoChain({ imageUrl: url, prompt: motionPrompt, engine, targetSec, resolution: '720p', outPath: clipPath, workDir: chainDir, uploadFrame, log: (m) => console.log(m) })
            console.log(`[job-queue] segment ${i + 1}: kjede ferdig (${chain.chunks} ledd, ${chain.coveredSec.toFixed(1)}s av maal ${targetSec.toFixed(1)}s)`)
            return clipPath
          }))
          segClips = _r.map((r, i) => {
            if (r.status === 'fulfilled' && r.value) { console.log(`[job-queue] i2v-klipp ${i + 1} OK`); return `${jobDir}/clip_${i + 1}.mp4` }
            if (r.status === 'rejected') console.warn(`[job-queue] i2v-klipp ${i + 1} FEILET (${r.reason && r.reason.message}) - bruker stillbilde`)
            return null
          })
        }

        // Write segments to config for Python renderer (storytelling format)
        // lines: [] — no text overlay, the voiceover audio narrates and the image shows the scene
        // sub: short subtitle at bottom for accessibility
        config = {
          // Use the SAME canonical ordered array used for voiceover/image
          // generation above — never the raw `segments` request order — so the
          // on-screen subtitle (seg.text) and the voiceover audio (vo_<n>.mp3,
          // generated from segment.voiceover) always belong to the same segment.
          segments: orderedSegments.map((seg, i) => {
            const subText = seg.text || ''
            return {
              bg: `${jobDir}/image_${i + 1}.png`,
              clip: segClips[i] || undefined,
              vo_path: `${jobDir}/vo_${i + 1}.mp3`,
              lines: [],
              sub: subText.length > 80 ? subText.substring(0, 77) + '...' : subText,
              // Musikkdrevet tempo (2026-07-30): hviletid etter stemmen —
              // rendereren lar bildet staa og musikken loeftes av duckingen.
              // segHolds er regnet FOER animasjonen (film=musikk vinner over
              // manuelle verdier) og er samme tall kjedegenereringen bestilte.
              hold: segHolds[i],
            }
          }),
          output: `${jobDir}/output.mp4`,
          backgroundMusic: musicFile
            ? path.join(MUSIC_DIR, musicFile)
            : '/root/.openclaw/workspace/contentforge-server/music/spor1-upbeat.mp3',
          format: video_format || '9:16', // Pass format to Python script
          jobId,
          campaignId,
          service,
          outroCard: outroCard ? { ...outroCard, jinglePath: outroCard.jingleFile ? path.join(MUSIC_DIR, outroCard.jingleFile) : null } : null,
        }
        configPath = `${jobDir}/config.json`
        fs.writeFileSync(configPath, JSON.stringify(config, null, 2))
        console.log(`[job-queue] Storytelling config written → ${configPath}`)
      } else {
        // REKLAME MODE: Use headline/bodyCopy (original flow)
        console.log(`[job-queue] Reklame mode: Generating 3 variations for job ${jobId}...`)
        
        // Three voiceover text variations
        const voTexts = [
          bodyCopy,
          `${headline}. ${bodyCopy}`,
          cta ? `${bodyCopy} ${cta}` : `${bodyCopy}`,
        ]

        // Three image prompt variations
        const imgPrompts = [
          `${headline}, ${service} concept, ${mood} mood, professional, clean design, vertical portrait`,
          `${service} professional service, ${mood} atmosphere, modern business, vertical portrait`,
          `${headline}, success story, ${mood} lifestyle, high quality, vertical portrait`,
        ]

        console.log(`[job-queue] Generating 3 voiceovers for job ${jobId}...`)
        for (let i = 0; i < 3; i++) {
          await generateVoiceover(voTexts[i], vid, `${jobDir}/vo_${i + 1}.mp3`, elevenKey)
        }

        console.log(`[job-queue] Generating 3 images for job ${jobId}...`)
        for (let i = 0; i < 3; i++) {
          const label = ['a', 'b', 'c'][i]
          const imageResult = await generateImage(
            imgPrompts[i],
            `${jobDir}/image_${label}.png`,
            openaiKey,
            video_format,
            { campaignId, jobId, imageName: `image_${label}.png` }
          )
          if (imageResult.r2Url) imageUrls.push(imageResult.r2Url)
        }

        config = buildDynamicConfig(jobId, { headline, bodyCopy, service, cta, musicFile })
        config.campaignId = campaignId
        config.format = video_format || '9:16' // Pass format to Python script
        config.outroCard = outroCard || null
        // DEBUG: Log background music path
        console.log('[DEBUG MUSIC] backgroundMusic path:', config?.backgroundMusic)
        configPath = `${jobDir}/config.json`
        fs.writeFileSync(configPath, JSON.stringify(config, null, 2))
        console.log(`[job-queue] Config written → ${configPath}`)
      }

      activeJobs.set(jobId, { startTime: activeJobs.get(jobId)?.startTime, status: 'rendering' })

      // Spawn Python renderer as detached background process
      const child = spawn('python3', [SCRIPT_PATH, configPath], {
        detached: true,
        stdio: 'ignore',
      })
      child.unref()
      console.log(`[job-queue] Python renderer spawned for job ${jobId}`)

      // Poll for completion and notify Netlify when done
      const pollInterval = setInterval(async () => {
        const outputFile = `${OUTPUT_DIR}/${jobId}/output.mp4`
        if (fs.existsSync(outputFile)) {
          clearInterval(pollInterval)
          console.log(`[job-queue] Video completed for job ${jobId}`)

          let videoUrl = `http://139.59.212.218:3002/videos/${jobId}/output.mp4`

          // Upload to Cloudflare R2 if credentials available
          if (process.env.R2_ENDPOINT && process.env.R2_ACCESS_KEY_ID && process.env.R2_SECRET_ACCESS_KEY) {
            try {
              console.log(`[job-queue] Uploading video to R2 for job ${jobId}...`)
              
              // Wait for file to be fully written (Python renderer may still be writing)
              const fileReady = await waitForFile(outputFile)
              if (!fileReady) {
                console.warn(`[job-queue] Video file ${outputFile} is suspiciously small, but attempting upload anyway`)
              }
              
              const r2 = new S3Client({
                region: 'auto',
                endpoint: process.env.R2_ENDPOINT,
                credentials: {
                  accessKeyId: process.env.R2_ACCESS_KEY_ID,
                  secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
                },
              })

              const fileBuffer = fs.readFileSync(outputFile)
              const r2Key = `videos/${jobId}/output.mp4`

              await r2.send(
                new PutObjectCommand({
                  Bucket: process.env.R2_BUCKET_NAME || 'contentforge-assets',
                  Key: r2Key,
                  Body: fileBuffer,
                  ContentType: 'video/mp4',
                })
              )

              const r2Url = `${process.env.R2_PUBLIC_URL}/videos/${jobId}/output.mp4`

              // Verify file is accessible before notifying frontend (R2 eventual consistency)
              let r2Ready = false
              for (let attempt = 1; attempt <= 10; attempt++) {
                try {
                  const check = await fetch(r2Url, { method: 'HEAD' })
                  if (check.ok) { r2Ready = true; console.log(`[job-queue] R2 accessible after ${attempt} attempt(s)`); break }
                } catch (_) {}
                console.log(`[job-queue] R2 not ready yet (attempt ${attempt}/10), retrying in 2s...`)
                await new Promise(r => setTimeout(r, 2000))
              }

              videoUrl = r2Ready ? r2Url : videoUrl
              console.log(`[job-queue] Video URL: ${videoUrl}`)
              // Mark job done in memory only after R2 is confirmed accessible
              activeJobs.set(jobId, { startTime: activeJobs.get(jobId)?.startTime, status: 'done', videoUrl })
            } catch (r2Err) {
              console.error(`[job-queue] R2 upload failed for job ${jobId}:`, r2Err.message)
              console.log(`[job-queue] Falling back to droplet URL for job ${jobId}`)
            }
          }

          // Notify Netlify that job is complete
          try {
            const webhookUrl = 'https://contentforge-610.netlify.app/api/productions/complete'
            console.log(`[job-queue] Calling webhook: ${webhookUrl}`)

            // Collect all generated assets
            const generatedAssets = {
              jobId,
              videoUrl, // R2 video URL
              imageUrls: imageUrls || [], // R2 image URLs
              service,
              campaignId,
              productId, // Include productId for asset bank filtering
            }

            const response = await fetch(webhookUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(generatedAssets),
            })

            if (!response.ok) {
              throw new Error(`Webhook failed: ${response.status}`)
            }

            console.log(`[job-queue] Webhook completed for job ${jobId}`)
          } catch (err) {
            console.error(`[job-queue] Webhook error for job ${jobId}:`, err.message)
          }
        }
      }, 5000) // Poll every 5 seconds
    } catch (err) {
      console.error(`[job-queue] Asset generation failed for job ${jobId}:`, err.message)
      activeJobs.set(jobId, {
        startTime: activeJobs.get(jobId)?.startTime,
        status: 'failed',
        error: err.message,
      })
    }
  })
})

// GET /jobs/:jobId — check job status
router.get('/:jobId', (req, res) => {
  const { jobId } = req.params

  const job = activeJobs.get(jobId)
  if (job) {
    // If done, include videoUrl so frontend gets the confirmed R2 URL
    if (job.status === 'done') {
      return res.json({ jobId, status: 'done', videoUrl: job.videoUrl })
    }
    return res.json({ jobId, status: job.status, error: job.error || undefined })
  }

  // Fallback: if job not in memory (server restart), check disk
  const outputFile = `${OUTPUT_DIR}/${jobId}/output.mp4`
  if (fs.existsSync(outputFile)) {
    const r2VideoUrl = (process.env.R2_PUBLIC_URL || 'https://pub-5dcdfe9305a740febc87568c9ccb40a6.r2.dev') + '/videos/' + jobId + '/output.mp4'
    return res.json({ jobId, status: 'done', videoUrl: r2VideoUrl })
  }

  res.json({ jobId, status: 'not_found' })
})


// ─── Scheduled Publishing Cron ────────────────────────────────────────────────

const NETLIFY_BASE = 'https://contentforge-610.netlify.app'
const CRON_SECRET = process.env.CRON_SECRET

function runScheduledPublisher() {
  if (!CRON_SECRET) {
    console.warn('[scheduler] CRON_SECRET not set, skipping scheduled publishing')
    return
  }
  fetch(`${NETLIFY_BASE}/api/cron/publish-scheduled`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${CRON_SECRET}`,
    },
  })
    .then((res) => res.json())
    .then((data) => {
      if (data.processed > 0) {
        console.log(`[scheduler] Processed ${data.processed} scheduled publication(s)`)
      }
    })
    .catch((err) => console.error('[scheduler] Cron error:', err.message))
}

// Run every minute
setInterval(runScheduledPublisher, 60 * 1000)
console.log('[scheduler] Scheduled publisher started (every 60s)')


// ─── Radio Ad Jobs ────────────────────────────────────────────────────────────
// Pipeline: ElevenLabs TTS → optional ffmpeg music mix → R2 (MP3)

const radioJobs = new Map()

async function processRadioJob(jobId, script, voiceId, productId, campaignId, musicFile, jingleFile, audioSegmentUrls = null, emotion = 'nøytral') {
  const apiKeys = loadApiKeys()
  const elevenKey = apiKeys.ELEVENLABS_API_KEY || process.env.ELEVENLABS_API_KEY

  radioJobs.set(jobId, { status: 'generating', startTime: Date.now() })

  try {
    // Step 1: Audio — use pre-generated segments if provided, else ElevenLabs TTS
    const voicePath = `/tmp/radio_voice_${jobId}.mp3`
    if (audioSegmentUrls && audioSegmentUrls.length > 0) {
      console.log(`[radio] Using ${audioSegmentUrls.length} pre-generated audio segments`)
      const segPaths = []
      for (let i = 0; i < audioSegmentUrls.length; i++) {
        const segPath = `/tmp/radio_seg_${jobId}_${i}.mp3`
        await downloadFile(audioSegmentUrls[i], segPath)
        segPaths.push(segPath)
      }
      const concatList = `/tmp/radio_concat_${jobId}.txt`
      fs.writeFileSync(concatList, segPaths.map(p => `file '${p}'`).join('\n'))
      await execAsync(`ffmpeg -y -f concat -safe 0 -i "${concatList}" -c:a libmp3lame -q:a 2 "${voicePath}"`, { timeout: 120_000 })
      for (const p of segPaths) { try { fs.unlinkSync(p) } catch (_) {} }
      console.log(`[radio] Pre-generated audio assembled → ${voicePath}`)
    } else {
      await generateAvatarVoiceover(script, voiceId, voicePath, elevenKey, emotion)
    }

    // Step 2: Mix music if provided
    let finalAudioPath = voicePath
    if (musicFile) {
      const musicPath = path.join(MUSIC_DIR, musicFile)
      if (fs.existsSync(musicPath)) {
        const mixedPath = `/tmp/radio_mixed_${jobId}.mp3`
        try {
          const ffmpegCmd = `ffmpeg -i "${voicePath}" -stream_loop -1 -i "${musicPath}" ` +
            `-filter_complex "[1:a]volume=0.15[music];[0:a][music]amix=inputs=2:duration=first:dropout_transition=3[aout]" ` +
            `-map "[aout]" -c:a libmp3lame -q:a 2 "${mixedPath}" -y`
          await execAsync(ffmpegCmd, { timeout: 120_000 })
          finalAudioPath = mixedPath
          console.log(`[radio] Music mixed → ${mixedPath}`)
        } catch (ffErr) {
          console.warn(`[radio] ffmpeg mix failed (using voice only):`, ffErr.message)
        }
      } else {
        console.warn(`[radio] Music file not found: ${musicPath}`)
      }
    }

    // Step 3: Append jingle at end if provided
    if (jingleFile) {
      const jinglePath = path.join(MUSIC_DIR, jingleFile)
      if (fs.existsSync(jinglePath)) {
        const jingledPath = `/tmp/radio_jingled_${jobId}.mp3`
        try {
          const ffmpegCmd = `ffmpeg -i "${finalAudioPath}" -i "${jinglePath}" ` +
            `-filter_complex "[0:a]loudnorm=I=-16:TP=-1.5:LRA=11[voice];[1:a]loudnorm=I=-16:TP=-1.5:LRA=11[jingle];[voice][jingle]concat=n=2:v=0:a=1[aout]" ` +
            `-map "[aout]" -c:a libmp3lame -q:a 2 "${jingledPath}" -y`
          await execAsync(ffmpegCmd, { timeout: 120_000 })
          finalAudioPath = jingledPath
          console.log(`[radio] Jingle appended → ${jingledPath}`)
        } catch (ffErr) {
          console.warn(`[radio] ffmpeg jingle concat failed:`, ffErr.message)
        }
      } else {
        console.warn(`[radio] Jingle file not found: ${jinglePath}`)
      }
    }

    // Step 4: Upload to R2
    const audioBuffer = fs.readFileSync(finalAudioPath)
    const r2Key = `radio/${jobId}/output.mp3`
    const audioUrl = await uploadBufferToR2(audioBuffer, r2Key, 'audio/mpeg')
    for (const p of [voicePath, `/tmp/radio_mixed_${jobId}.mp3`, `/tmp/radio_jingled_${jobId}.mp3`]) {
      try { fs.unlinkSync(p) } catch (_) {}
    }
    console.log(`[radio] Audio uploaded → ${audioUrl}`)

    // Step 4: Webhook
    radioJobs.set(jobId, { status: 'done', audioUrl, startTime: Date.now() })
    const webhookRes = await fetch('https://contentforge-610.netlify.app/api/productions/complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jobId, videoUrl: audioUrl, imageUrls: [], service: 'radio', campaignId, productId }),
    })
    if (!webhookRes.ok) {
      console.error(`[radio] Webhook failed: ${webhookRes.status}`)
    } else {
      console.log(`[radio] Webhook OK for job ${jobId}`)
    }
  } catch (err) {
    console.error(`[radio] Job ${jobId} failed:`, err.message)
    radioJobs.set(jobId, { status: 'failed', error: err.message })
    try {
      await fetch('https://contentforge-610.netlify.app/api/productions/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId, videoUrl: null, imageUrls: [], service: 'radio', campaignId, productId, error: err.message }),
      })
    } catch (_) {}
  }
}

router.post('/radio-jobs', (req, res) => {
  const { jobId, script, voiceId, productId, campaignId, musicFile, jingleFile, audioSegmentUrls, emotion } = req.body
  if (!jobId || !script) {
    return res.status(400).json({ error: 'jobId and script are required' })
  }
  const voice = voiceId || 'nPczCjzI2devNBz1zQrb'
  console.log(`[radio] Job received: ${jobId}, voice=${voice}, segments=${audioSegmentUrls ? audioSegmentUrls.length : 0}`)
  radioJobs.set(jobId, { status: 'queued', startTime: Date.now() })
  res.json({ jobId, status: 'queued' })
  processRadioJob(jobId, script, voice, productId, campaignId, musicFile, jingleFile, audioSegmentUrls || null, emotion || 'nøytral').catch(err => {
    console.error(`[radio] Unhandled error for ${jobId}:`, err.message)
  })
})

router.get('/radio-jobs/:jobId', (req, res) => {
  const { jobId } = req.params
  const job = radioJobs.get(jobId)
  if (!job) return res.json({ jobId, status: 'not_found' })
  if (job.status === 'done') return res.json({ jobId, status: 'done', audioUrl: job.audioUrl })
  return res.json({ jobId, status: job.status, error: job.error || undefined })
})

module.exports = router

// ─── Avatar Video Jobs ────────────────────────────────────────────────────────
// Pipeline: ElevenLabs TTS → fal.ai VEED Fabric 1.0 → R2
// Fallback: if fal.ai fails, use audio URL as final output

const avatarJobs = new Map()

const EMOTION_PRESETS = {
  'nøytral':      { stability: 0.50, style: 0.00, similarity_boost: 0.75 },
  'entusiastisk': { stability: 0.30, style: 0.75, similarity_boost: 0.75 },
  'glad':         { stability: 0.40, style: 0.50, similarity_boost: 0.75 },
  'trist':        { stability: 0.70, style: 0.20, similarity_boost: 0.75 },
  'nølende':      { stability: 0.20, style: 0.35, similarity_boost: 0.70 },
  'rolig':        { stability: 0.80, style: 0.00, similarity_boost: 0.75 },
  'dramatisk':    { stability: 0.25, style: 0.85, similarity_boost: 0.75 },
}

async function generateAvatarVoiceover(script, voiceId, outputPath, apiKey, emotion = 'nøytral') {
  const voiceSettings = EMOTION_PRESETS[emotion] || EMOTION_PRESETS['nøytral']
  const bodyBuffer = Buffer.from(JSON.stringify({ text: script, model_id: 'eleven_turbo_v2_5', language_code: 'no', apply_text_normalization: 'off', voice_settings: voiceSettings }))
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const { statusCode, body } = await httpsPost(
        'api.elevenlabs.io',
        `/v1/text-to-speech/${voiceId}`,
        {
          'xi-api-key': apiKey,
          'Content-Type': 'application/json',
          Accept: 'audio/mpeg',
        },
        bodyBuffer
      )
      if (statusCode !== 200) {
        throw new Error(`ElevenLabs ${statusCode}: ${body.toString('utf8').slice(0, 200)}`)
      }
      fs.writeFileSync(outputPath, body)
      console.log(`[avatar] Voiceover saved → ${outputPath}`)
      return outputPath
    } catch (err) {
      console.error(`[avatar] ElevenLabs attempt ${attempt}/3 failed:`, err.message)
      if (attempt < 3) await new Promise(r => setTimeout(r, attempt * 2000))
      else throw err
    }
  }
}

async function uploadBufferToR2(buffer, r2Key, contentType) {
  const r2 = new S3Client({
    region: 'auto',
    endpoint: process.env.R2_ENDPOINT,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    },
  })
  await r2.send(new PutObjectCommand({
    Bucket: process.env.R2_BUCKET_NAME || 'contentforge-assets',
    Key: r2Key,
    Body: buffer,
    ContentType: contentType,
  }))
  return `${process.env.R2_PUBLIC_URL}/${r2Key}`
}

async function processAvatarJob(jobId, script, avatarImageUrl, voiceId, productId, campaignId, musicFile, outroCard, audioSegmentUrls = null, emotion = 'nøytral') {
  const apiKeys = loadApiKeys()
  const elevenKey = apiKeys.ELEVENLABS_API_KEY || process.env.ELEVENLABS_API_KEY
  const falKey = process.env.FAL_API_KEY

  avatarJobs.set(jobId, { status: 'generating', startTime: Date.now() })

  try {
    // Step 1: ElevenLabs TTS → mp3 (or assemble pre-generated segments)
    const audioPath = `/tmp/avatar_audio_${jobId}.mp3`
    if (audioSegmentUrls && audioSegmentUrls.length > 0) {
      console.log(`[avatar] Using ${audioSegmentUrls.length} pre-generated audio segments`)
      const segPaths = []
      for (let i = 0; i < audioSegmentUrls.length; i++) {
        const segPath = `/tmp/avatar_seg_${jobId}_${i}.mp3`
        await downloadFile(audioSegmentUrls[i], segPath)
        segPaths.push(segPath)
      }
      if (segPaths.length === 1) {
        fs.copyFileSync(segPaths[0], audioPath)
      } else {
        const concatList = `/tmp/avatar_concat_${jobId}.txt`
        fs.writeFileSync(concatList, segPaths.map(p => `file '${p}'`).join('\n'))
        await execAsync(`ffmpeg -f concat -safe 0 -i "${concatList}" -c copy "${audioPath}" -y`, { timeout: 60_000 })
      }
      console.log(`[avatar] Pre-generated audio assembled → ${audioPath}`)
    } else {
      await generateAvatarVoiceover(script, voiceId, audioPath, elevenKey, emotion)
    }

    // Step 2: Upload audio to R2
    const audioBuffer = fs.readFileSync(audioPath)
    const audioR2Key = `avatars/${jobId}/audio.mp3`
    const audioUrl = await uploadBufferToR2(audioBuffer, audioR2Key, 'audio/mpeg')
    fs.unlinkSync(audioPath)
    console.log(`[avatar] Audio uploaded → ${audioUrl}`)

    // Step 3: fal.ai VEED Fabric 1.0 — submit job
    let videoUrl = audioUrl // fallback: return audio if fal.ai fails
    if (falKey) {
      try {
        const submitRes = await fetch('https://queue.fal.run/veed/fabric-1.0', {
          method: 'POST',
          headers: {
            Authorization: `Key ${falKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ image_url: avatarImageUrl, audio_url: audioUrl, resolution: "720p" }),
        })
        if (!submitRes.ok) {
          const errText = await submitRes.text()
          throw new Error(`fal.ai submit ${submitRes.status}: ${errText.slice(0, 200)}`)
        }
        const { request_id } = await submitRes.json()
        console.log(`[avatar] fal.ai job submitted, request_id=${request_id}`)

        avatarJobs.set(jobId, { status: 'rendering', startTime: Date.now() })

        // Step 4: Poll status endpoint (max 60 × 5s = 5 min).
        // fal.ai: use /status suffix to poll, then fetch result from response_url when COMPLETED.
        let falVideoUrl = null
        let responseUrl = null
        for (let i = 0; i < 120; i++) {
          await new Promise(r => setTimeout(r, 10000))
          const pollRes = await fetch(`https://queue.fal.run/veed/fabric-1.0/requests/${request_id}/status`, {
            headers: { Authorization: `Key ${falKey}` },
          })
          const poll = await pollRes.json()
          console.log(`[avatar] fal.ai poll ${i + 1}/120: status=${poll.status}`)
          if (poll.status === 'COMPLETED') {
            responseUrl = poll.response_url || `https://queue.fal.run/veed/fabric-1.0/requests/${request_id}`
            break
          }
          if (poll.status === 'FAILED') {
            console.warn(`[avatar] fal.ai FAILED for request_id=${request_id}`)
            break
          }
        }
        if (responseUrl) {
          const resultRes = await fetch(responseUrl, { headers: { Authorization: `Key ${falKey}` } })
          const result = await resultRes.json()
          falVideoUrl = result.video?.url || result.output?.video?.url || result.output?.url || null
          console.log(`[avatar] fal.ai result video URL: ${falVideoUrl}`)
        }

        if (falVideoUrl) {
          // Step 5: Download fal.ai video
          console.log(`[avatar] Downloading fal.ai video from ${falVideoUrl}`)
          const videoPath = `/tmp/avatar_video_${jobId}.mp4`
          await downloadFile(falVideoUrl, videoPath)
          // Fabric leverer stille tale (~-33 dB) -> normaliser til standard talenivaa
          // saa musikk/jingle-balansen stemmer og videoen ikke er lav totalt.
          try {
            const normPath = videoPath.replace(/\.mp4$/, "_norm.mp4")
            await execAsync(`ffmpeg -y -i "${videoPath}" -c:v copy -af "loudnorm=I=-16:TP=-1.5:LRA=11" -c:a aac -ar 44100 "${normPath}"`, { timeout: 120_000 })
            fs.renameSync(normPath, videoPath)
            console.log("[avatar] Voice loudness normalized (-16 LUFS)")
          } catch (nErr) {
            console.warn("[avatar] loudnorm hoppet over:", nErr.message)
          }

          // Detect native fal.ai video dimensions so we can preserve them end-to-end
          let falW = 960, falH = 960
          try {
            const { stdout: probeOut } = await execAsync(`ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=p=0 "${videoPath}"`)
            const parts = probeOut.trim().split(',').map(Number)
            if (parts.length === 2 && parts[0] > 0 && parts[1] > 0) { falW = parts[0]; falH = parts[1] }
            console.log(`[avatar] fal.ai video dimensions: ${falW}x${falH}`)
          } catch (e) { console.warn('[avatar] ffprobe failed:', e.message) }

          // Step 5a: Burn URL banner overlay if configured
          let finalVideoPath = videoPath
          if (outroCard && outroCard.url && outroCard.urlBanner) {
            const overlayPath = `/tmp/avatar_overlay_${jobId}.mp4`
            try {
              const displayUrl = outroCard.url.replace(/^https?:\/\//, '').replace(/\/$/, '')
              const fontFile = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
              const ffmpegOverlay = `ffmpeg -i "${videoPath}" -vf "drawtext=fontfile='${fontFile}':text='${displayUrl.replace(/'/g, "\\'")}':fontsize=42:fontcolor=white:borderw=3:bordercolor=black:x=(w-text_w)/2:y=h-100" -c:a copy "${overlayPath}" -y`
              await execAsync(ffmpegOverlay, { timeout: 120_000 })
              finalVideoPath = overlayPath
              console.log(`[avatar] URL overlay added → ${overlayPath}`)
            } catch (overlayErr) {
              console.warn(`[avatar] URL overlay failed (skipping):`, overlayErr.message)
            }
          }

          // Step 5b: Mix background music if provided
          if (musicFile) {
            const musicPath = path.join(MUSIC_DIR, musicFile)
            if (fs.existsSync(musicPath)) {
              const mixedPath = `/tmp/avatar_mixed_${jobId}.mp4`
              try {
                const ffmpegCmd = `ffmpeg -i "${videoPath}" -stream_loop -1 -i "${musicPath}" ` +
                  `-filter_complex "[1:a]volume=0.12[music];[0:a][music]amix=inputs=2:duration=first:dropout_transition=3[aout]" ` +
                  `-map 0:v -map "[aout]" -c:v copy -c:a aac -shortest "${mixedPath}" -y`
                await execAsync(ffmpegCmd, { timeout: 120_000 })
                finalVideoPath = mixedPath
                console.log(`[avatar] Music mixed → ${mixedPath}`)
              } catch (ffErr) {
                console.warn(`[avatar] ffmpeg music mix failed (using unmixed video):`, ffErr.message)
              }
            } else {
              console.warn(`[avatar] Music file not found: ${musicPath}`)
            }
          }

          // Step 5c: Append outro card if configured (skip if durationSeconds=0, e.g. only urlBanner was set)
          if (outroCard && (outroCard.durationSeconds || 0) > 0) {
            const outroInputPath = finalVideoPath
            const outroOutputPath = `/tmp/avatar_outro_${jobId}.mp4`
            try {
              let jinglePath = null
              if (outroCard.jingleFile) {
                const candidate = path.join(MUSIC_DIR, outroCard.jingleFile)
                if (fs.existsSync(candidate)) jinglePath = candidate
                else console.warn(`[avatar] Jingle file not found: ${candidate}`)
              }
              const outroConfig = JSON.stringify({ ...outroCard, width: falW, height: falH, ...(jinglePath ? { jinglePath } : {}) })
              console.log(`[avatar] outroCard config: ${outroConfig}`)
              const { stdout: outroStdout, stderr: outroStderr } = await execAsync(
                `python3 /root/.openclaw/workspace/reforhandle-content/render_outro_standalone.py '${outroConfig.replace(/'/g, "'\\''")}' "${outroInputPath}" "${outroOutputPath}"`,
                { timeout: 60_000 }
              )
              if (outroStdout) console.log(`[avatar] outro stdout: ${outroStdout.trim()}`)
              if (outroStderr) console.log(`[avatar] outro stderr: ${outroStderr.trim()}`)
              finalVideoPath = outroOutputPath
              console.log(`[avatar] Outro appended → ${outroOutputPath}`)
            } catch (outroErr) {
              console.warn(`[avatar] Outro render failed (using video without outro):`, outroErr.message)
              if (outroErr.stdout) console.log(`[avatar] outro stdout: ${outroErr.stdout.trim()}`)
              if (outroErr.stderr) console.log(`[avatar] outro stderr: ${outroErr.stderr.trim()}`)
            }
          }

          // Step 6: Upload to R2
          const videoBuffer = fs.readFileSync(finalVideoPath)
          const videoR2Key = `avatars/${jobId}/output.mp4`
          videoUrl = await uploadBufferToR2(videoBuffer, videoR2Key, 'video/mp4')
          for (const p of [videoPath, `/tmp/avatar_mixed_${jobId}.mp4`]) {
            try { fs.unlinkSync(p) } catch (_) {}
          }
          console.log(`[avatar] Video uploaded → ${videoUrl}`)
        } else {
          console.warn(`[avatar] fal.ai did not produce video — falling back to audio URL`)
        }
      } catch (falErr) {
        console.error(`[avatar] fal.ai error (using audio fallback):`, falErr.message)
      }
    } else {
      console.warn(`[avatar] FAL_API_KEY not set — skipping video generation, returning audio`)
    }

    // Step 6: Notify Netlify webhook
    avatarJobs.set(jobId, { status: 'done', videoUrl, startTime: Date.now() })
    const webhookUrl = 'https://contentforge-610.netlify.app/api/productions/complete'
    const webhookRes = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jobId, videoUrl, imageUrls: [], service: 'avatar', campaignId, productId }),
    })
    if (!webhookRes.ok) {
      console.error(`[avatar] Webhook failed: ${webhookRes.status}`)
    } else {
      console.log(`[avatar] Webhook OK for job ${jobId}, videoUrl=${videoUrl}`)
    }
  } catch (err) {
    console.error(`[avatar] Job ${jobId} failed:`, err.message)
    avatarJobs.set(jobId, { status: 'failed', error: err.message })
    try {
      await fetch('https://contentforge-610.netlify.app/api/productions/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId, videoUrl: null, imageUrls: [], service: 'avatar', campaignId, productId, error: err.message }),
      })
    } catch (_) {}
  }
}

router.post('/avatar-jobs', (req, res) => {
  const { jobId, script, avatarImageUrl, voiceId, productId, campaignId, musicFile, outroCard, audioSegmentUrls, emotion } = req.body
  if (!jobId || !script || !avatarImageUrl) {
    return res.status(400).json({ error: 'jobId, script and avatarImageUrl are required' })
  }
  const voice = voiceId || 'nPczCjzI2devNBz1zQrb'
  console.log(`[avatar] Job received: ${jobId}, voice=${voice}, avatarImageUrl=${avatarImageUrl.slice(0, 120)}, segments=${audioSegmentUrls ? audioSegmentUrls.length : 0}`)
  avatarJobs.set(jobId, { status: 'queued', startTime: Date.now() })
  res.json({ jobId, status: 'queued' })
  // Background — not awaited
  processAvatarJob(jobId, script, avatarImageUrl, voice, productId, campaignId, musicFile, outroCard || null, audioSegmentUrls || null, emotion || 'nøytral').catch(err => {
    console.error(`[avatar] Unhandled background error for ${jobId}:`, err.message)
  })
})

router.get('/avatar-jobs/:jobId', (req, res) => {
  const { jobId } = req.params
  const job = avatarJobs.get(jobId)
  if (!job) return res.json({ jobId, status: 'not_found' })
  if (job.status === 'done') return res.json({ jobId, status: 'done', videoUrl: job.videoUrl })
  return res.json({ jobId, status: job.status, error: job.error || undefined })
})


