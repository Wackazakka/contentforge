import { NextResponse } from 'next/server'

const DROPLET_URL = 'http://139.59.212.218:3002'

export async function GET(
  request: Request,
  { params }: { params: { filename: string } }
) {
  try {
    const filename = decodeURIComponent(params.filename)
    const res = await fetch(`${DROPLET_URL}/music/files/${encodeURIComponent(filename)}`)
    
    if (!res.ok) {
      return NextResponse.json({ error: 'Music file not found' }, { status: 404 })
    }

    const buffer = await res.arrayBuffer()
    const contentType = res.headers.get('content-type') || 'audio/mpeg'
    
    return new NextResponse(buffer, {
      headers: { 'Content-Type': contentType }
    })
  } catch (err) {
    console.error('[api/music/[filename]] Error proxying music file:', err)
    return NextResponse.json({ error: 'Failed to load music file' }, { status: 500 })
  }
}
