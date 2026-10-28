import { createClient } from '@supabase/supabase-js'
import {
  gjeldendeInnsyn, ser, erInnsyn, manusFraSegmenter, dropletResultat,
  type Innsyn, type TekstSort, type ResultatSort,
} from '@/lib/usageDetails'

// Rettighetshaverens innsyn i HVA tvillingen ble brukt til (127) — serverdelen.
// Se lib/usageDetails.ts for nivåene og hvorfor teksten ligger utenfor hovedboken.
//
// 🔑 FILTRERINGEN SKJER HER, ALDRI I NETTLESEREN. Det et byrå har valgt å holde
// tilbake, skal ikke ligge i svaret og vente på at noen åpner utviklerverktøyet.

function db() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || '', process.env.SUPABASE_SERVICE_ROLE_KEY || '')
}

export interface BrukRad {
  id: string
  licence_id: string | null
  product_id?: string | null
  draft_id?: string | null
  job_id?: string | null
  asset_type?: string | null
  meta?: Record<string, unknown> | null
}

export interface BrukInnsyn {
  insight: Innsyn
  productName: string | null
  text: string | null
  textKind: TekstSort | null
  // Bare på fullt innsyn. ready=false: jobben er ikke ferdig (eller feilet).
  output: { kind: ResultatSort; ready: boolean } | null
}

interface Detalj {
  event_id: string; text_body: string | null; text_kind: TekstSort | null
  output_url: string | null; output_kind: ResultatSort | null; output_store: string | null; job_id: string | null
}

/** Byråets standard, eller null for en drop-in (og når kolonnen ikke finnes ennå). */
export async function byraaStandard(talentAgentId: string | null | undefined): Promise<string | null> {
  if (!talentAgentId) return null
  const { data, error } = await db().from('talent_agents').select('default_actor_insight').eq('id', talentAgentId).maybeSingle()
  if (error) return null
  return (data as { default_actor_insight?: string } | null)?.default_actor_insight ?? null
}

/** Nivået per lisens. Uten kolonnen (127 ikke kjørt): tomt, og da gjelder standarden. */
export async function lisensNivaaer(licenceIds: string[]): Promise<Map<string, Innsyn>> {
  const ut = new Map<string, Innsyn>()
  if (licenceIds.length === 0) return ut
  const { data, error } = await db().from('licences').select('id, actor_insight').in('id', licenceIds)
  if (error) return ut
  for (const l of (data || []) as Array<{ id: string; actor_insight: string }>) if (erInnsyn(l.actor_insight)) ut.set(l.id, l.actor_insight)
  return ut
}

async function detaljer(eventIds: string[]): Promise<Map<string, Detalj>> {
  const ut = new Map<string, Detalj>()
  if (eventIds.length === 0) return ut
  const { data, error } = await db().from('voice_usage_details')
    .select('event_id, text_body, text_kind, output_url, output_kind, output_store, job_id').in('event_id', eventIds)
  if (error) return ut
  for (const d of (data || []) as Detalj[]) ut.set(d.event_id, d)
  return ut
}

const erFilm = (e: BrukRad) => (e.meta as { kind?: string } | null)?.kind === 'video'

/**
 * Hvor resultatet ligger, og om det er ferdig. Bruk fra før 127 har ingen
 * detaljrad; for film kan både teksten (utkastet) og fila (jobben) finnes
 * likevel, så de hentes derfra.
 */
function resultatKilde(e: BrukRad, d: Detalj | undefined): { url: string; kind: ResultatSort; store: string; jobId: string | null } | null {
  if (d?.output_url && d.output_kind) return { url: d.output_url, kind: d.output_kind, store: d.output_store || 'r2', jobId: d.job_id }
  if (erFilm(e) && e.job_id) {
    const r = dropletResultat('video', e.job_id)
    return { url: r.url!, kind: r.kind, store: 'r2', jobId: e.job_id }
  }
  return null
}

/** Ferdige jobber: dropleten legger en asset_banks-rad når fila er lastet opp. */
async function ferdigeJobber(jobIds: string[]): Promise<Map<string, string>> {
  const ut = new Map<string, string>()
  if (jobIds.length === 0) return ut
  const { data } = await db().from('asset_banks').select('job_id, asset_url, asset_type').in('job_id', jobIds)
  for (const a of (data || []) as Array<{ job_id: string; asset_url: string; asset_type: string }>) {
    // En film har også stillbilder i banken; det er filen vi vil ha.
    if (a.asset_type === 'video' || !ut.has(a.job_id)) ut.set(a.job_id, a.asset_url)
  }
  return ut
}

/** Innsynet for en liste bruk, med nivået hver enkelt rad gir. */
export async function innsynForBruk(o: { talentAgentId: string | null | undefined; events: BrukRad[] }): Promise<Map<string, BrukInnsyn>> {
  const ut = new Map<string, BrukInnsyn>()
  const events = o.events
  if (events.length === 0) return ut
  try {
    const harByraa = !!o.talentAgentId
    const [standard, nivaaer, det] = await Promise.all([
      byraaStandard(o.talentAgentId),
      lisensNivaaer([...new Set(events.map((e) => e.licence_id).filter((x): x is string => !!x))]),
      detaljer(events.map((e) => e.id)),
    ])
    const niva = (e: BrukRad) => gjeldendeInnsyn({ harByraa, lisens: e.licence_id ? nivaaer.get(e.licence_id) : null, byraaStandard: standard })

    // Produktnavn — bare for rader som får se dem.
    const prodIder = [...new Set(events.map((e) => e.product_id).filter((x): x is string => !!x))]
    const navn = new Map<string, string>()
    if (prodIder.length) {
      const { data } = await db().from('products').select('id, name').in('id', prodIder)
      for (const p of (data || []) as Array<{ id: string; name: string }>) navn.set(p.id, p.name)
    }

    // Filmmanus fra utkastet for bruk som mangler tekst (før 127).
    const utkastIder = [...new Set(events.filter((e) => erFilm(e) && e.draft_id && !det.get(e.id)?.text_body && ser(niva(e), 'script')).map((e) => e.draft_id as string))]
    const manus = new Map<string, string>()
    if (utkastIder.length) {
      const { data } = await db().from('production_drafts').select('id, segments').in('id', utkastIder)
      for (const u of (data || []) as Array<{ id: string; segments: unknown }>) {
        const m = manusFraSegmenter(u.segments)
        if (m) manus.set(u.id, m)
      }
    }

    const jobIder = [...new Set(events.filter((e) => ser(niva(e), 'full')).map((e) => resultatKilde(e, det.get(e.id))?.jobId).filter((x): x is string => !!x))]
    const ferdige = await ferdigeJobber(jobIder)

    for (const e of events) {
      const n = niva(e)
      const d = det.get(e.id)
      const tekst = d?.text_body || (e.draft_id ? manus.get(e.draft_id) : undefined) || null
      const kilde = ser(n, 'full') ? resultatKilde(e, d) : null
      ut.set(e.id, {
        insight: n,
        productName: e.product_id ? navn.get(e.product_id) ?? null : null,
        text: ser(n, 'script') ? tekst : null,
        textKind: ser(n, 'script') && tekst ? (d?.text_kind ?? 'spoken') : null,
        output: kilde ? { kind: kilde.kind, ready: kilde.jobId ? ferdige.has(kilde.jobId) : true } : null,
      })
    }
  } catch (err) {
    console.warn('[innsyn] hoppet over:', err)
  }
  return ut
}

/**
 * En fersk lenke til resultatet av én bruk — eller null. Kalleren har allerede
 * slått fast at brukeren eier tvillingen; nivået sjekkes her, på nytt.
 */
export async function resultatLenke(e: BrukRad, talentAgentId: string | null | undefined): Promise<string | null> {
  const [standard, nivaaer, det] = await Promise.all([
    byraaStandard(talentAgentId),
    lisensNivaaer(e.licence_id ? [e.licence_id] : []),
    detaljer([e.id]),
  ])
  const n = gjeldendeInnsyn({ harByraa: !!talentAgentId, lisens: e.licence_id ? nivaaer.get(e.licence_id) : null, byraaStandard: standard })
  if (!ser(n, 'full')) return null
  const kilde = resultatKilde(e, det.get(e.id))
  if (!kilde) return null

  let url = kilde.url
  if (kilde.jobId) {
    const ferdig = (await ferdigeJobber([kilde.jobId])).get(kilde.jobId)
    if (!ferdig) return null
    url = ferdig
  }
  if (kilde.store === 'training-sets') {
    const { data } = await db().storage.from('training-sets').createSignedUrl(url, 600)
    return data?.signedUrl ?? null
  }
  const { hentbarMediaUrl } = await import('@/lib/r2Presign')
  return hentbarMediaUrl(url)
}
