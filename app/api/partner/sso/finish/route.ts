import { NextResponse } from 'next/server'
import { getTenant } from '@/lib/tenantServer'
import { partnerForTenant, resolveLocalUser, sessionTokenFor, SsoError } from '@/lib/partnerSso'

// /sso?code=… med en kode PARTNEREN utstedte: løs inn der borte (delt hemmelighet), knytt til lokal
// konto, og gi klienten et engangs magic-link-token den bytter i en økt (supabase.auth.verifyOtp).
export async function POST(request: Request) {
  const tenant = await getTenant()
  const partner = partnerForTenant(tenant.slug)
  if (!partner) return NextResponse.json({ error: 'Partner-innlogging er ikke aktivert her' }, { status: 404 })
  let body: { code?: string } = {}
  try { body = await request.json() } catch { /* tom */ }
  if (!/^[a-f0-9]{64}$/.test(body.code || '')) return NextResponse.json({ error: 'Ugyldig kode' }, { status: 400 })

  let redeemed: { ok?: boolean; reason?: string; user?: { id: string; email: string; display_name: string | null; email_verified: boolean } } = {}
  try {
    const r = await fetch(`${partner.url}/.netlify/functions/partner-sso-redeem`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Partner-Secret': process.env.PARTNER_SSO_SECRET || '' },
      body: JSON.stringify({ code: body.code }),
    })
    redeemed = await r.json()
  } catch {
    return NextResponse.json({ error: `${partner.name} svarer ikke akkurat nå` }, { status: 502 })
  }
  if (!redeemed.ok || !redeemed.user?.id) {
    return NextResponse.json({ error: redeemed.reason === 'invalid_or_used' ? `Innloggingslenken er utløpt — start på nytt fra ${partner.name}` : `Innlogging via ${partner.name} feilet` }, { status: 400 })
  }
  try {
    const { email } = await resolveLocalUser(partner, redeemed.user)
    const token_hash = await sessionTokenFor(email)
    return NextResponse.json({ token_hash, email })
  } catch (e) {
    if (e instanceof SsoError) return NextResponse.json({ error: e.message }, { status: e.status })
    console.error('[partner/sso/finish]', e)
    return NextResponse.json({ error: 'Kunne ikke logge deg inn' }, { status: 500 })
  }
}
