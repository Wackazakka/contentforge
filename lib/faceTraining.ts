import { createClient } from '@supabase/supabase-js'

// Fullfoering av ansiktstreninger (091/093) — delt mellom GET /api/characters
// (naar en admin ser paa lista) og cron-jobben hvert tiende minutt.
//
// 🔑 FOER LAA DETTE BARE I ADMINENS SIDEVISNING. Modellen ble flippet til
// «ready», og rettighetshaveren fikk godkjenningsmailen, foerst naar eieren
// av karakteren aapnet «Medvirkende». Lars trente sin foerste modell 22.09 og
// spurte hvor han kunne se at trening paagikk. Svaret var «ingen steder — og
// den blir ikke ferdig foer du aapner en bestemt side». Naa er dette en
// funksjon begge kan kalle, og cron-jobben kaller den uansett.
//
// 🔑 VERTEN I GODKJENNINGSLENKEN UTLEDES FRA KARAKTERENS TENANT, ikke fra
// forespoerselen. En cron-jobb har ingen meningsfull vert, og den gamle koden
// (getTenant()) ville sendt henne til feil merkevare. Samme feil som ble
// rettet i 092 for purringene.

const FAL_KEY = process.env.CONTENTFORGE_FAL_KEY
const STANDARD_ENDEPUNKT = 'fal-ai/flux-lora-portrait-trainer'

function db() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

interface Rad {
  id: string; name: string | null; status: string; fal_request_id: string | null
  trainer: string | null; owner_tenant_id: string | null
  approval_status: string | null; subject_email: string | null; approval_token: string | null
  approval_sent_at: string | null
}

async function vertFor(tenantId: string | null): Promise<{ vert: string; merke: string }> {
  if (tenantId) {
    const { data: t } = await db().from('tenants').select('slug, custom_domain, app_name').eq('id', tenantId).maybeSingle()
    if (t) {
      return {
        vert: t.custom_domain ? `https://${t.custom_domain}` : `https://${t.slug}.norditech.io`,
        merke: t.app_name || 'TwinLedger',
      }
    }
  }
  return { vert: 'https://twinledger.ai', merke: 'TwinLedger' }
}

/**
 * Be rettighetshaveren godkjenne modellen av ansiktet sitt (091).
 *
 * 🔑 LENKEN ER HENNES AUTENTISERING. Hen har ingen konto hos oss og skal ikke
 * trenge en for aa svare paa om ansiktet sitt kan brukes.
 *
 * Feiler stille: modellen staar som `pending`, altsaa STENGT. Det verste en
 * mislykket e-post kan gjoere er aa utsette et ja — ikke aa slippe noe gjennom.
 */
export async function varsleOmGodkjenning(karakterId: string, til: string, token: string, navn: string | null, tenantId: string | null): Promise<boolean> {
  try {
    if (!process.env.RESEND_API_KEY) return false
    const { vert, merke } = await vertFor(tenantId)
    const lenke = `${vert}/godkjenn-ansikt/${token}`
    const { Resend } = await import('resend')
    // 🔑 RESEND KASTER IKKE. SDK-en svarer `{ data, error }` — en avvist
    // sending (ugyldig mottaker, sperret domene, kvote) kommer tilbake som et
    // vanlig svar. Den gamle koden `await`-et og satte approval_sent_at
    // uansett: 22.09 19:49 sto raden som «e-post sendt» mens Lars satt uten
    // mail. Naa: feilen paa raden (last_error), tidsstempelet urørt, og
    // neste tikk proever igjen (se varsleEtterslep).
    const { error: sendFeil } = await new Resend(process.env.RESEND_API_KEY).emails.send({
      from: `${merke} <no-reply@send.norditech.io>`,
      to: til,
      subject: 'Er dette deg? Godkjenn ansiktsmodellen din',
      html: `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#1C1A16">
        <h2 style="margin:0 0 12px">Er dette deg?</h2>
        <p>Vi har laget en ansiktsmodell${navn ? ` («${navn}»)` : ''} fra bildene dine. Før den kan brukes til noe som helst, vil vi at du skal se hva den lager.</p>
        <p>Du får se tre bilder generert med modellen, i ulike situasjoner. Deretter svarer du ja eller nei.</p>
        <p style="margin:24px 0"><a href="${lenke}" style="background:#C5451B;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600">Se bildene og svar</a></p>
        <p style="color:#6B6358;font-size:14px">Til du svarer, er modellen stengt og kan ikke brukes. Du kan ombestemme deg senere uansett hva du svarer nå.</p>
      </div>`,
    })
    if (sendFeil) {
      await db().from('user_characters').update({ last_error: `e-post: ${sendFeil.name || ''} ${sendFeil.message || JSON.stringify(sendFeil)}`.slice(0, 300) }).eq('id', karakterId)
      return false
    }
    // ⚠️ Tidsstempelet settes FOERST NAAR e-posten faktisk gikk. Sto det ved
    // innsetting, ville purresveipet (092) talt dager fra et varsel som
    // kanskje aldri ble sendt — og purret paa noe hun ikke har faatt.
    await db().from('user_characters').update({ approval_sent_at: new Date().toISOString(), last_error: null }).eq('id', karakterId)
    return true
  } catch (e) {
    await db().from('user_characters').update({ last_error: `e-post: ${e instanceof Error ? e.message : String(e)}`.slice(0, 300) }).eq('id', karakterId).then(() => {}, () => {})
    return false
  }
}

/** Menneskelesbar aarsak fra et fal-svar: 422-detaljer som «image_data_url: Field required», ellers det som er. */
function feilTekst(httpStatus: number, body: any): string {
  const d = body?.detail
  if (Array.isArray(d)) return `fal ${httpStatus}: ` + d.map((e: any) => `${(e?.loc || []).filter((x: any) => x !== 'body').join('.')}: ${e?.msg}`).join('; ').slice(0, 300)
  if (typeof d === 'string') return `fal ${httpStatus}: ${d.slice(0, 300)}`
  if (body?.error) return `fal ${httpStatus}: ${String(body.error).slice(0, 300)}`
  return `fal ${httpStatus}: ingen modell i resultatet (${JSON.stringify(body).slice(0, 200)})`
}

/**
 * Spoer fal om status paa alle treninger som paagaar, og fullfoer de ferdige.
 *
 * ⚠️ ENDEPUNKTET ER RADENS, IKKE ET FAST. Den gamle koden spurte alltid
 * flux-lora-portrait-trainer — en modell trent med Flux 2 (093,
 * maaleinstrumentet) ville aldri blitt ferdig, fordi status ble hentet fra
 * feil koe. `trainer` paa raden er endepunktet; det brukes.
 *
 * Idempotent: bare `training`-rader roeres; varsel gaar bare naar
 * approval_sent_at er tom.
 */
export async function fullfoerTreninger(opts: { tenantId?: string } = {}): Promise<{ sjekket: number; ferdige: number; feilet: number; varslet: number }> {
  if (!FAL_KEY) return { sjekket: 0, ferdige: 0, feilet: 0, varslet: 0 }
  let q = db().from('user_characters')
    .select('id, name, status, fal_request_id, trainer, owner_tenant_id, approval_status, subject_email, approval_token, approval_sent_at')
    .eq('status', 'training').not('fal_request_id', 'is', null)
  if (opts.tenantId) q = q.eq('owner_tenant_id', opts.tenantId)
  const { data } = await q
  const rader = (data || []) as Rad[]
  const falAuth = { Authorization: `Key ${FAL_KEY}` }
  let ferdige = 0, feilet = 0, varslet = 0
  for (const row of rader) {
    const endepunkt = row.trainer || STANDARD_ENDEPUNKT
    try {
      const st = await fetch(`https://queue.fal.run/${endepunkt}/requests/${row.fal_request_id}/status`, { headers: falAuth }).then((r) => r.json())
      if (st.status === 'COMPLETED') {
        const resultRes = await fetch(`https://queue.fal.run/${endepunkt}/requests/${row.fal_request_id}`, { headers: falAuth })
        const result = await resultRes.json().catch(() => ({}))
        const url = result?.diffusers_lora_file?.url
        if (!url) {
          // 🔑 «COMPLETED» UTEN MODELL ER EN FEIL, IKKE EN VENTETILSTAND. fal
          // setter en jobb med ugyldig kropp i koe og «fullfoerer» den med en
          // 422 i resultatet. Foer sto det `continue` her: raden ble vaerende
          // i «training» for alltid, ingen e-post, ingen feilmelding — Lars'
          // Flux 2-forsoek 22.09 sto slik i to timer. Naa: failed + aarsak.
          await db().from('user_characters').update({ status: 'failed', last_error: feilTekst(resultRes.status, result) }).eq('id', row.id)
          feilet++
          continue
        }
        await db().from('user_characters').update({ lora_url: url, status: 'ready', last_error: null }).eq('id', row.id)
        ferdige++
        // 🔑 HER BLIR MODELLEN NOE AA GODKJENNE (091) — men ikke noe aa SPOERRE
        // om ennaa. Har hun levert bilder (102), lages proevebildene naa og
        // skaares mot sentroiden hennes foer e-posten gaar (105, neste tikk).
        // Uten sentroide (modell fra en zip uten levering) gaar varselet som
        // foer, og sida lager bildene naar hun aapner den.
        if (row.approval_status === 'pending' && row.subject_email && row.approval_token && !row.approval_sent_at) {
          const { hentSentroide, startProever } = await import('@/lib/faceSamples')
          const sentroide = await hentSentroide(row.subject_email, row.owner_tenant_id)
          if (sentroide) {
            try {
              const { hentAnsiktForProeve } = await import('@/lib/faceWithdrawal')
              await startProever(await hentAnsiktForProeve(row.id), row.id, 0)
              continue
            } catch { /* fall tilbake til varsel uten port */ }
          }
          if (await varsleOmGodkjenning(row.id, row.subject_email, row.approval_token, row.name, row.owner_tenant_id)) varslet++
        }
      } else if (st.status === 'FAILED' || st.status === 'ERROR') {
        // Aarsaken ligger i resultatet, ikke i statusen — hent den om den finnes.
        const detalj = await fetch(`https://queue.fal.run/${endepunkt}/requests/${row.fal_request_id}`, { headers: falAuth })
          .then(async (r) => feilTekst(r.status, await r.json().catch(() => ({})))).catch(() => `fal: ${st.status}`)
        await db().from('user_characters').update({ status: 'failed', last_error: detalj }).eq('id', row.id)
        feilet++
      }
    } catch { /* behold 'training' til neste poll */ }
  }
  const port = await fullfoerProever(opts.tenantId)
  varslet += port.varslet
  feilet += port.stoppet
  varslet += await varsleEtterslep(opts.tenantId)
  return { sjekket: rader.length, ferdige, feilet, varslet }
}

/**
 * Kvalitetsporten (105): hent ferdige proevebilder, skaar dem mot sentroiden
 * hennes, og send e-posten bare naar de likner.
 *
 * 🔑 EN MODELL SOM IKKE LIKNER ER EN FEILET TRENING, IKKE ET SPOERSMAAL TIL
 * HENNE. Lars sa nei til tre bilder som maalt laa paa 0,36 (22.09). Slike
 * modeller settes til «failed» med tallene i last_error — adminen ser dem i
 * Medvirkende — og hun hoerer aldri om dem.
 *
 * Batch eldre enn 10 min med jobber som aldri kom: porten gis opp, varselet
 * gaar som foer, og sida lager bildene selv. Bedre et spoersmaal uten port
 * enn et ansikt som aldri blir spurt om.
 */
async function fullfoerProever(tenantId?: string): Promise<{ varslet: number; stoppet: number }> {
  const { hentFerdigeProever, hentSentroide, vurderProever, likhetTekst, SCENER } = await import('@/lib/faceSamples')
  let q = db().from('user_characters')
    .select('id, name, owner_tenant_id, subject_email, approval_token, sample_urls, sample_pending')
    .eq('status', 'ready').eq('approval_status', 'pending').is('approval_sent_at', null)
    .not('sample_pending', 'is', null).not('subject_email', 'is', null).not('approval_token', 'is', null)
  if (tenantId) q = q.eq('owner_tenant_id', tenantId)
  const { data } = await q
  let varslet = 0, stoppet = 0
  for (const r of (data || []) as (Pick<Rad, 'id' | 'name' | 'owner_tenant_id' | 'subject_email' | 'approval_token'> & { sample_urls: unknown; sample_pending: unknown })[]) {
    try {
      const { stier, pending, batch } = await hentFerdigeProever(r.id, r.sample_urls, r.sample_pending)
      if (pending) {
        const alder = batch ? Date.now() - new Date(batch.submitted_at).getTime() : 0
        if (alder < 10 * 60_000) continue
        await db().from('user_characters').update({ sample_pending: null }).eq('id', r.id)
      }
      if (stier.length < SCENER.length && pending === false && stier.length > 0) {
        // Noen scener feilet hos fal: send dem paa nytt, vent til neste tikk.
        const { startProever } = await import('@/lib/faceSamples')
        const { hentAnsiktForProeve } = await import('@/lib/faceWithdrawal')
        await startProever(await hentAnsiktForProeve(r.id), r.id, stier.length)
        continue
      }
      const sentroide = await hentSentroide(r.subject_email, r.owner_tenant_id)
      const vurdering = stier.length && sentroide ? await vurderProever(stier, sentroide) : null
      if (vurdering) await db().from('user_characters').update({ sample_scores: vurdering }).eq('id', r.id)
      if (vurdering && !vurdering.passed) {
        await db().from('user_characters').update({ status: 'failed', last_error: `Prøvebildene likner ikke nok på henne (${likhetTekst(vurdering)}). Ikke sendt.` }).eq('id', r.id)
        stoppet++
        continue
      }
      if (await varsleOmGodkjenning(r.id, r.subject_email!, r.approval_token!, r.name, r.owner_tenant_id)) varslet++
    } catch { /* neste tikk */ }
  }
  return { varslet, stoppet }
}

/**
 * Ferdige modeller som venter paa godkjenning, men der varselet aldri gikk.
 *
 * 🔑 EN MISLYKKET E-POST SKAL IKKE VAERE ENDESTASJON. Foer gikk varselet bare i
 * det ene oeyeblikket modellen ble flippet til «ready»; feilet sendingen der
 * (eller ble den bare RAPPORTERT som sendt), fantes ingen vei til et nytt
 * forsoek — bare purresveipet (092), som forutsetter at foerste varsel gikk.
 * Naa proever hvert tikk paa nytt til approval_sent_at er satt. Idempotent:
 * tidsstempelet settes bare naar Resend faktisk tok imot.
 */
async function varsleEtterslep(tenantId?: string): Promise<number> {
  let q = db().from('user_characters')
    .select('id, name, owner_tenant_id, subject_email, approval_token')
    .eq('status', 'ready').eq('approval_status', 'pending').is('approval_sent_at', null)
    .not('subject_email', 'is', null).not('approval_token', 'is', null)
    // Rader med proevebilder underveis eies av porten (fullfoerProever).
    .is('sample_pending', null)
  if (tenantId) q = q.eq('owner_tenant_id', tenantId)
  const { data } = await q
  let n = 0
  for (const r of (data || []) as Pick<Rad, 'id' | 'name' | 'owner_tenant_id' | 'subject_email' | 'approval_token'>[]) {
    if (await varsleOmGodkjenning(r.id, r.subject_email!, r.approval_token!, r.name, r.owner_tenant_id)) n++
  }
  return n
}
