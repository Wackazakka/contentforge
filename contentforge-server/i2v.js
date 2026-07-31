// i2v.js — image-to-video via fal.ai (PixVerse default, Kling premium)
// Brukes av job-queue: gjør et stillbilde om til et kort videoklipp med bevegelse.
'use strict'
const fs = require('fs')
const { execFile } = require('child_process')

const FAL_KEY = process.env.CONTENTFORGE_FAL_KEY
const QUEUE = 'https://queue.fal.run'

const ff = (cmd, args) => new Promise((resolve, reject) =>
  execFile(cmd, args, { maxBuffer: 16 * 1024 * 1024 }, (err, stdout, stderr) =>
    err ? reject(new Error((stderr || err.message).slice(-400))) : resolve(stdout)))

async function probeSeconds(file) {
  const out = await ff('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file])
  const s = parseFloat(String(out).trim())
  return Number.isFinite(s) ? s : 0
}

// Siste bilde i et klipp -> PNG (frøet for neste ledd i kjeden)
async function extractLastFrame(clipPath, outPng) {
  await ff('ffmpeg', ['-y', '-sseof', '-0.15', '-i', clipPath, '-frames:v', '1', '-update', '1', '-q:v', '2', outPng])
  return outPng
}

// Skjøt klipp sømløst: alle skaleres/beskjæres til første klipps mål og
// felles fps, så concat-filteret aldri snubler i blandede kilder.
async function concatClips(paths, outPath) {
  const dims = await ff('ffprobe', ['-v', 'error', '-select_streams', 'v:0',
    '-show_entries', 'stream=width,height', '-of', 'csv=p=0', paths[0]])
  const [w, h] = String(dims).trim().split(',').map(Number)
  if (!w || !h) throw new Error('fant ikke dimensjoner for concat')
  const inputs = []
  const filters = []
  paths.forEach((p, i) => {
    inputs.push('-i', p)
    filters.push(`[${i}:v]scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h},fps=24,setsar=1[v${i}]`)
  })
  const fc = filters.join(';') + ';' + paths.map((_, i) => `[v${i}]`).join('')
    + `concat=n=${paths.length}:v=1:a=0[out]`
  await ff('ffmpeg', ['-y', ...inputs, '-filter_complex', fc, '-map', '[out]',
    '-c:v', 'libx264', '-preset', 'fast', '-crf', '20', '-pix_fmt', 'yuv420p', '-an', outPath])
  return outPath
}

// Motor -> fal modell-ID for image-to-video
const MODELS = {
  pixverse: 'fal-ai/pixverse/v5/image-to-video',
  kling: 'fal-ai/kling-video/v2.1/standard/image-to-video',
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function downloadTo(url, outPath) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`nedlasting feilet ${res.status}`)
  const buf = Buffer.from(await res.arrayBuffer())
  fs.writeFileSync(outPath, buf)
  return outPath
}

/**
 * Lag et videoklipp fra ett stillbilde.
 * @param {object} o
 * @param {string} o.imageUrl   Offentlig URL til stillbildet (R2)
 * @param {string} o.prompt     Bevegelsesbeskrivelse
 * @param {string} [o.engine]   'pixverse' (default) | 'kling'
 * @param {number} [o.durationSec] 5 (default) | 8
 * @param {string} [o.resolution]  '360p'|'540p'|'720p'(default)|'1080p'
 * @param {string} o.outPath     Lokal filsti for klippet (.mp4)
 * @param {function} [o.log]
 * @returns {Promise<string>} outPath
 */
async function imageToVideoClip(o) {
  const { imageUrl, prompt, engine = 'pixverse', durationSec = 5, resolution = '720p', outPath, log = console.log, negativePrompt } = o
  if (!FAL_KEY) throw new Error('CONTENTFORGE_FAL_KEY mangler i env')
  if (!imageUrl) throw new Error('imageUrl mangler')
  const model = MODELS[engine] || MODELS.pixverse
  const auth = { Authorization: `Key ${FAL_KEY}` }

  // PixVerse bruker duration som streng ("5"/"8"); Kling bruker tall-sekunder.
  // Begge stoetter negative_prompt (Kling fikk den foerst 31/7 — munnjakten).
  const neg = negativePrompt || 'talking, speaking, singing, moving lips, lip movement, mouth opening and closing, conversation'
  const body = engine === 'kling'
    ? { image_url: imageUrl, prompt, duration: String(durationSec), negative_prompt: neg }
    : { image_url: imageUrl, prompt, duration: String(durationSec), resolution, negative_prompt: neg }

  // 1) Submit til køen
  const submitRes = await fetch(`${QUEUE}/${model}`, {
    method: 'POST',
    headers: { ...auth, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const submit = await submitRes.json().catch(() => ({}))
  if (!submitRes.ok || !submit.request_id) {
    throw new Error(`fal submit feilet (${submitRes.status}): ${JSON.stringify(submit)}`)
  }
  const statusUrl = submit.status_url || `${QUEUE}/${model}/requests/${submit.request_id}/status`
  const resultUrl = submit.response_url || `${QUEUE}/${model}/requests/${submit.request_id}`
  log(`[i2v] ${engine} kø-id ${submit.request_id}`)

  // 2) Poll status (i2v tar typisk 1-5 min; tak 8 min pr. klipp)
  const deadline = Date.now() + 8 * 60 * 1000
  let status = 'IN_QUEUE'
  while (Date.now() < deadline) {
    await sleep(5000)
    const st = await fetch(statusUrl, { headers: auth }).then((r) => r.json()).catch(() => ({}))
    status = st.status || status
    if (status === 'COMPLETED') break
    if (status === 'FAILED' || status === 'ERROR') {
      throw new Error(`fal i2v ${status}: ${JSON.stringify(st)}`)
    }
  }
  if (status !== 'COMPLETED') throw new Error('fal i2v tidsavbrudd (>8 min)')

  // 3) Hent resultat — output er {video:{url}} (evt. pakket i .data)
  const result = await fetch(resultUrl, { headers: auth }).then((r) => r.json())
  const videoUrl = result?.video?.url || result?.data?.video?.url
  if (!videoUrl) throw new Error(`fal i2v: ingen video-url: ${JSON.stringify(result).slice(0, 400)}`)

  // 4) Last ned klippet
  await downloadTo(videoUrl, outPath)
  log(`[i2v] ferdig -> ${outPath}`)
  return outPath
}


/**
 * Kjedegenerering: ett langt, sammenhengende bevegelsesklipp i vilkårlig
 * lengde (Lars 30/7: «riktig lengde, ingen boomeranging»). Generatorene gir
 * maks 5/8 s (PixVerse) eller 5/10 s (Kling); lengre segmenter dekkes ved å
 * så neste ledd fra forrige ledds siste bilde og skjøte leddene sammen.
 *
 * Feiler et ledd underveis beholdes det som er generert — rendereren fyller
 * resten (boomerang som nødløsning). Feiler alt, kastes feilen videre og
 * job-queue faller tilbake til stillbilde, som før.
 *
 * @param {object} o
 * @param {string} o.imageUrl    Offentlig URL til startbildet
 * @param {string} o.prompt      Bevegelsesbeskrivelse
 * @param {string} [o.engine]    'pixverse' (default) | 'kling'
 * @param {number} o.targetSec   Ønsket samlet lengde (sek)
 * @param {string} [o.resolution]
 * @param {string} o.outPath     Ferdig sammensatt klipp (.mp4)
 * @param {string} o.workDir     Egen mappe for leddene (må finnes)
 * @param {function} o.uploadFrame  async (buffer, filnavn) -> offentlig URL (frø-bilder)
 * @param {function} [o.log]
 * @param {number} [o.maxChunks] Kostnadstak (default 4 ledd)
 * @returns {Promise<{path: string, chunks: number, coveredSec: number}>}
 */
async function imageToVideoChain(o) {
  const { imageUrl, prompt, engine = 'pixverse', targetSec, resolution = '720p',
    outPath, workDir, uploadFrame, log = console.log, maxChunks = 4, negativePrompt } = o
  if (!targetSec || targetSec <= 0) throw new Error('targetSec mangler')
  const chunkMax = engine === 'kling' ? 10 : 8
  const chunks = []
  let seed = imageUrl
  let covered = 0
  try {
    while (covered < targetSec - 0.25 && chunks.length < maxChunks) {
      const remaining = targetSec - covered
      // 5 s holder for korte rester; ellers største ledd motoren gir
      const durationSec = remaining <= 5.5 ? 5 : chunkMax
      const chunkPath = `${workDir}/chain_${chunks.length + 1}.mp4`
      // Ett nytt forsøk per ledd: fal-køen har lunefulle dager (31/7: hale
      // tidsavbrøt >8 min og hele halen røk — ett retry hadde reddet den).
      // Innholdsflagg (content_policy_violation) prøves med DEN ANDRE
      // motoren — sjekkene er ulike, så den ene slipper ofte gjennom det
      // den andre stopper (falsk alarm målt i produksjon 6dec2fa9 31/7).
      try {
        await imageToVideoClip({ imageUrl: seed, prompt, engine, durationSec, resolution, outPath: chunkPath, log, negativePrompt })
      } catch (firstErr) {
        const policy = /content_policy|flagged by a content checker/i.test(firstErr.message || '')
        const retryEngine = policy ? (engine === 'kling' ? 'pixverse' : 'kling') : engine
        // Gyldige lengder: Kling 5/10, PixVerse 5/8 — velg motorens maks
        // for lange ledd, 5 for korte
        const retryDur = durationSec <= 5 ? 5 : (retryEngine === 'kling' ? 10 : 8)
        log(`[i2v-kjede] ledd ${chunks.length + 1} feilet (${firstErr.message.slice(0, 160)}) — prøver ${policy ? `med ${retryEngine}` : 'én gang til'}`)
        await imageToVideoClip({ imageUrl: seed, prompt, engine: retryEngine, durationSec: retryDur, resolution, outPath: chunkPath, log, negativePrompt })
      }
      chunks.push(chunkPath)
      const dur = await probeSeconds(chunkPath)
      covered += dur > 0 ? dur : durationSec
      log(`[i2v-kjede] ledd ${chunks.length}: ${dur.toFixed(1)}s (${covered.toFixed(1)}/${targetSec.toFixed(1)}s)`)
      if (covered < targetSec - 0.25 && chunks.length < maxChunks) {
        const framePath = `${workDir}/chain_${chunks.length}_seed.png`
        await extractLastFrame(chunkPath, framePath)
        seed = await uploadFrame(fs.readFileSync(framePath), `chain_${chunks.length}_seed.png`)
      }
    }
    if (covered < targetSec - 0.25 && chunks.length >= maxChunks) {
      log(`[i2v-kjede] kostnadstak: ${maxChunks} ledd dekker ${covered.toFixed(1)} av ${targetSec.toFixed(1)}s — resten fylles i rendereren`)
    }
  } catch (err) {
    if (!chunks.length) throw err
    log(`[i2v-kjede] ledd ${chunks.length + 1} FEILET (${err.message}) — bruker ${chunks.length} ledd, resten fylles i rendereren`)
  }
  if (chunks.length === 1) {
    fs.copyFileSync(chunks[0], outPath)
  } else {
    await concatClips(chunks, outPath)
  }
  return { path: outPath, chunks: chunks.length, coveredSec: covered }
}

/**
 * Lip-sync-klipp: stillbilde + voiceover-lyd -> snakkende video (VEED Fabric 1.0).
 * Klippets lengde == lydens lengde, saa det matcher segmentet naturlig.
 */
async function lipsyncClip({ imageUrl, audioUrl, outPath, resolution = '720p', log = console.log }) {
  if (!FAL_KEY) throw new Error('CONTENTFORGE_FAL_KEY mangler i env')
  if (!imageUrl || !audioUrl) throw new Error('imageUrl/audioUrl mangler')
  const auth = { Authorization: `Key ${FAL_KEY}` }
  const submitRes = await fetch(`${QUEUE}/veed/fabric-1.0`, {
    method: 'POST',
    headers: { ...auth, 'Content-Type': 'application/json' },
    body: JSON.stringify({ image_url: imageUrl, audio_url: audioUrl, resolution }),
  })
  const submit = await submitRes.json().catch(() => ({}))
  if (!submitRes.ok || !submit.request_id) throw new Error('fabric submit feilet: ' + JSON.stringify(submit).slice(0, 300))
  const statusUrl = submit.status_url || `${QUEUE}/veed/fabric-1.0/requests/${submit.request_id}/status`
  const resultUrl = submit.response_url || `${QUEUE}/veed/fabric-1.0/requests/${submit.request_id}`
  log(`[lipsync] kø-id ${submit.request_id}`)
  const deadline = Date.now() + 12 * 60 * 1000
  let status = 'IN_QUEUE'
  while (Date.now() < deadline) {
    await sleep(8000)
    const st = await fetch(statusUrl, { headers: auth }).then((r) => r.json()).catch(() => ({}))
    status = st.status || status
    if (status === 'COMPLETED') break
    if (status === 'FAILED' || status === 'ERROR') throw new Error('fabric ' + status + ': ' + JSON.stringify(st).slice(0, 200))
  }
  if (status !== 'COMPLETED') throw new Error('fabric tidsavbrudd (>12 min)')
  const result = await fetch(resultUrl, { headers: auth }).then((r) => r.json())
  const videoUrl = result?.video?.url || result?.data?.video?.url || result?.url
  if (!videoUrl) throw new Error('fabric: ingen video-url: ' + JSON.stringify(result).slice(0, 300))
  await downloadTo(videoUrl, outPath)
  log(`[lipsync] ferdig -> ${outPath}`)
  return outPath
}

module.exports = { imageToVideoClip, imageToVideoChain, lipsyncClip, extractLastFrame, concatClips, probeSeconds, MODELS }

// CLI test-modus:  node i2v.js <imageUrl> <outPath> [engine] [resolution] [duration]
if (require.main === module) {
  const [imageUrl, outPath, engine = 'pixverse', resolution = '360p', durationSec = '5'] = process.argv.slice(2)
  if (!imageUrl || !outPath) {
    console.error('bruk: node i2v.js <imageUrl> <outPath> [engine] [resolution] [duration]')
    process.exit(1)
  }
  const t0 = Date.now()
  imageToVideoClip({
    imageUrl,
    prompt: 'subtle cinematic camera push-in, gentle natural motion, realistic',
    engine,
    resolution,
    durationSec: Number(durationSec),
    outPath,
  })
    .then((p) => { console.log(`OK (${((Date.now() - t0) / 1000).toFixed(0)}s): ${p}`); process.exit(0) })
    .catch((e) => { console.error('FEIL:', e.message); process.exit(1) })
}
