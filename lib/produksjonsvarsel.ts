import { Resend } from 'resend'
import { admin } from '@/lib/velkomst'

// Felles produksjonsvarsel (flyttet ut av /api/varsel/produksjon 10.11.2026,
// så produksjonsvakten kan bruke samme logikk uten å kalle seg selv over HTTP).
//
// For film: utkastet merkes 'failed' (bare hvis det fortsatt peker på denne
// jobben — en nyere produksjon skal ikke overskrives), og artistsiden viser
// det til brukeren. Uansett type sendes én e-post til VARSEL_EPOST.
//
// merk:false = filmen finnes, men leveransen rundt den gikk galt — varsle, men
// ikke merk utkastet som feilet.

export type Produksjonsvarsel = {
  type?: 'film' | 'import' | 'publisering'
  steg?: string
  feil?: string
  jobId?: string | null
  productId?: string | null
  filnavn?: string | null
  merk?: boolean
}

const MOTTAKER = () => process.env.VARSEL_EPOST || 'lars@norditech.io'

function esc(s: unknown): string {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export async function varsleProduksjon(b: Produksjonsvarsel): Promise<{ ok: boolean; draftMerket: boolean; feil?: string }> {
  const type = b?.type === 'import' || b?.type === 'publisering' ? b.type : 'film'
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
  const hva = type === 'import'
    ? `Låtimport feilet${b?.filnavn ? ` («${b.filnavn}»)` : ''}`
    : type === 'publisering'
      ? 'Planlagt publisering har ikke gått ut'
      : `Film feilet${draft?.title ? `: ${draft.title}` : ''}`
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
    console.error('[produksjonsvarsel] e-post feilet:', error.message)
    return { ok: false, draftMerket: !!draft && merk, feil: error.message }
  }
  return { ok: true, draftMerket: !!draft && merk }
}
