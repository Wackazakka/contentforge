import { NextResponse } from 'next/server'
import { Resend } from 'resend'
import { cronVakt } from '@/lib/cronVakt'
import { admin } from '@/lib/velkomst'
import { TESTFILM_PRODUKT } from '@/lib/testfilmer'

// Morgenoppsummering (Lars 10.11.2026: «det burde ikke være sånn at jeg må
// spørre»). Hver morgen kl. 07: hva testerne har gjort siste døgn, hvilke
// filmer som ble ferdige og hvilke som feilet, nattens testfilmer, nye
// supportmeldinger og om renderserveren svarer. Sendes også når ingenting
// har skjedd — da vet Lars at oppsummeringen selv lever.

export const runtime = 'nodejs'

const DROPLET_URL = 'http://139.59.212.218:3002'
const MOTTAKER = () => process.env.VARSEL_EPOST || 'lars@norditech.io'
// Lars' egne adresser er ikke testere
const ER_LARS = (e: string) => /@(reforhandle\.no|norditech\.io)$|kilevold/i.test(e)

const esc = (s: unknown) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
// timestamp without time zone = UTC uten «Z»
const utc = (s: string) => new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(s) ? s : s.replace(' ', 'T') + 'Z')
const kl = (s: string) => utc(s).toLocaleString('nb-NO', { timeZone: 'Europe/Oslo', weekday: 'short', hour: '2-digit', minute: '2-digit' })

export async function POST(request: Request) {
  const stopp = cronVakt(request)
  if (stopp) return stopp

  const sb = admin()
  const fra = new Date(Date.now() - 24 * 3600 * 1000).toISOString()

  const [{ data: brukereData }, { data: invites }, { data: utkast }, { data: videoer }, { data: support }, { data: testutkast }] = await Promise.all([
    sb.auth.admin.listUsers({ perPage: 1000 }),
    sb.from('welcome_invites').select('email, full_name, tenant_slug'),
    sb.from('production_drafts').select('id, title, status, job_id, product_id, user_id, created_at, updated_at').or(`created_at.gte.${fra},updated_at.gte.${fra}`).neq('product_id', TESTFILM_PRODUKT),
    sb.from('asset_banks').select('job_id, product_id, created_at').eq('asset_type', 'video').gte('created_at', fra).neq('product_id', TESTFILM_PRODUKT),
    sb.from('support_requests').select('email, melding, side, created_at').gte('created_at', fra).order('created_at'),
    sb.from('production_drafts').select('title, status, job_id, updated_at').eq('product_id', TESTFILM_PRODUKT).like('title', 'TEST %').order('title'),
  ])
  const brukere = brukereData?.users || []
  const epostFor = new Map(brukere.map((u) => [u.id, u.email || '']))

  // Produkt → eier (utkast mangler ofte user_id)
  const produktIder = [...new Set([...(utkast || []).map((d) => d.product_id), ...(videoer || []).map((v) => v.product_id)])]
  const { data: produkter } = produktIder.length
    ? await sb.from('products').select('id, name, created_by').in('id', produktIder)
    : { data: [] as Array<{ id: string; name: string; created_by: string }> }
  const produkt = new Map((produkter || []).map((p) => [p.id, p]))
  const hvem = (productId: string, userId?: string | null) => epostFor.get(userId || '') || epostFor.get(produkt.get(productId)?.created_by || '') || '(ukjent)'

  // ── Testerne ──────────────────────────────────────────────────────────────
  const testere = new Map<string, string>()
  for (const i of invites || []) if (i.email && !ER_LARS(i.email)) testere.set(i.email.toLowerCase(), i.full_name || i.email)
  type Rad = { navn: string; innlogget: boolean; nyeUtkast: number; startet: number; ferdig: number; feilet: number; nedlastinger: number }
  const perTester = new Map<string, Rad>()
  const rad = (e: string) => {
    const k = e.toLowerCase()
    if (!perTester.has(k)) perTester.set(k, { navn: testere.get(k) || e, innlogget: false, nyeUtkast: 0, startet: 0, ferdig: 0, feilet: 0, nedlastinger: 0 })
    return perTester.get(k)!
  }
  for (const u of brukere) {
    const e = (u.email || '').toLowerCase()
    if (testere.has(e) && u.last_sign_in_at && new Date(u.last_sign_in_at).toISOString() >= fra) rad(e).innlogget = true
  }
  const ferdigeJobber = new Set((videoer || []).map((v) => String(v.job_id)))
  for (const d of utkast || []) {
    const e = hvem(d.product_id, d.user_id).toLowerCase()
    if (!testere.has(e)) continue
    const r = rad(e)
    if (utc(d.created_at).toISOString() >= fra) r.nyeUtkast++
    if (d.job_id && utc(d.updated_at).toISOString() >= fra) {
      r.startet++
      if (d.status === 'failed') r.feilet++
    }
  }
  for (const v of videoer || []) {
    const e = hvem(v.product_id).toLowerCase()
    if (testere.has(e)) rad(e).ferdig++
  }

  // Totalt: hvor mange testere har fått en ferdig film — og hvor mange klarte
  // det selv, uten at vi startet produksjonen på nytt for dem (film_hendelser)
  const [{ data: alleVideoer }, { data: hendelser }, { data: skjemaSvar }] = await Promise.all([
    sb.from('asset_banks').select('product_id, job_id').eq('asset_type', 'video'),
    sb.from('film_hendelser').select('type, job_id, product_id, created_at'),
    sb.from('feedback_responses').select('user_id, answers, created_at, updated_at'),
  ])
  const alleProduktIder = [...new Set([...(alleVideoer || []).map((v) => v.product_id), ...(hendelser || []).map((h) => h.product_id).filter(Boolean)])]
  const { data: alleProdukter } = alleProduktIder.length ? await sb.from('products').select('id, created_by').in('id', alleProduktIder) : { data: [] as Array<{ id: string; created_by: string }> }
  const eierAv = new Map((alleProdukter || []).map((p) => [p.id, (epostFor.get(p.created_by) || '').toLowerCase()]))
  const hjulpet = new Set((hendelser || []).filter((h) => h.type === 'startet_av_oss').map((h) => String(h.job_id)))
  const medFilm = new Set<string>(), selv = new Set<string>()
  for (const v of alleVideoer || []) {
    const e = eierAv.get(v.product_id) || ''
    if (!testere.has(e)) continue
    medFilm.add(e)
    if (!hjulpet.has(String(v.job_id))) selv.add(e)
  }
  const lastetNed = new Set<string>()
  for (const h of hendelser || []) {
    if (h.type !== 'nedlasting') continue
    const e = eierAv.get(h.product_id || '') || ''
    if (!testere.has(e)) continue
    lastetNed.add(e)
    if (new Date(h.created_at).toISOString() >= fra) rad(e).nedlastinger++
  }
  const nyeSkjema = (skjemaSvar || []).filter((s) => new Date(s.updated_at || s.created_at).toISOString() >= fra)

  // ── Alle produksjoner siste døgn (alle tenants) ───────────────────────────
  const startet = (utkast || []).filter((d) => d.job_id && utc(d.updated_at).toISOString() >= fra)
  const feilet = startet.filter((d) => d.status === 'failed')
  const underveis = startet.filter((d) => d.status === 'processing' && !ferdigeJobber.has(String(d.job_id)))

  // ── Renderserveren ────────────────────────────────────────────────────────
  let server = 'svarer ikke'
  try {
    const r = await fetch(`${DROPLET_URL}/health`, { signal: AbortSignal.timeout(10000) })
    server = r.ok ? 'svarer' : `svarer med feil (${r.status})`
  } catch { /* svarer ikke */ }

  // ── Testfilmene i natt ────────────────────────────────────────────────────
  const testRader: Array<{ tittel: string; status: string }> = []
  for (const t of testutkast || []) {
    let status = t.status === 'failed' ? '❌ feilet' : t.status === 'processing' ? '⏳ ikke ferdig' : '—'
    if (t.job_id) {
      const { data: v } = await sb.from('asset_banks').select('created_at').eq('job_id', t.job_id).eq('asset_type', 'video').limit(1).maybeSingle()
      if (v) status = `✅ ferdig ${kl(v.created_at)}`
    }
    if (t.updated_at && utc(t.updated_at).toISOString() < fra) status = `⚠️ ikke kjørt siste døgn (${status})`
    testRader.push({ tittel: t.title.replace(/^TEST \d+ · /, ''), status })
  }
  const testerOk = testRader.length > 0 && testRader.every((r) => r.status.startsWith('✅'))

  // ── E-posten ──────────────────────────────────────────────────────────────
  const aktive = [...perTester.values()].filter((r) => r.innlogget || r.nyeUtkast || r.startet || r.ferdig || r.nedlastinger)
  const td = 'padding:4px 12px 4px 0;vertical-align:top;border-bottom:1px solid #eee'
  const th = 'padding:4px 12px 4px 0;text-align:left;color:#6b6457;font-weight:500'
  const tabell = (hode: string[], rader: string[][]) =>
    `<table style="border-collapse:collapse;margin:6px 0 4px">${'<tr>' + hode.map((h) => `<th style="${th}">${esc(h)}</th>`).join('') + '</tr>'}${rader.map((r) => '<tr>' + r.map((c) => `<td style="${td}">${c}</td>`).join('') + '</tr>').join('')}</table>`
  const h3 = (t: string) => `<h3 style="margin:22px 0 4px;font-size:15px">${t}</h3>`
  const liste = (ds: typeof startet) => ds.map((d) => `${esc(produkt.get(d.product_id)?.name || '?')} – «${esc(d.title)}» (${esc(hvem(d.product_id, d.user_id))}, startet ${kl(d.updated_at)})`).join('<br>')

  const deler: string[] = []
  deler.push(h3('Testerne siste døgn'))
  deler.push(aktive.length
    ? tabell(['Tester', 'Innlogget', 'Nye utkast', 'Startet', 'Ferdige filmer', 'Feilet', 'Lastet ned'],
        aktive.map((r) => [esc(r.navn), r.innlogget ? 'ja' : '–', String(r.nyeUtkast || '–'), String(r.startet || '–'), String(r.ferdig || '–'), r.feilet ? `<b style="color:#b3261e">${r.feilet}</b>` : '–', String(r.nedlastinger || '–')]))
    : '<p style="margin:4px 0;color:#6b6457">Ingen testere har vært aktive.</p>')
  deler.push(`<p style="margin:6px 0;color:#6b6457">Totalt: ${medFilm.size} av ${testere.size} testere har fått minst én ferdig film — ${selv.size} klarte det selv, ${medFilm.size - selv.size} bare med vår hjelp. ${lastetNed.size} har lastet ned en film (telles fra 10.11).</p>`)
  deler.push(`<p style="margin:6px 0;color:#6b6457">Spørreskjema: ${(skjemaSvar || []).length} svar totalt${nyeSkjema.length ? `, <b style="color:#1C1A16">${nyeSkjema.length} nytt siste døgn</b>` : ''}.</p>`)
  for (const s of nyeSkjema) {
    const a: any = s.answers || {}
    const e = epostFor.get(s.user_id || '') || '?'
    deler.push(`<p style="margin:6px 0;padding:8px 10px;background:#f6f4ef;border-radius:6px"><b>${esc(testere.get(e.toLowerCase()) || e)}</b>: fornøyd ${esc(a.fornoyd ?? '?')}/5 · lett ${esc(a.lett ?? '?')}/5 · ferdig video: ${esc(a.ferdig_video ?? '?')}${a.feil?.beskrivelse ? `<br>Feil: ${esc(String(a.feil.beskrivelse).slice(0, 300))}` : ''}${a.bedre ? `<br>Bedre: ${esc(String(a.bedre).slice(0, 300))}` : ''}</p>`)
  }

  deler.push(h3('Produksjoner siste døgn (alle)'))
  deler.push(`<p style="margin:4px 0">${startet.length} startet · ${(videoer || []).length} ferdige filmer · ${feilet.length} feilet · ${underveis.length} ikke ferdig ennå</p>`)
  if (feilet.length) deler.push(`<p style="margin:6px 0;color:#b3261e"><b>Feilet:</b><br>${liste(feilet)}</p>`)
  if (underveis.length) deler.push(`<p style="margin:6px 0"><b>Ikke ferdig ennå:</b><br>${liste(underveis)}</p>`)

  deler.push(h3(`Testfilmer i natt ${testerOk ? '✅' : '⚠️'}`))
  deler.push(testRader.length ? tabell(['Test', 'Resultat'], testRader.map((r) => [esc(r.tittel), esc(r.status)])) : '<p style="margin:4px 0">Fant ingen testfilmer.</p>')

  deler.push(h3('Support'))
  deler.push((support || []).length
    ? (support || []).map((s) => `<p style="margin:6px 0"><b>${esc(s.email || '?')}</b> (${kl(s.created_at)}${s.side ? `, ${esc(s.side)}` : ''}):<br>${esc(String(s.melding || '').slice(0, 400))}</p>`).join('')
    : '<p style="margin:4px 0;color:#6b6457">Ingen nye meldinger.</p>')

  deler.push(h3('Renderserveren'))
  deler.push(`<p style="margin:4px 0">${server === 'svarer' ? '✅ svarer' : `<b style="color:#b3261e">⚠️ ${esc(server)}</b>`}</p>`)

  const problemer = feilet.length + (testerOk ? 0 : 1) + (server === 'svarer' ? 0 : 1)
  const dato = new Date().toLocaleDateString('nb-NO', { timeZone: 'Europe/Oslo', weekday: 'long', day: 'numeric', month: 'long' })
  const html = `<div style="font-family:system-ui,sans-serif;font-size:14px;line-height:1.5;color:#1C1A16;max-width:680px">
<h2 style="margin:0 0 4px;font-size:18px">${problemer ? '⚠️' : '✅'} Morgenoppsummering ${esc(dato)}</h2>
<p style="margin:0;color:#6b6457">Siste 24 timer. ${problemer ? `${problemer} ting trenger oppmerksomhet.` : 'Alt gikk som det skulle.'}</p>
${deler.join('\n')}
</div>`

  const { error } = await new Resend(process.env.RESEND_API_KEY).emails.send({
    from: 'Morgenoppsummering <no-reply@send.norditech.io>',
    to: MOTTAKER(),
    subject: `${problemer ? '⚠️' : '✅'} Morgenoppsummering: ${aktive.length} aktive testere, ${(videoer || []).length} ferdige filmer${feilet.length ? `, ${feilet.length} feilet` : ''}`,
    html,
  })
  // Resend KASTER IKKE ved feil — { error } må sjekkes
  if (error) return NextResponse.json({ ok: false, feil: error.message }, { status: 502 })
  return NextResponse.json({ ok: true, aktive: aktive.length, ferdige: (videoer || []).length, feilet: feilet.length, testerOk, server })
}
