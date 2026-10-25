// Identitetssjekk ved levering — den rene matematikken, uten database.
//
// Samme grunn som licenceMath: dette er stedet der en feil enten slipper
// gjennom et sett med to mennesker i, eller stempler en ekte skuespiller som
// «ikke samme person». Begge koster tillit. Da skal det kunne kjoeres og
// etterproeves uten aa roere prod. Testet i scripts/test-identity.mjs.
//
// Vektorene kommer fra ArcFace (buffalo_l, 512 tall, L2-normalisert) via
// dropletens /face. To vektorer av samme person ligger naer hverandre i
// cosinus; av ulike personer langt fra.
//
// 🔑 TERSKLENE ER STARTVERDIER, IKKE SANNHETER. ArcFace verifiserer typisk
// «samme person» rundt 0,3–0,45 cosinus mot ett annet bilde. Mot en
// SENTROIDE (gjennomsnittet av mange) ligger ekte bilder hoeyere, saa 0,35 er
// romslig. Dublett-terskelen er strengere: et falskt «dette er samme person
// som X» er verre enn et tapt treff, for det er en anklage. Begge boer
// kalibreres paa de foerste ekte settene, og staar derfor her, eksportert,
// ikke spredd i rutene.

export const SAMME_PERSON_TERSKEL = 0.35
export const DUBLETT_TERSKEL = 0.55
/**
 * Kvalitetsport for proevebilder (105): de tre proevebildenes likhet med
 * sentroiden av hennes egne leverte bilder avgjoer om hun blir spurt «er dette
 * deg?». Tallene bak står i lib/faceSamples.ts. Ett menneske, saa dette er
 * startverdier: skaarene lagres paa raden (sample_scores) for aa justere.
 *
 * 🔑 HEVET 25.10 fra «snitt ≥ 0,75» til tre krav, alle maa holde:
 *   - snittet ≥ 0,80 (PROEVE_LIKHET_MIN)
 *   - hvert bilde ≥ 0,75 (PROEVE_BILDE_MIN) — ett bommet bilde stopper
 *   - hvert bilde har et ansikt — foer ble et bilde uten ansikt hoppet
 *     over, og to heldige bilder kunne baere modellen alene
 * Grunnen: Flux 2-modellen Lars avviste fikk 0,72 · 0,77 · 0,77 = snitt
 * 0,753 og slapp gjennom «snitt ≥ 0,75». Modellene han godkjente ligger paa
 * 0,83–0,87 per bilde; de han avviste paa 0,70–0,77. 0,80 ligger midt i gapet.
 */
export const PROEVE_LIKHET_MIN = 0.8
export const PROEVE_BILDE_MIN = 0.75
export const MODELL = 'buffalo_l'

export type ProeveGrunn = 'ok' | 'ingen_bilder' | 'mangler_ansikt' | 'svakt_bilde' | 'lavt_snitt'
export interface ProeveDom { mean: number | null; passed: boolean; grunn: ProeveGrunn }

/** Ren regel for kvalitetsporten. `null` i lista = bildet hadde ikke noe ansikt. */
export function avgjoerProever(scores: (number | null)[]): ProeveDom {
  if (scores.length === 0) return { mean: null, passed: false, grunn: 'ingen_bilder' }
  const tall = scores.filter((s): s is number => s != null)
  const mean = tall.length ? Math.round((tall.reduce((a, b) => a + b, 0) / tall.length) * 1000) / 1000 : null
  if (tall.length < scores.length) return { mean, passed: false, grunn: 'mangler_ansikt' }
  if (tall.some((s) => s < PROEVE_BILDE_MIN)) return { mean, passed: false, grunn: 'svakt_bilde' }
  if (mean == null || mean < PROEVE_LIKHET_MIN) return { mean, passed: false, grunn: 'lavt_snitt' }
  return { mean, passed: true, grunn: 'ok' }
}

export interface BildeVektor {
  path: string
  /** null = ingen ansikt funnet, eller feil ved utregning. */
  embedding: number[] | null
  faces: number
}

export interface Dublett { actorId: string; name?: string; similarity: number }

export interface IdentitetsVurdering {
  photos: number
  withFace: number
  sameCount: number
  outliers: string[]
  noFace: string[]
  multiFace: string[]
  meanSim: number | null
  minSim: number | null
  centroid: number[] | null
  /** Ingen avvik, ingen bilder uten ansikt. Antall er leveringens sak, ikke denne. */
  ok: boolean
  reason: string | null
  model: string
  computedAt: string
}

export function cosinus(a: number[], b: number[]): number {
  let s = 0
  for (let i = 0; i < a.length; i++) s += a[i] * b[i]
  return s
}

export function normaliser(v: number[]): number[] {
  let n = 0
  for (const x of v) n += x * x
  n = Math.sqrt(n) || 1
  return v.map((x) => x / n)
}

export function sentroide(vs: number[][]): number[] | null {
  if (vs.length === 0) return null
  const d = vs[0].length
  const m = new Array<number>(d).fill(0)
  for (const v of vs) for (let i = 0; i < d; i++) m[i] += v[i]
  return normaliser(m.map((x) => x / vs.length))
}

/**
 * Vurderer om alle bildene viser samme person.
 *
 * 🔑 TO RUNDER, IKKE EN. Sentroiden regnes foerst av alle; det bildet som ligger
 * lengst unna droppes hvis det er under terskelen; saa regnes sentroiden om av
 * resten. Uten det drar ett bilde av en annen person sentroiden mot seg selv
 * og gjoer avviket mindre synlig — og med to slike bilder kan de ekte
 * havne under terskelen i stedet.
 */
export function vurderIdentitet(bilder: BildeVektor[], terskel = SAMME_PERSON_TERSKEL): IdentitetsVurdering {
  const naa = new Date().toISOString()
  const noFace = bilder.filter((b) => !b.embedding || b.faces === 0).map((b) => b.path)
  const multiFace = bilder.filter((b) => b.embedding && b.faces > 1).map((b) => b.path)
  const brukbare = bilder.filter((b) => b.embedding && b.faces > 0) as Array<BildeVektor & { embedding: number[] }>
  const basis = {
    photos: bilder.length, withFace: brukbare.length, noFace, multiFace, model: MODELL, computedAt: naa,
  }
  if (brukbare.length === 0) {
    return { ...basis, sameCount: 0, outliers: [], meanSim: null, minSim: null, centroid: null, ok: false, reason: 'Ingen ansikter funnet' }
  }
  if (brukbare.length === 1) {
    // Ingenting aa sammenlikne med. Ikke «ok» — vi vet ikke — men heller ikke avvik.
    return { ...basis, sameCount: 1, outliers: [], meanSim: null, minSim: null, centroid: normaliser(brukbare[0].embedding), ok: noFace.length === 0, reason: noFace.length ? 'Bilder uten ansikt' : 'Bare ett ansikt aa gaa etter' }
  }

  const vs = brukbare.map((b) => normaliser(b.embedding))
  let c = sentroide(vs)!
  let sims = vs.map((v) => cosinus(v, c))

  // Runde 2: dropp den svakeste hvis den er under terskelen, regn om.
  if (brukbare.length >= 3) {
    const lavest = sims.indexOf(Math.min(...sims))
    if (sims[lavest] < terskel) {
      c = sentroide(vs.filter((_, i) => i !== lavest))!
      sims = vs.map((v) => cosinus(v, c))
    }
  }

  const outliers = brukbare.filter((_, i) => sims[i] < terskel).map((b) => b.path)
  const inne = sims.filter((s) => s >= terskel)
  const meanSim = inne.length ? inne.reduce((a, b) => a + b, 0) / inne.length : null
  const minSim = Math.min(...sims)
  const ok = outliers.length === 0 && noFace.length === 0
  const reason = outliers.length
    ? `${outliers.length} bilde${outliers.length === 1 ? '' : 'r'} skiller seg ut`
    : noFace.length ? 'Bilder uten ansikt' : null
  return {
    ...basis,
    sameCount: brukbare.length - outliers.length,
    outliers, meanSim: meanSim == null ? null : rund(meanSim), minSim: rund(minSim),
    centroid: c, ok, reason,
  }
}

const rund = (x: number) => Math.round(x * 1000) / 1000

/** pgvector vil ha «[0.1,0.2,...]» som tekst via PostgREST. */
export function tilVektorTekst(v: number[]): string {
  return '[' + v.map((x) => (Number.isFinite(x) ? x : 0)).join(',') + ']'
}

export function fraVektorTekst(s: unknown): number[] | null {
  if (Array.isArray(s)) return s.map(Number)
  if (typeof s !== 'string') return null
  try { const a = JSON.parse(s); return Array.isArray(a) ? a.map(Number) : null } catch { return null }
}
