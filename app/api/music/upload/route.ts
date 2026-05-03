import { NextResponse } from 'next/server'

const DROPLET_URL = 'http://139.59.212.218:3002'

export async function POST(request: Request) {
  try {
    const formData = await request.formData()
    
    // Validate file exists
    const file = formData.get('file')
    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    // Create new FormData for droplet
    const dropletFormData = new FormData()
    dropletFormData.append('file', file)

    // Forward to droplet
    const res = await fetch(`${DROPLET_URL}/music/upload`, {
      method: 'POST',
      body: dropletFormData,
    })

    if (!res.ok) {
      const errorText = await res.text()
      console.error(`[api/music/upload] Droplet error: ${res.status} - ${errorText}`)
      return NextResponse.json({ error: 'Upload failed on server' }, { status: res.status })
    }

    const data = await res.json()
    return NextResponse.json(data)
  } catch (err) {
    console.error('[api/music/upload] Error uploading music:', err)
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 })
  }
}
