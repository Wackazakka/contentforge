import { NextResponse } from 'next/server'

const DROPLET_URL = 'http://139.59.212.218:3002'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ filename: string }> }
) {
  try {
    const resolvedParams = await params
    const filename = decodeURIComponent(resolvedParams.filename)
    // Forward the browser's Range header so the droplet returns a proper 206 Partial Content.
    // Without this, <audio> playback fails in strict browsers (Safari) — the element renders
    // but won't play, because we claimed Accept-Ranges but always answered 200.
    const range = request.headers.get('range')
    const upstream = await fetch(`${DROPLET_URL}/music/files/${encodeURIComponent(filename)}`, {
      headers: range ? { Range: range } : {},
    })

    if (!upstream.ok && upstream.status !== 206) {
      return NextResponse.json({ error: 'Music file not found' }, { status: 404 })
    }

    const headers = new Headers()
    headers.set('Content-Type', upstream.headers.get('content-type') || 'audio/mpeg')
    headers.set('Accept-Ranges', 'bytes')
    headers.set('Cache-Control', 'public, max-age=3600')
    const contentRange = upstream.headers.get('content-range')
    if (contentRange) headers.set('Content-Range', contentRange)
    const contentLength = upstream.headers.get('content-length')
    if (contentLength) headers.set('Content-Length', contentLength)

    // Pass upstream status (206 for range, 200 otherwise) and stream the body through.
    return new NextResponse(upstream.body, { status: upstream.status, headers })
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
