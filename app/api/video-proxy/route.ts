import { NextRequest, NextResponse } from 'next/server'

const R2_HOST = 'pub-5dcdfe9305a740febc87568c9ccb40a6.r2.dev'

export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get('url')
  if (!url) return NextResponse.json({ error: 'Missing url' }, { status: 400 })

  // Only allow our own R2 bucket
  try {
    const parsed = new URL(url)
    if (parsed.hostname !== R2_HOST) {
      return NextResponse.json({ error: 'Unauthorized host' }, { status: 403 })
    }
  } catch {
    return NextResponse.json({ error: 'Invalid url' }, { status: 400 })
  }

  // Pass Range header through so browser seeking works
  const upstreamHeaders: HeadersInit = {}
  const rangeHeader = request.headers.get('Range')
  if (rangeHeader) upstreamHeaders['Range'] = rangeHeader

  const upstream = await fetch(url, { headers: upstreamHeaders })

  if (!upstream.ok && upstream.status !== 206) {
    return NextResponse.json({ error: 'Upstream error' }, { status: upstream.status })
  }

  const responseHeaders = new Headers({
    'Content-Type': 'video/mp4',
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'public, max-age=86400',
  })

  // Pass through range response headers
  for (const h of ['Content-Length', 'Content-Range', 'ETag', 'Last-Modified']) {
    const val = upstream.headers.get(h)
    if (val) responseHeaders.set(h, val)
  }

  return new NextResponse(upstream.body, {
    status: upstream.status, // preserves 206 for range responses
    headers: responseHeaders,
  })
}
