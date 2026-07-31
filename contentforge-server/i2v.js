// i2v.js — image-to-video via fal.ai (PixVerse default, Kling premium)
// Brukes av job-queue: gjør et stillbilde om til et kort videoklipp med bevegelse.
'use strict'
const fs = require('fs')

const FAL_KEY = process.env.CONTENTFORGE_FAL_KEY
const QUEUE = 'https://queue.fal.run'

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
  const { imageUrl, prompt, engine = 'pixverse', durationSec = 5, resolution = '720p', outPath, log = console.log } = o
  if (!FAL_KEY) throw new Error('CONTENTFORGE_FAL_KEY mangler i env')
  if (!imageUrl) throw new Error('imageUrl mangler')
  const model = MODELS[engine] || MODELS.pixverse
  const auth = { Authorization: `Key ${FAL_KEY}` }

  // PixVerse bruker duration som streng ("5"/"8"); Kling bruker tall-sekunder.
  const body = engine === 'kling'
    ? { image_url: imageUrl, prompt, duration: String(durationSec) }
    : { image_url: imageUrl, prompt, duration: String(durationSec), resolution, negative_prompt: 'talking, speaking, singing, moving lips, lip movement, mouth opening and closing, conversation' }

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

module.exports = { imageToVideoClip, lipsyncClip, MODELS }

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
