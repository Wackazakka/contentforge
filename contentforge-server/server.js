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
      const name = entry.name.replace(AUDIO_EXT, '').replace(/[-_]/g, ' ')
      
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

    // Sanitize filename
    const sanitized = req.file.originalname
      .toLowerCase()
      .replace(/[^a-z0-9.-]/g, '-')
      .replace(/-+/g, '-')

    const filePath = path.join(folderPath, sanitized)
    
    // Write file
    fs.writeFileSync(filePath, req.file.buffer)

    const fileInfo = {
      filename: `${folder}/${sanitized}`,
      name: sanitized.replace(/\.(mp3|wav|ogg|m4a|flac)$/i, '').replace(/[-_]/g, ' '),
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
    const files = Array.isArray(req.body?.files) ? req.body.files : []
    const folder = String(req.body?.folder || '').toLowerCase().replace(/[^a-z0-9-]/g, '')
    const rawName = String(req.body?.name || `medley-${Date.now()}`)

    if (files.length < 2 || files.length > 5) {
      return res.status(400).json({ error: 'Velg 2-5 filer' })
    }
    if (!folder) return res.status(400).json({ error: 'Ugyldig mappe' })

    // Alle kildene må ligge trygt under MUSIC_DIR (samme vern som delete)
    const inputs = []
    for (const rel of files) {
      if (typeof rel !== 'string' || rel.includes('..')) {
        return res.status(400).json({ error: 'Ugyldig filsti' })
      }
      const p = path.join(MUSIC_DIR, rel)
      if (!p.startsWith(MUSIC_DIR + path.sep) || !fs.existsSync(p)) {
        return res.status(400).json({ error: `Fant ikke ${rel}` })
      }
      inputs.push(p)
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
    for (const p of inputs) args.push('-i', p)
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
        name: outName.replace(/\.mp3$/i, '').replace(/[-_]/g, ' '),
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
