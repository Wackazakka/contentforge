import { NextResponse } from 'next/server'
import { Resend } from 'resend'
import { cronVakt } from '@/lib/cronVakt'
import { admin, hentTenant, fritekstEpost } from '@/lib/velkomst'

// Fri e-post til én tester (Lars 10.11). Kalles for hånd med
// x-cron-secret = CRON_SECRET og
//   { epost, emne, overskrift, avsnitt: string[], knapp?: { tekst, sti }, forhandsvisTil? }
// Avsender, svar-til og hilsen hentes fra testerens siste invitasjon.

export const runtime = 'nodejs'

export async function POST(request: Request) {
  const stopp = cronVakt(request)
  if (stopp) return stopp

  const b = await request.json().catch(() => ({}))
  const epost = String(b?.epost || '').trim().toLowerCase()
  const emne = String(b?.emne || '').trim()
  const overskrift = String(b?.overskrift || '').trim()
  const avsnitt: string[] = Array.isArray(b?.avsnitt) ? b.avsnitt.map((a: unknown) => String(a)).filter(Boolean) : []
  const knapp = b?.knapp?.tekst && b?.knapp?.sti ? { tekst: String(b.knapp.tekst), sti: String(b.knapp.sti) } : null
  const forhandsvisTil = typeof b?.forhandsvisTil === 'string' && b.forhandsvisTil.includes('@') ? b.forhandsvisTil.trim() : null
  if (!epost || !emne || !overskrift || !avsnitt.length) return NextResponse.json({ error: 'epost, emne, overskrift og avsnitt kreves' }, { status: 400 })

  const sb = admin()
  const { data: inv } = await sb
    .from('welcome_invites')
    .select('email, full_name, tenant_slug, svar_til, hilsen_fra')
    .eq('email', epost)
    .not('sent_at', 'is', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (!inv) return NextResponse.json({ error: 'ingen sendt invitasjon' }, { status: 404 })
  const tenant = await hentTenant(inv.tenant_slug)
  if (!tenant) return NextResponse.json({ error: `ukjent tenant ${inv.tenant_slug}` }, { status: 404 })

  const { html, fra } = fritekstEpost(tenant, inv.full_name, overskrift, avsnitt, knapp, inv.svar_til || null, inv.hilsen_fra || null)
  // Resend KASTER IKKE ved feil — { error } må sjekkes
  const { error } = await new Resend(process.env.RESEND_API_KEY).emails.send({
    from: fra,
    to: forhandsvisTil || inv.email,
    subject: forhandsvisTil ? `[TEST] ${emne}` : emne,
    html,
    ...(inv.svar_til ? { replyTo: inv.svar_til } : {}),
  })
  if (error) return NextResponse.json({ ok: false, feil: error.message }, { status: 502 })
  return NextResponse.json({ ok: true, til: forhandsvisTil || inv.email })
}
