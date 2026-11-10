import { NextResponse } from 'next/server'
import { Resend } from 'resend'
import { cronVakt } from '@/lib/cronVakt'
import { admin, hentTenant, skjemaEpost } from '@/lib/velkomst'

// Be testere svare på spørreskjemaet (Lars 10.11.2026). Kalles for hånd med
// x-cron-secret = CRON_SECRET (WELCOME_SEND_SECRET er dashbord-maskert og
// kan ikke leses lokalt) og { epost: [...] }. Avsender, svar-til
// og hilsen hentes fra testerens siste invitasjon, som i påminnelsen.
// forhandsvisTil: sender til den adressen i stedet, med [TEST] i emnet.

export const runtime = 'nodejs'

export async function POST(request: Request) {
  const stopp = cronVakt(request)
  if (stopp) return stopp

  const body = await request.json().catch(() => ({}))
  const adresser: string[] = Array.isArray(body?.epost) ? body.epost.map((e: unknown) => String(e).trim().toLowerCase()).filter(Boolean) : []
  const forhandsvisTil = typeof body?.forhandsvisTil === 'string' && body.forhandsvisTil.includes('@') ? body.forhandsvisTil.trim() : null
  if (!adresser.length) return NextResponse.json({ error: 'epost mangler' }, { status: 400 })

  const sb = admin()
  const resend = new Resend(process.env.RESEND_API_KEY)
  const resultat: Array<{ email: string; ok: boolean; feil?: string }> = []

  for (const email of adresser) {
    const { data: inv } = await sb
      .from('welcome_invites')
      .select('email, full_name, tenant_slug, svar_til, hilsen_fra')
      .eq('email', email)
      .not('sent_at', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (!inv) { resultat.push({ email, ok: false, feil: 'ingen sendt invitasjon' }); continue }
    const tenant = await hentTenant(inv.tenant_slug)
    if (!tenant) { resultat.push({ email, ok: false, feil: `ukjent tenant ${inv.tenant_slug}` }); continue }

    const { subject, html, fra } = skjemaEpost(tenant, inv.full_name, inv.svar_til || null, inv.hilsen_fra || null)
    // Resend KASTER IKKE ved feil — { error } må sjekkes
    const { error } = await resend.emails.send({
      from: fra,
      to: forhandsvisTil || inv.email,
      subject: forhandsvisTil ? `[TEST] ${subject}` : subject,
      html,
      ...(inv.svar_til ? { replyTo: inv.svar_til } : {}),
    })
    if (error) { console.error('[velkommen/sporreskjema]', email, error.message); resultat.push({ email, ok: false, feil: error.message }); continue }
    resultat.push({ email, ok: true })
    if (forhandsvisTil) break // én forhåndsvisning holder
  }

  return NextResponse.json({ sendt: resultat.filter((r) => r.ok).length, resultat })
}
