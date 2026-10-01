import { NextResponse } from 'next/server'
import { redeemCode, secretMatches } from '@/lib/partnerSso'

// Server-til-server: partneren løser inn en kode vi utstedte. Delt hemmelighet i X-Partner-Secret.
export async function POST(request: Request) {
  if (!secretMatches(request.headers.get('x-partner-secret'))) return NextResponse.json({ ok: false, reason: 'forbidden' }, { status: 403 })
  let body: { code?: string } = {}
  try { body = await request.json() } catch { /* tom */ }
  try {
    const user = await redeemCode(body.code || '')
    if (!user) return NextResponse.json({ ok: false, reason: 'invalid_or_used' }, { status: 400 })
    return NextResponse.json({ ok: true, user })
  } catch (e) {
    console.error('[partner/sso/redeem]', e instanceof Error ? e.message : e)
    return NextResponse.json({ ok: false, reason: 'error' }, { status: 500 })
  }
}
