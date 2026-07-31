'use strict'
// Flux Kontext bilderedigering via fal.ai — behold identitet, endre etter instruksjon.
const fs = require('fs')
const FAL_KEY = process.env.CONTENTFORGE_FAL_KEY
const QUEUE = 'https://queue.fal.run'
const MODEL = 'fal-ai/flux-pro/kontext'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function edit({ imagePath, prompt, outPath, log = console.log }) {
  if (!FAL_KEY) throw new Error('CONTENTFORGE_FAL_KEY mangler')
  const buf = fs.readFileSync(imagePath)
  const ext = imagePath.toLowerCase().endsWith('.png') ? 'png' : 'jpeg'
  const dataUri = `data:image/${ext};base64,` + buf.toString('base64')
  const auth = { Authorization: `Key ${FAL_KEY}` }

  const submitRes = await fetch(`${QUEUE}/${MODEL}`, {
    method: 'POST',
    headers: { ...auth, 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, image_url: dataUri, guidance_scale: 3.5, num_images: 1 }),
  })
  const submit = await submitRes.json().catch(() => ({}))
  if (!submitRes.ok || !submit.request_id) throw new Error('submit feilet: ' + JSON.stringify(submit).slice(0, 400))
  const statusUrl = submit.status_url || `${QUEUE}/${MODEL}/requests/${submit.request_id}/status`
  const resultUrl = submit.response_url || `${QUEUE}/${MODEL}/requests/${submit.request_id}`
  log('kø-id ' + submit.request_id)

  const deadline = Date.now() + 6 * 60 * 1000
  let status = 'IN_QUEUE'
  while (Date.now() < deadline) {
    await sleep(4000)
    const st = await fetch(statusUrl, { headers: auth }).then((r) => r.json()).catch(() => ({}))
    status = st.status || status
    if (status === 'COMPLETED') break
    if (status === 'FAILED' || status === 'ERROR') throw new Error('kontext ' + status + ': ' + JSON.stringify(st).slice(0, 400))
  }
  if (status !== 'COMPLETED') throw new Error('timeout (>6 min)')

  const result = await fetch(resultUrl, { headers: auth }).then((r) => r.json())
  const url = result?.images?.[0]?.url || result?.image?.url || result?.data?.images?.[0]?.url
  if (!url) throw new Error('ingen bilde-url: ' + JSON.stringify(result).slice(0, 500))
  const imgBuf = Buffer.from(await (await fetch(url)).arrayBuffer())
  fs.writeFileSync(outPath, imgBuf)
  log('ferdig -> ' + outPath)
  return outPath
}

module.exports = { edit }

if (require.main === module) {
  const [imagePath, outPath, ...promptParts] = process.argv.slice(2)
  const prompt = promptParts.join(' ')
  if (!imagePath || !outPath || !prompt) {
    console.error('bruk: node fal-edit.js <bilde> <ut.png> <prompt...>'); process.exit(1)
  }
  const t0 = Date.now()
  edit({ imagePath, prompt, outPath })
    .then((p) => { console.log(`OK (${((Date.now() - t0) / 1000).toFixed(0)}s): ${p}`); process.exit(0) })
    .catch((e) => { console.error('FEIL:', e.message); process.exit(1) })
}
