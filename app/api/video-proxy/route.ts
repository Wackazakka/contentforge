import { NextRequest, NextResponse } from 'next/server'

const R2_HOST = 'pub-5dcdfe9305a740febc87568c9ccb40a6.r2.dev'

export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get('url')
  if (!url) return NextResponse.json({ error: 'Missing url' }, { status: 400 })

  try {
    const parsed = new URL(url)
    if (parsed.hostname !== R2_HOST) {
      return NextResponse.json({ error: 'Unauthorized host' }, { status: 403 })
    }
  } catch {
    return NextResponse.json({ error: 'Invalid url' }, { status: 400 })
  }

  // Pass Range header through for seeking support
  const upstreamHeaders: HeadersInit = {}
  const rangeHeader = request.headers.get('Range')
  if (rangeHeader) upstreamHeaders['Range'] = rangeHeader

  const upstream = await fetch(url, { headers: upstreamHeaders })

  if (!upstream.ok && upstream.status !== 206) {
    return NextResponse.json({ error: `Upstream ${upstream.status}` }, { status: upstream.status })
  }

  // Buffer entire response — streaming from Netlify functions is unreliable for video
  const buffer = await upstream.arrayBuffer()

  const responseHeaders = new Headers({
    'Content-Type': 'video/mp4',
    'Accept-Ranges': 'bytes',
    'Content-Length': String(buffer.byteLength),
    'Cache-Control': 'public, max-age=86400',
    // Tell Netlify Edge CDN to vary cache on the `url` query param.
    // Without this, the Next.js Netlify runtime collapses all proxy requests
    // into one cache entry regardless of which video URL is requested.
    'Netlify-Vary': 'query=url',
  })

  const contentRange = upstream.headers.get('Content-Range')
  if (contentRange) responseHeaders.set('Content-Range', contentRange)

  return new NextResponse(buffer, {
    status: upstream.status,
    headers: responseHeaders,
  })
}
