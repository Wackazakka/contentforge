import { NextRequest, NextResponse } from 'next/server'
import { admin } from '@/lib/velkomst'

const R2_HOST = 'pub-5dcdfe9305a740febc87568c9ccb40a6.r2.dev'

// Brukes av alle «Last ned»-knappene for film. Hver nedlasting logges i
// film_hendelser (Lars 10.11: «Kan du se om de har lastet ned filmene?» — det
// kunne vi ikke). Logging velter aldri nedlastingen.
async function loggNedlasting(url: URL, kilde: string | null) {
  try {
    const jobId = /\/videos\/([0-9a-f-]{36})\//i.exec(url.pathname)?.[1] || null
    const sb = admin()
    const { data: a } = jobId
      ? await sb.from('asset_banks').select('product_id').eq('job_id', jobId).eq('asset_type', 'video').limit(1).maybeSingle()
      : { data: null }
    await sb.from('film_hendelser').insert({
      type: 'nedlasting',
      job_id: jobId,
      product_id: a?.product_id || null,
      meta: { url: url.toString(), kilde: kilde || null },
    })
  } catch (e) {
    console.warn('[video-proxy] nedlasting ikke logget:', e)
  }
}

export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get('url')
  if (!url) return NextResponse.json({ error: 'Missing url' }, { status: 400 })

  let parsed: URL
  try {
    parsed = new URL(url)
    if (parsed.hostname !== R2_HOST) {
      return NextResponse.json({ error: 'Unauthorized host' }, { status: 403 })
    }
  } catch {
    return NextResponse.json({ error: 'Invalid url' }, { status: 400 })
  }

  await loggNedlasting(parsed, request.nextUrl.searchParams.get('kilde'))

  // R2 public URLs handle Range, Content-Length and CORS correctly natively.
  // A redirect avoids buffering through a serverless function and the
  // 206-without-Content-Length problem that causes SRC_NOT_SUPPORTED in browsers.
  return NextResponse.redirect(url, 302)
}
