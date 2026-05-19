import { NextResponse } from 'next/server'

const DROPLET_URL = 'http://139.59.212.218:3002'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ filename: string }> }
) {
  try {
    const resolvedParams = await params
    const filename = decodeURIComponent(resolvedParams.filename)
    const res = await fetch(`${DROPLET_URL}/music/files/${encodeURIComponent(filename)}`)
    
    if (!res.ok) {
      return NextResponse.json({ error: 'Music file not found' }, { status: 404 })
    }

    const buffer = await res.arrayBuffer()
    const contentType = res.headers.get('content-type') || 'audio/mpeg'

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': contentType,
        'Content-Length': String(buffer.byteLength),
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'public, max-age=3600',
      }
    })
  } catch (err) {
    console.error('[api/music/[filename]] Error proxying music file:', err)
    return NextResponse.json({ error: 'Failed to load music file' }, { status: 500 })
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ filename: string }> }
) {
  try {
    const resolvedParams = await params
    const filename = decodeURIComponent(resolvedParams.filename)
    const res = await fetch(`${DROPLET_URL}/music/${encodeURIComponent(filename)}`, { method: 'DELETE' })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      return NextResponse.json({ error: err.error || 'Failed to delete' }, { status: res.status })
    }
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[api/music/[filename]] Delete error:', err)
    return NextResponse.json({ error: 'Failed to delete music file' }, { status: 500 })
  }
}
