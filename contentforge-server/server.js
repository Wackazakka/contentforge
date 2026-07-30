require('dotenv').config()
const express = require('express')
const path = require('path')
const fs = require('fs')
const multer = require('multer')
const jobQueueRouter = require('./job-queue')

const app = express()
const PORT = 3002
const VIDEO_DIR = '/root/.openclaw/workspace/contentforge-output'
const MUSIC_DIR = path.join(__dirname, 'music')

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Range')
  if (req.method === 'OPTIONS') return res.sendStatus(204)
  next()
})

app.use('/jobs', jobQueueRouter)

app.use('/videos', express.static(VIDEO_DIR, {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.mp4')) {
      res.setHeader('Content-Type', 'video/mp4')
    }
  }
}))

// Serve individual music files
app.use('/music/files', express.static(MUSIC_DIR, {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.mp3')) res.setHeader('Content-Type', 'audio/mpeg')
    else if (filePath.endsWith('.wav')) res.setHeader('Content-Type', 'audio/wav')
    else if (filePath.endsWith('.ogg')) res.setHeader('Content-Type', 'audio/ogg')
    else if (filePath.endsWith('.m4a')) res.setHeader('Content-Type', 'audio/mp4')
    else if (filePath.endsWith('.flac')) res.setHeader('Content-Type', 'audio/flac')
  }
}))

// Helper: recursively scan music directories
function scanMusicDir(dir, prefix = '') {
  const AUDIO_EXT = /\.(mp3|wav|ogg|m4a|flac)$/i
  const files = []
  
  if (!fs.existsSync(dir)) return files
  
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  
  entries.forEach(entry => {
    const fullPath = path.join(dir, entry.name)
    const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name
    
    if (entry.isDirectory()) {
      // Recursively scan subdirectories
      files.push(...scanMusicDir(fullPath, relativePath))
    } else if (AUDIO_EXT.test(entry.name)) {
      // Add audio files with folder info
      const stat = fs.statSync(fullPath)
      const folder = prefix || 'global'
      const rawBase = entry.name.replace(AUDIO_EXT, '')
      const name = (rawBase.includes(' ') ? rawBase : rawBase.replace(/[-_]/g, ' ')).replace(/^[\s_-]+/, '').trim()
      
      files.push({
        filename: relativePath,
        name,
        folder,
        url: `http://139.59.212.218:${PORT}/music/files/${encodeURIComponent(relativePath)}`,
        path: fullPath,
        size: stat.size,
      })
    }
  })
  
  return files
}

// List available music files (recursively from all folders)
app.get('/music', (req, res) => {
  try {
    const files = scanMusicDir(MUSIC_DIR)
    res.json({ files })
  } catch (err) {
    console.error('[server] Failed to list music files:', err.message)
    res.status(500).json({ error: err.message, files: [] })
  }
})

app.get('/health', (req, res) => {
  res.json({ status: 'ok', port: PORT, videoDir: VIDEO_DIR, musicDir: MUSIC_DIR })
})

// Multer configuration for music uploads (temp storage)
const tempStorage = multer.memoryStorage()

const musicFilter = (req, file, cb) => {
  // Accept both extension and MIME type validation
  const allowedExt = /\.(mp3|wav|ogg|m4a|flac)$/i
  const allowedMime = /^audio\/(mpeg|wav|wave|x-wav|ogg|mp4|flac)$/i
  
  const extValid = allowedExt.test(file.originalname)
  const mimeValid = allowedMime.test(file.mimetype)
  
  if (extValid || mimeValid) {
    cb(null, true)
  } else {
    cb(new Error('Only audio files (mp3, wav, ogg, m4a, flac) are allowed. Received: ' + file.mimetype), false)
  }
}

const upload = multer({
  storage: tempStorage,
  fileFilter: musicFilter,
  limits: { fileSize: 500 * 1024 * 1024 } // 500MB max
})


// Filnavn-vask som RESPEKTERER norske navn (2026-07-30, Lars' funn:
// «Det står om ...» ble «det sta r om ...»): translitterer æøå i stedet for
// å strippe, beholder store bokstaver/mellomrom/parenteser — fjerner kun
// filsystem-farlige tegn.
function sanitizeMusicName(raw) {
  const map = { '\u00e6':'ae','\u00f8':'oe','\u00e5':'aa','\u00c6':'Ae','\u00d8':'Oe','\u00c5':'Aa','\u00e9':'e','\u00e8':'e','\u00fc':'u','\u00f6':'oe','\u00e4':'ae','\u00d6':'Oe','\u00c4':'Ae' }
  let out = String(raw).replace(/[\u00e6\u00f8\u00e5\u00c6\u00d8\u00c5\u00e9\u00e8\u00fc\u00f6\u00e4\u00d6\u00c4]/g, (c) => map[c] || c)
  out = out.replace(/[\/\\<>:"|?*\x00-\x1f]/g, '').replace(/\.{2,}/g, '.').replace(/\s+/g, ' ').trim()
  return out.slice(0, 120) || 'laat.mp3'
}

// Upload music file to specific folder
app.post('/music/upload', upload.single('file'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' })
    }

    // Get folder from query param (default: global)
    const folder = (req.query.folder || 'global')
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '')
    
    if (!folder) {
      return res.status(400).json({ error: 'Invalid folder name' })
    }

    // Create folder if needed
    const folderPath = path.join(MUSIC_DIR, folder)
    if (!fs.existsSync(folderPath)) {
      fs.mkdirSync(folderPath, { recursive: true })
    }

    // Multer leverer originalname som latin1 — dekod til utf8 foer vask
    let originalName = req.file.originalname
    try { originalName = Buffer.from(originalName, 'latin1').toString('utf8') } catch {}
    const sanitized = sanitizeMusicName(originalName)

    const filePath = path.join(folderPath, sanitized)
    
    // Write file
    fs.writeFileSync(filePath, req.file.buffer)

    const fileInfo = {
      filename: `${folder}/${sanitized}`,
      name: (() => { const b = sanitized.replace(/\.(mp3|wav|ogg|m4a|flac)$/i, ''); return (b.includes(' ') ? b : b.replace(/[-_]/g, ' ')).trim() })(),
      folder,
      url: `http://139.59.212.218:${PORT}/music/files/${encodeURIComponent(`${folder}/${sanitized}`)}`,
      size: req.file.size,
      uploadedAt: new Date().toISOString(),
    }

    console.log(`[server] Music file uploaded: ${fileInfo.filename} to folder '${folder}' (${req.file.size} bytes)`)
    res.json({ success: true, file: fileInfo })
  } catch (err) {
    console.error('[server] Music upload error:', err.message)
    res.status(500).json({ error: err.message })
  }
})

app.listen(PORT, () => {
  console.log(`ContentForge video server running on port ${PORT}`)
  console.log(`Serving videos from: ${VIDEO_DIR}`)
  console.log(`Serving music from: ${MUSIC_DIR}`)
})

// Delete a music file
app.delete('/music/:filename', (req, res) => {
  try {
    const filename = decodeURIComponent(req.params.filename)
    // filename is e.g. global/track.mp3 or jingles/jingle.mp3
    const filePath = path.join(MUSIC_DIR, filename)
    // Prevent path traversal
    if (!filePath.startsWith(MUSIC_DIR + path.sep) && filePath !== MUSIC_DIR) {
      return res.status(400).json({ error: 'Invalid filename' })
    }
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found' })
    }
    fs.unlinkSync(filePath)
    console.log('[server] Music file deleted:', filename)
    res.json({ success: true })
  } catch (err) {
    console.error('[server] Music delete error:', err.message)
    res.status(500).json({ error: err.message })
  }
})

// ── Medley (fase 3b, IndigoBoom-planen 2026-07-30) ───────────────────────────
// Mikser 2–5 av produktets egne låter til ÉN mp3 med equal-power-crossfade og
// loudness-normalisering. Resultatet lagres i samme tracks-<productId>-mappe
// og brukes som vanlig bakgrunnsmusikk — render-pipeline urørt.
const { execFile } = require('child_process')

app.post('/music/medley', express.json(), (req, res) => {
  try {
    // Filer kan vaere strenger ELLER {filename, startSec, clipSec} —
    // utsnitt-stoette (2026-07-30, Lars: «jeg vet jo ikke hvilken del av
    // laata som spilles»): artisten markerer hvor hooken starter og hvor
    // mange sekunder hver laat faar.
    const rawFiles = Array.isArray(req.body?.files) ? req.body.files : []
    const files = rawFiles.map((f) => typeof f === 'string'
      ? { filename: f, startSec: 0, clipSec: null }
      : { filename: String(f?.filename || ''), startSec: Math.max(0, Number(f?.startSec) || 0), clipSec: (Number(f?.clipSec) > 0 ? Math.min(Number(f.clipSec), 120) : null) })
    const folder = String(req.body?.folder || '').toLowerCase().replace(/[^a-z0-9-]/g, '')
    const rawName = String(req.body?.name || `medley-${Date.now()}`)

    if (files.length < 2 || files.length > 5) {
      return res.status(400).json({ error: 'Velg 2-5 filer' })
    }
    if (!folder) return res.status(400).json({ error: 'Ugyldig mappe' })

    // Alle kildene må ligge trygt under MUSIC_DIR (samme vern som delete)
    const inputs = []
    for (const f of files) {
      if (!f.filename || f.filename.includes('..')) {
        return res.status(400).json({ error: 'Ugyldig filsti' })
      }
      const p = path.join(MUSIC_DIR, f.filename)
      if (!p.startsWith(MUSIC_DIR + path.sep) || !fs.existsSync(p)) {
        return res.status(400).json({ error: `Fant ikke ${f.filename}` })
      }
      inputs.push({ path: p, startSec: f.startSec, clipSec: f.clipSec })
    }

    const folderPath = path.join(MUSIC_DIR, folder)
    if (!fs.existsSync(folderPath)) fs.mkdirSync(folderPath, { recursive: true })
    const sanitized = rawName.toLowerCase().replace(/[^a-z0-9.-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || `medley-${Date.now()}`
    const outName = sanitized.endsWith('.mp3') ? sanitized : `${sanitized}.mp3`
    const outPath = path.join(folderPath, outName)

    // acrossfade-kjede: [0][1] -> [x1]; [x1][2] -> [x2]; ... + loudnorm til slutt
    const XFADE = 2.5
    let chain = ''
    let prev = '[0:a]'
    for (let i = 1; i < inputs.length; i++) {
      const out = `[x${i}]`
      chain += `${prev}[${i}:a]acrossfade=d=${XFADE}:c1=tri:c2=tri${out};`
      prev = out
    }
    chain += `${prev}loudnorm=I=-16:TP=-1.5:LRA=11[out]`

    const args = ['-y']
    for (const inp of inputs) {
      if (inp.startSec > 0) args.push('-ss', String(inp.startSec))
      if (inp.clipSec) args.push('-t', String(inp.clipSec))
      args.push('-i', inp.path)
    }
    args.push('-filter_complex', chain, '-map', '[out]', '-c:a', 'libmp3lame', '-b:a', '192k', outPath)

    console.log(`[server] Medley: ${inputs.length} filer -> ${folder}/${outName}`)
    execFile('ffmpeg', args, { timeout: 180000 }, (err, _stdout, stderr) => {
      if (err) {
        console.error('[server] Medley ffmpeg-feil:', String(stderr).slice(-400))
        // acrossfade krever at hver kilde er lengre enn crossfaden — vanligste feil
        return res.status(500).json({ error: 'Miksingen feilet - er alle laatene lengre enn 3 sekunder?' })
      }
      const size = fs.statSync(outPath).size
      const fileInfo = {
        filename: `${folder}/${outName}`,
        name: (() => { const b = outName.replace(/\.mp3$/i, ''); return (b.includes(' ') ? b : b.replace(/[-_]/g, ' ')).replace(/^[\s_-]+/, '').trim() })(),
        folder,
        url: `http://139.59.212.218:${PORT}/music/files/${encodeURIComponent(`${folder}/${outName}`)}`,
        size,
        uploadedAt: new Date().toISOString(),
      }
      console.log(`[server] Medley ferdig: ${fileInfo.filename} (${size} bytes)`)
      res.json({ success: true, file: fileInfo })
    })
  } catch (err) {
    console.error('[server] Medley-feil:', err.message)
    res.status(500).json({ error: err.message })
  }
})


// ── Import fra URL (2026-07-30) ──────────────────────────────────────────────
// Store laater taaler ikke Netlify-proxyen (~4,5 MB reell grense) — nettleseren
// laster opp til Supabase Storage-innboksen, og vi henter derfra til MUSIC_DIR.
app.post('/music/import', express.json(), (req, res) => {
  ;(async () => {
    const url = String(req.body?.url || '')
    const folder = String(req.body?.folder || '').toLowerCase().replace(/[^a-z0-9-]/g, '')
    const rawName = String(req.body?.name || 'laat.mp3')
    if (!/^https:\/\/[a-z0-9]+\.supabase\.co\/storage\//.test(url)) {
      return res.status(400).json({ error: 'Kun Supabase Storage-URL-er kan importeres' })
    }
    if (!folder) return res.status(400).json({ error: 'Ugyldig mappe' })
    const sanitized = sanitizeMusicName(rawName)
    const outName = /\.(mp3|wav|m4a|ogg|flac)$/.test(sanitized) ? sanitized : sanitized + '.mp3'
    const folderPath = path.join(MUSIC_DIR, folder)
    if (!fs.existsSync(folderPath)) fs.mkdirSync(folderPath, { recursive: true })
    const outPath = path.join(folderPath, outName)

    const r = await fetch(url)
    if (!r.ok) return res.status(400).json({ error: `Nedlasting feilet (HTTP ${r.status})` })
    const len = Number(r.headers.get('content-length') || 0)
    if (len > 50 * 1024 * 1024) return res.status(400).json({ error: 'Fila er for stor (maks 50 MB)' })
    const buf = Buffer.from(await r.arrayBuffer())
    if (buf.byteLength > 50 * 1024 * 1024) return res.status(400).json({ error: 'Fila er for stor (maks 50 MB)' })
    fs.writeFileSync(outPath, buf)

    const fileInfo = {
      filename: `${folder}/${outName}`,
      name: (() => { const b = outName.replace(/\.(mp3|wav|m4a|ogg|flac)$/i, ''); return (b.includes(' ') ? b : b.replace(/[-_]/g, ' ')).trim() })(),
      folder,
      url: `http://139.59.212.218:${PORT}/music/files/${encodeURIComponent(`${folder}/${outName}`)}`,
      size: buf.byteLength,
      uploadedAt: new Date().toISOString(),
    }
    console.log(`[server] Music imported: ${fileInfo.filename} (${buf.byteLength} bytes)`)
    res.json({ success: true, file: fileInfo })
  })().catch((err) => {
    console.error('[server] Music import error:', err.message)
    res.status(500).json({ error: err.message })
  })
})
