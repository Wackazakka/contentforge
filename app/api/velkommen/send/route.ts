import { NextResponse } from 'next/server'
import { Resend } from 'resend'
import { admin, hashToken, nyttToken, hentTenant, tenantOrigin, velkomstEpost, visningsfaktor, GYLDIG_TIMER } from '@/lib/velkomst'

// Sender velkomst-e-postene som er forfalt (send_at <= nå, ikke sendt).
// Kalles av droplet-cron med x-cron-secret = WELCOME_SEND_SECRET
// (første runde: fredag 23.10.2026 kl. 19:00, Lars 20.10).
//
// Rekkefølge per invitasjon: krev raden (sent_at settes bare der den er null,
// så to samtidige kall aldri sender dobbelt) → send → ved Resend-feil angres
// kravet, så neste kall prøver igjen. Resend KASTER IKKE ved feil — { error }
// må sjekkes (lærdom 22.09).

export const runtime = 'nodejs'

export async function POST(request: Request) {
  const secret = process.env.WELCOME_SEND_SECRET
  if (!secret || request.headers.get('x-cron-secret') !== secret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const sb = admin()
  const { data: forfalt, error } = await sb
    .from('welcome_invites')
    .select('id, email, full_name, tenant_slug, credits, notat')
    .is('sent_at', null)
    .lte('send_at', new Date().toISOString())
    .limit(50)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const resend = new Resend(process.env.RESEND_API_KEY)
  const resultat: Array<{ email: string; ok: boolean; feil?: string }> = []

  for (const inv of forfalt || []) {
    const tenant = await hentTenant(inv.tenant_slug)
    if (!tenant) { resultat.push({ email: inv.email, ok: false, feil: `ukjent tenant ${inv.tenant_slug}` }); continue }

    const token = nyttToken()
    const naa = new Date()
    const { data: krevd } = await sb
      .from('welcome_invites')
      .update({ token_hash: hashToken(token), sent_at: naa.toISOString(), expires_at: new Date(naa.getTime() + GYLDIG_TIMER * 3600_000).toISOString() })
      .eq('id', inv.id)
      .is('sent_at', null)
      .select('id')
    if (!krevd?.length) continue // et annet kall tok den

    const lenke = `${tenantOrigin(tenant)}/velkommen?t=${encodeURIComponent(token)}`
    const pf = await visningsfaktor(tenant)
    const { subject, html, fra } = velkomstEpost(tenant, lenke, inv.full_name, inv.credits != null ? Number(inv.credits) : null, pf, inv.notat || null)
    try {
      const { error: sendErr } = await resend.emails.send({ from: fra, to: inv.email, subject, html })
      if (sendErr) throw new Error(sendErr.message)
      resultat.push({ email: inv.email, ok: true })
    } catch (err) {
      await sb.from('welcome_invites').update({ token_hash: null, sent_at: null, expires_at: null }).eq('id', inv.id)
      const feil = err instanceof Error ? err.message : String(err)
      console.error('[velkommen/send]', inv.email, feil)
      resultat.push({ email: inv.email, ok: false, feil })
    }
  }

  return NextResponse.json({ sendt: resultat.filter((r) => r.ok).length, resultat })
}
