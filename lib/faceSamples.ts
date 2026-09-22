import { createClient } from '@supabase/supabase-js'
import { submitFaceImageJob, hentFaceImageResultat, type FaceImageJob } from '@/lib/gateway'
import { hentAnsikter, embedKonfigurert } from '@/lib/embedClient'
import { cosinus, fraVektorTekst, PROEVE_LIKHET_MIN } from '@/lib/identity'

// Proevebildene til godkjenningen (091) — og kvalitetsporten foran dem (105).
//
// 🔑 MAN KAN IKKE VISE NOEN EN LoRA-FIL, bare hva den lager. Derfor lages tre
// bilder i tre ulike scener, og hun svarer paa dem. Foer 22.09 ble bildene
// laget foerst naar hun aapnet sida; naa lages de av cron-jobben straks
// treningen er ferdig, og SKAARES mot sentroiden av hennes egne leverte
// bilder (102) foer e-posten gaar. Lars sa nei til tre Flux 2-bilder som
// maalt laa paa 0,36 — de burde aldri ha naadd ham. Modellen som ikke likner
// er en feilet trening, ikke et spoersmaal til henne.
//
// Delt mellom cron-jobben (lib/faceTraining) og godkjenningsruta, som
// fortsatt kan lage bildene selv om porten ikke kunne kjoere (ingen
// sentroide — modellen kom fra en zip uten levering).
//
// 🔑 KALIBRERINGEN (22.09, Lars' 15 leverte bilder, de tre scenene under):
//   Flux 1 portrett, godkjent av ham:        0,83 · 0,84 · 0,83  snitt 0,83
//   Flux 2 x1,5, «ikke bra nok» ifoelge ham:  0,72 · 0,70 · 0,71  snitt 0,71
//   (Flux 2 x1,0, de bildene han sa nei til: ~0,36 i portrett)
// Terskelen 0,75 (PROEVE_LIKHET_MIN) ligger mellom de to klassene. Ett
// menneske — skaarene lagres paa raden saa den kan flyttes med flere.

/** Scenene proevebildene lages i. Ulike med vilje — én heldig vinkel beviser ingenting. */
export const SCENER = [
  'standing in a bright modern office, looking at the camera, neutral expression',
  'outdoors on a city street in daylight, three-quarter view, slight smile',
  'seated indoors with soft window light, close portrait, calm expression',
]

export const PROEVE_BOETTE = 'training-sets'

/** En jobb hos fal, med scenen den hoerer til. Ligger paa raden i sample_pending.batch. */
export interface ProeveJobb extends FaceImageJob { scene: number }
export interface ProeveBatch { batch: ProeveJobb[]; submitted_at: string }

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
  )
}

/** Signerte lenker (10 min) til stiene paa raden. Eldre http-adresser slippes gjennom som de er. */
export async function signerProever(stier: unknown): Promise<string[]> {
  const liste = (Array.isArray(stier) ? stier : []).map(String)
  const ut: string[] = []
  for (const p of liste) {
    if (/^https?:\/\//.test(p)) { ut.push(p); continue }
    const { data } = await admin().storage.from(PROEVE_BOETTE).createSignedUrl(p, 600)
    if (data?.signedUrl) ut.push(data.signedUrl)
  }
  return ut
}

export function lesBatch(sample_pending: unknown): ProeveBatch | null {
  const p = sample_pending as ProeveBatch | null
  if (!p || typeof p !== 'object' || !Array.isArray(p.batch)) return null
  return p
}

/**
 * Send inn jobbene for scenene som mangler, alle paa én gang. fal tar dem
 * parallelt; tre etter hverandre var bare tregere for henne.
 * Returnerer batchen som ble lagt paa raden.
 */
export async function startProever(ch: { triggerWord: string; loraUrl: string; trainer?: string | null }, characterId: string, harAlt: number): Promise<ProeveBatch> {
  const batch: ProeveJobb[] = []
  for (let scene = harAlt; scene < SCENER.length; scene++) {
    const job = await submitFaceImageJob(ch, SCENER[scene], '1024x1024')
    batch.push({ ...job, scene })
  }
  const p: ProeveBatch = { batch, submitted_at: new Date().toISOString() }
  await admin().from('user_characters').update({ sample_pending: p }).eq('id', characterId)
  return p
}

/**
 * Hent det som er ferdig hos fal, lagre privat, og skriv stiene paa raden.
 * Idempotent: kall den saa ofte du vil. Feilede jobber droppes fra batchen —
 * neste startProever sender scenen paa nytt.
 */
export async function hentFerdigeProever(characterId: string, sample_urls: unknown, sample_pending: unknown): Promise<{ stier: string[]; pending: boolean; batch: ProeveBatch | null }> {
  const stier = (Array.isArray(sample_urls) ? sample_urls : []).map(String)
  const p = lesBatch(sample_pending)
  if (!p) return { stier, pending: false, batch: null }
  const igjen: ProeveJobb[] = []
  const nye = [...stier]
  for (const job of p.batch) {
    try {
      const res = await hentFaceImageResultat(job)
      if (res.status === 'COMPLETED') {
        const sti = `approval/${characterId}/${Date.now()}-${job.scene}.png`
        const { error } = await admin().storage.from(PROEVE_BOETTE).upload(sti, res.png, { contentType: 'image/png', upsert: false })
        if (error) { igjen.push(job); continue } // bildet finnes hos fal; proev lagring igjen neste gang
        nye.push(sti)
      } else if (res.status === 'FAILED') {
        // droppes — scenen sendes paa nytt av neste startProever
      } else {
        igjen.push(job)
      }
    } catch { igjen.push(job) }
  }
  const nyBatch: ProeveBatch | null = igjen.length ? { ...p, batch: igjen } : null
  await admin().from('user_characters').update({ sample_urls: nye, sample_pending: nyBatch }).eq('id', characterId)
  return { stier: nye, pending: !!nyBatch, batch: nyBatch }
}

/** Sentroiden av hennes leverte bilder (102), om hun har levert. Matcher paa e-post innen tenanten. */
export async function hentSentroide(subjectEmail: string | null, tenantId: string | null): Promise<number[] | null> {
  if (!subjectEmail) return null
  let q = admin().from('voice_actors').select('face_embedding').ilike('actor_email', subjectEmail).not('face_embedding', 'is', null)
  if (tenantId) q = q.eq('owner_tenant_id', tenantId)
  const { data } = await q.limit(1).maybeSingle()
  return data ? fraVektorTekst((data as { face_embedding: unknown }).face_embedding) : null
}

export interface ProeveVurdering { scores: (number | null)[]; mean: number | null; threshold: number; passed: boolean; decided_at: string }

/**
 * Skaar hvert proevebilde mot sentroiden: stoerste ansikt i bildet, cosinus.
 * `null` for et bilde uten ansikt. Snittet av de som har ansikt avgjoer.
 * Feiler aapent: kan ikke dropleten svare, er vurderingen null, ikke «nei».
 */
export async function vurderProever(stier: string[], sentroide: number[]): Promise<ProeveVurdering | null> {
  if (!embedKonfigurert()) return null
  const scores: (number | null)[] = []
  for (const sti of stier) {
    try {
      const { data } = await admin().storage.from(PROEVE_BOETTE).createSignedUrl(sti, 600)
      if (!data?.signedUrl) { scores.push(null); continue }
      const svar = await hentAnsikter(data.signedUrl)
      const ansikter = (svar.faces || []).slice().sort((a, b) => flate(b.bbox) - flate(a.bbox))
      scores.push(ansikter.length ? Math.round(cosinus(ansikter[0].embedding, sentroide) * 1000) / 1000 : null)
    } catch { return null }
  }
  const med = scores.filter((s): s is number => s != null)
  const mean = med.length ? Math.round((med.reduce((a, b) => a + b, 0) / med.length) * 1000) / 1000 : null
  return { scores, mean, threshold: PROEVE_LIKHET_MIN, passed: mean != null && mean >= PROEVE_LIKHET_MIN, decided_at: new Date().toISOString() }
}

function flate(b: number[]): number { return Math.max(0, (b[2] - b[0])) * Math.max(0, (b[3] - b[1])) }

/** Tekst til raden naar porten sier nei: «0,36 · 0,41 · 0,33 — snitt 0,37, krav 0,60». */
export function likhetTekst(v: ProeveVurdering): string {
  const f = (n: number | null) => n == null ? '–' : n.toFixed(2).replace('.', ',')
  return `${v.scores.map(f).join(' · ')} — snitt ${f(v.mean)}, krav ${f(v.threshold)}`
}
