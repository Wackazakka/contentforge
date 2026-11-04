import { NextResponse } from 'next/server'
import { Resend } from 'resend'
import { cronVakt } from '@/lib/cronVakt'
import { admin } from '@/lib/velkomst'

// Feilvarsel fra dropleten (Lars 4.11.2026): «det skal ikke være tilfeldige
// sjekker som avslører at noe henger». Dropleten kaller hit med en gang en
// film feiler, går ut på tid eller blir hengende, og når en låtimport feiler.
//
// For film: utkastet merkes 'failed' (bare hvis det fortsatt peker på denne
// jobben — en nyere produksjon skal ikke overskrives), og artistsiden viser
// det til brukeren. Uansett type sendes én e-post til VARSEL_EPOST.
//
// Body: { type: 'film' | 'import', steg, feil, jobId?, productId?, filnavn?, merk? }
// merk:false = filmen finnes, men leveransen rundt den gikk galt — varsle, men
// ikke merk utkastet som feilet.

export const runtime = 'nodejs'

const MOTTAKER = () => process.env.VARSEL_EPOST || 'lars@norditech.io'

function esc(s: unknown): string {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export async function POST(request: Request) {
  const stopp = cronVakt(request, 'RENDER_VARSEL_SECRET')
  if (stopp) return stopp

  const b = await request.json().catch(() => ({}))
  const type = b?.type === 'import' ? 'import' : 'film'
  const jobId: string | null = b?.jobId ? String(b.jobId) : null
  const steg = String(b?.steg || 'ukjent steg')
  const feil = String(b?.feil || 'ingen feilmelding').slice(0, 2000)
  const merk = b?.merk !== false
  const sb = admin()

  // Finn utkastet (film) og produktet, så e-posten sier HVEM det gjelder
  let draft: { id: string; title: string | null; product_id: string; user_id: string | null; status: string | null } | null = null
  if (type === 'film' && jobId) {
    const { data } = await sb.from('production_drafts').select('id, title, product_id, user_id, status').eq('job_id', jobId).maybeSingle()
    draft = data
    if (draft && merk && draft.status !== 'failed') {
      await sb.from('production_drafts').update({ status: 'failed' }).eq('id', draft.id).eq('job_id', jobId)
    }
  }
  const productId: string | null = draft?.product_id || (b?.productId ? String(b.productId) : null)

  let artist = '(ukjent artist)', bruker = '(ukjent bruker)', tenantNavn = '', origin = 'https://contentforge-610.netlify.app'
  if (productId) {
    const { data: p } = await sb.from('products').select('name, organization_id').eq('id', productId).maybeSingle()
    if (p) {
      artist = p.name || artist
      const { data: o } = await sb.from('organizations').select('owner_id, tenant_id').eq('id', p.organization_id).maybeSingle()
      const uid = draft?.user_id || o?.owner_id
      if (uid) {
        const { data: u } = await sb.auth.admin.getUserById(uid)
        const navn = (u?.user?.user_metadata as any)?.full_name
        if (u?.user?.email) bruker = navn ? `${navn} (${u.user.email})` : u.user.email
      }
      if (o?.tenant_id) {
        const { data: t } = await sb.from('tenants').select('slug, app_name, custom_domain').eq('id', o.tenant_id).maybeSingle()
        if (t) {
          tenantNavn = t.app_name || t.slug
          origin = `https://${t.custom_domain || `${t.slug}.norditech.io`}`
        }
      }
    }
  }

  const tid = new Date().toLocaleString('nb-NO', { timeZone: 'Europe/Oslo', dateStyle: 'short', timeStyle: 'short' })
  const hva = type === 'import' ? `Låtimport feilet${b?.filnavn ? ` («${b.filnavn}»)` : ''}` : `Film feilet${draft?.title ? `: ${draft.title}` : ''}`
  const lenke = draft ? `${origin}/dashboard/products/${draft.product_id}/video/draft/${draft.id}` : productId ? `${origin}/dashboard/products/${productId}` : null
  const rader: Array<[string, string]> = [
    ['Hvem', bruker],
    ['Artist', `${artist}${tenantNavn ? ` · ${tenantNavn}` : ''}`],
    ['Steg', steg],
    ['Feil', feil],
    ['Tidspunkt', tid],
    ...(jobId ? [['Jobb', jobId] as [string, string]] : []),
  ]
  const html = `<div style="font-family:system-ui,sans-serif;font-size:14px;line-height:1.5;color:#1C1A16">
<h2 style="margin:0 0 12px;font-size:18px">⚠️ ${esc(hva)}</h2>
<table style="border-collapse:collapse">${rader.map(([k, v]) => `<tr><td style="padding:3px 14px 3px 0;color:#6b6457;vertical-align:top">${esc(k)}</td><td style="padding:3px 0;white-space:pre-wrap">${esc(v)}</td></tr>`).join('')}</table>
${lenke ? `<p style="margin:16px 0 0"><a href="${esc(lenke)}">Åpne ${draft ? 'utkastet' : 'artisten'}</a></p>` : ''}
${draft && merk ? '<p style="margin:12px 0 0;color:#6b6457">Brukeren ser at filmen feilet på artistsiden og kan prøve igjen fra utkastet.</p>' : ''}
</div>`

  const { error } = await new Resend(process.env.RESEND_API_KEY).emails.send({
    from: 'Produksjonsvarsel <no-reply@send.norditech.io>',
    to: MOTTAKER(),
    subject: `⚠️ ${hva} — ${artist}`,
    html,
  })
  // Resend KASTER IKKE ved feil — { error } må sjekkes
  if (error) {
    console.error('[varsel/produksjon] e-post feilet:', error.message)
    return NextResponse.json({ ok: false, draftMerket: !!draft && merk, feil: error.message }, { status: 502 })
  }
  return NextResponse.json({ ok: true, draftMerket: !!draft && merk })
}
