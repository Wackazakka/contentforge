import { createClient } from '@supabase/supabase-js'
import { submitFaceImageJob, hentFaceImageResultat, type FaceImageJob } from '@/lib/gateway'
import { hentAnsikter, embedKonfigurert } from '@/lib/embedClient'
import { cosinus, fraVektorTekst, PROEVE_LIKHET_MIN, PROEVE_BILDE_MIN, avgjoerProever, type ProeveGrunn } from '@/lib/identity'

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
// 25.10, de samme modellene lastet opp som «egen modell» (nye bilder):
//   Flux 1, godkjent:                          0,85 · 0,87 · 0,84  snitt 0,85
//   Flux 2 x1,5, avvist av ham:                0,72 · 0,77 · 0,77  snitt 0,75
// Den siste slapp gjennom «snitt ≥ 0,75» med 0,753. Kravet er derfor hevet:
// snitt ≥ 0,80 OG hvert bilde ≥ 0,75 OG ansikt i hvert bilde (lib/identity,
// avgjoerProever). Ett menneske — skaarene lagres paa raden saa det kan
// flyttes med flere.

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

/** `floor`/`grunn` finnes fra 25.10; eldre rader har bare snitt-kravet. */
export interface ProeveVurdering {
  scores: (number | null)[]; mean: number | null; threshold: number; floor?: number
  passed: boolean; grunn?: ProeveGrunn; decided_at: string
}

/**
 * Skaar hvert proevebilde mot sentroiden: stoerste ansikt i bildet, cosinus.
 * `null` for et bilde uten ansikt. Regelen bor i lib/identity (avgjoerProever).
 * Feiler aapent: kan ikke lagringen eller dropleten svare, er vurderingen
 * null, ikke «nei» — og da proever cron-jobben igjen (se fullfoerProever).
 */
export async function vurderProever(stier: string[], sentroide: number[]): Promise<ProeveVurdering | null> {
  if (!embedKonfigurert()) return null
  const scores: (number | null)[] = []
  for (const sti of stier) {
    try {
      // En lagringshikke er ikke «bildet har ikke noe ansikt» — det ville
      // stoppet en god modell. Vent heller til neste tikk.
      const { data } = await admin().storage.from(PROEVE_BOETTE).createSignedUrl(sti, 600)
      if (!data?.signedUrl) return null
      const svar = await hentAnsikter(data.signedUrl)
      const ansikter = (svar.faces || []).slice().sort((a, b) => flate(b.bbox) - flate(a.bbox))
      scores.push(ansikter.length ? Math.round(cosinus(ansikter[0].embedding, sentroide) * 1000) / 1000 : null)
    } catch { return null }
  }
  const dom = avgjoerProever(scores)
  return {
    scores, mean: dom.mean, threshold: PROEVE_LIKHET_MIN, floor: PROEVE_BILDE_MIN,
    passed: dom.passed, grunn: dom.grunn, decided_at: new Date().toISOString(),
  }
}

function flate(b: number[]): number { return Math.max(0, (b[2] - b[0])) * Math.max(0, (b[3] - b[1])) }

/** Tekst til raden naar porten sier nei: «0,72 · 0,77 · 0,77 — snitt 0,75, krav 0,80 (hvert bilde minst 0,75)». */
export function likhetTekst(v: ProeveVurdering): string {
  const f = (n: number | null) => n == null ? '–' : n.toFixed(2).replace('.', ',')
  const gulv = v.floor != null ? ` (hvert bilde minst ${f(v.floor)})` : ''
  const uten = v.scores.some((s) => s == null) ? '; – = ingen ansikt i bildet' : ''
  return `${v.scores.map(f).join(' · ')} — snitt ${f(v.mean)}, krav ${f(v.threshold)}${gulv}${uten}`
}
