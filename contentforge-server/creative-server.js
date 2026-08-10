const express = require('express')
const fs = require('fs')
const path = require('path')

const app = express()
const PORT = 8900
const CREATIVE_FILE = '/root/.openclaw/workspace/creative-posts.json'

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, PATCH, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept')
  if (req.method === 'OPTIONS') return res.sendStatus(204)
  next()
})

app.use(express.json())

// GET /creative-posts — hent alle posts
app.get('/creative-posts', (req, res) => {
  try {
    const data = fs.readFileSync(CREATIVE_FILE, 'utf8')
    const posts = JSON.parse(data)
    res.json({ posts })
  } catch (e) {
    console.error('Error reading creative-posts:', e.message)
    res.status(500).json({ error: e.message, posts: [] })
  }
})

// POST /creative-posts — opprett ny post
app.post('/creative-posts', (req, res) => {
  try {
    const { id, product, type, title, status, body } = req.body
    const data = fs.readFileSync(CREATIVE_FILE, 'utf8')
    const posts = JSON.parse(data)
    
    const newPost = {
      id: id || `post-${Date.now()}`,
      product,
      type,
      title,
      status,
      body,
      date: new Date().toISOString().split('T')[0],
      author: 'OpenClaw'
    }
    
    posts.push(newPost)
    fs.writeFileSync(CREATIVE_FILE, JSON.stringify(posts, null, 2))
    res.json({ success: true, post: newPost })
  } catch (e) {
    console.error('Error creating post:', e.message)
    res.status(500).json({ error: e.message })
  }
})

// DELETE /creative-posts — slett en post
app.delete('/creative-posts', (req, res) => {
  try {
    const { id } = req.body
    const data = fs.readFileSync(CREATIVE_FILE, 'utf8')
    let posts = JSON.parse(data)
    
    posts = posts.filter(p => p.id !== id)
    fs.writeFileSync(CREATIVE_FILE, JSON.stringify(posts, null, 2))
    
    res.json({ success: true })
  } catch (e) {
    console.error('Error deleting post:', e.message)
    res.status(500).json({ error: e.message })
  }
})

// PATCH /creative-posts/approve — godkjenn en post
app.patch('/creative-posts/approve', (req, res) => {
  try {
    const { id } = req.body
    const data = fs.readFileSync(CREATIVE_FILE, 'utf8')
    const posts = JSON.parse(data)
    
    const post = posts.find(p => p.id === id)
    if (!post) return res.status(404).json({ error: 'Post not found' })
    
    post.status = 'Approved'
    fs.writeFileSync(CREATIVE_FILE, JSON.stringify(posts, null, 2))
    
    res.json({ success: true, post })
  } catch (e) {
    console.error('Error approving post:', e.message)
    res.status(500).json({ error: e.message })
  }
})

app.get('/health', (req, res) => {
  res.json({ status: 'ok', port: PORT, creativeFile: CREATIVE_FILE })
})

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Creative Posts API running on port ${PORT}`)
  console.log(`Serving from: ${CREATIVE_FILE}`)
})
