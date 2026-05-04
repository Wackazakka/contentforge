require('dotenv').config()
const express = require('express')
const { spawn } = require('child_process')
const fs = require('fs')
const path = require('path')
const https = require('https')
const crypto = require('crypto')
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3')

const SCRIPT_PATH = '/root/.openclaw/workspace/reforhandle-content/make_tiktok_reforhandle.py'
const OUTPUT_DIR = '/root/.openclaw/workspace/contentforge-output'
const ENV_PATH = '/opt/reforhandle/.env.local'

const DEFAULT_VOICE_ID = 'nPczCjzI2devNBz1zQrb' // Brian (multilingual, supports Norwegian)

// Wait for file to stabilize (stop growing for 2 seconds)
async function waitForFile(filePath, maxAttempts = 30) {
  let lastSize = 0
  let stableCount = 0
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise(r => setTimeout(r, 2000))
    const stats = fs.statSync(filePath)
    if (stats.size > 0 && stats.size === lastSize) {
      stableCount++
      if (stableCount >= 3) { // stable for 6 seconds (3 × 2s checks)
        console.log(`[job-queue] File ${path.basename(filePath)} stable at ${stats.size} bytes after ${i + 1} attempt(s)`)
        return true
      }
    } else {
      stableCount = 0
    }
    lastSize = stats.size
    console.log(`[job-queue] File ${path.basename(filePath)} is ${stats.size} bytes (stable: ${stableCount}/3), waiting... (attempt ${i + 1}/${maxAttempts})`)
  }
  console.warn(`[job-queue] File ${path.basename(filePath)} did not stabilize after ${maxAttempts} attempts`)
  return false
}

// In-memory registry of active jobs (survives for lifetime of this process)
const activeJobs = new Map()

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

// Call ElevenLabs text-to-speech, save mp3 to outputPath — retries up to 3x
async function generateVoiceover(text, voiceId, outputPath, apiKey) {
  const bodyBuffer = Buffer.from(
    JSON.stringify({
      text,
      model_id: 'eleven_turbo_v2_5',
      language_code: 'no',
      voice_settings: {
        stability: 0.5,
        similarity_boost: 0.75,
      },
    })
  )

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

// Call DALL-E 3, download the returned image URL to outputPath
// dalleSize format: '9:16' (1024x1792), '1:1' (1024x1024), '16:9' (1792x1024)
const DALLE_SIZES = {
  '9:16': '1024x1792',
  '1:1': '1024x1024',
  '16:9': '1792x1024',
}

async function generateImage(prompt, outputPath, apiKey, format = '9:16', r2UploadInfo = null) {
  const dalleSize = DALLE_SIZES[format] || '1024x1792'
  const bodyBuffer = Buffer.from(
    JSON.stringify({
      model: 'dall-e-3',
      prompt,
      n: 1,
      size: dalleSize,
      quality: 'standard',
    })
  )

  const { statusCode, body } = await httpsPost(
    'api.openai.com',
    '/v1/images/generations',
    {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    bodyBuffer
  )

  if (statusCode !== 200) {
    throw new Error(
      `DALL-E 3 returned ${statusCode}: ${body.toString('utf8').slice(0, 200)}`
    )
  }

  const json = JSON.parse(body.toString('utf8'))
  const imageUrl = json.data[0].url
  await downloadFile(imageUrl, outputPath)
  console.log(`[job-queue] Image saved → ${outputPath}`)

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
    ? path.join(MUSIC_DIR, path.basename(musicFile))
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
    musicFile,
    segments,
    video_format,
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
        // STORYTELLING MODE: Use segments directly
        console.log(`[job-queue] Storytelling mode: Processing ${segments.length} segments for job ${jobId}...`)
        for (let i = 0; i < segments.length; i++) {
          const segment = segments[i]
          console.log(`[job-queue] Segment ${i + 1}: "${segment.text.slice(0, 50)}..."`)
          
          // Generate voiceover from segment text
          await generateVoiceover(segment.text, vid, `${jobDir}/vo_${i + 1}.mp3`, elevenKey)
          
          // Generate image from segment imagePrompt and upload to R2
          const imageResult = await generateImage(
            segment.imagePrompt,
            `${jobDir}/image_${i + 1}.png`,
            openaiKey,
            video_format,
            { campaignId, jobId, imageName: `image_${i + 1}.png` }
          )
          if (imageResult.r2Url) imageUrls.push(imageResult.r2Url)
        }

        // Write segments to config for Python renderer (storytelling format)
        config = {
          segments: segments.map((seg, i) => ({
            bg: `${jobDir}/image_${i + 1}.png`,
            vo_path: `${jobDir}/vo_${i + 1}.mp3`,
            lines: [{ text: seg.text, size: 48, bold: true, color: '#ffffff' }],
            sub: null,
          })),
          output: `${jobDir}/output.mp4`,
          backgroundMusic: musicFile || '/root/.openclaw/workspace/contentforge-server/music/spor1-upbeat.mp3',
          format: video_format || '9:16', // Pass format to Python script
          jobId,
          campaignId,
          service,
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

              // Keep videoUrl as droplet URL for asset_banks (R2 upload is just backup)
              // videoUrl = `${process.env.R2_PUBLIC_URL}/videos/${jobId}/output.mp4`
              console.log(`[job-queue] Video uploaded to R2 (backup), using droplet URL for asset_banks`)
            } catch (r2Err) {
              console.error(`[job-queue] R2 upload failed for job ${jobId}:`, r2Err.message)
              // Fallback to droplet URL if R2 fails
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

// GET /jobs/:jobId — check job status by presence of output file
router.get('/:jobId', (req, res) => {
  const { jobId } = req.params
  const outputFile = `${OUTPUT_DIR}/${jobId}/output.mp4`

  if (fs.existsSync(outputFile)) {
    activeJobs.delete(jobId)
    return res.json({ jobId, status: 'done', videoUrl: `http://139.59.212.218:3002/videos/${jobId}/output.mp4` })
  }

  const job = activeJobs.get(jobId)
  if (job) {
    return res.json({ jobId, status: job.status, error: job.error || undefined })
  }

  res.json({ jobId, status: 'not_found' })
})

module.exports = router
