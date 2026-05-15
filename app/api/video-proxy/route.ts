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

  // R2 public URLs handle Range, Content-Length and CORS correctly natively.
  // A redirect avoids buffering through a serverless function and the
  // 206-without-Content-Length problem that causes SRC_NOT_SUPPORTED in browsers.
  return NextResponse.redirect(url, 302)
}
