import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get('url')
  if (!url) return NextResponse.json({ error: 'Missing url' }, { status: 400 })

  // Only allow our own R2 bucket
  const R2_HOST = 'pub-5dcdfe9305a740febc87568c9ccb40a6.r2.dev'
  try {
    const parsed = new URL(url)
    if (parsed.hostname !== R2_HOST) {
      return NextResponse.json({ error: 'Unauthorized host' }, { status: 403 })
    }
  } catch {
    return NextResponse.json({ error: 'Invalid url' }, { status: 400 })
  }

  const upstream = await fetch(url)
  if (!upstream.ok) {
    return NextResponse.json({ error: 'Upstream error' }, { status: upstream.status })
  }

  const filename = url.split('/').pop() || 'video.mp4'
  const headers = new Headers({
    'Content-Type': 'video/mp4',
    'Content-Disposition': `attachment; filename="${filename}"`,
  })
  const contentLength = upstream.headers.get('Content-Length')
  if (contentLength) headers.set('Content-Length', contentLength)

  return new NextResponse(upstream.body, { status: 200, headers })
}
