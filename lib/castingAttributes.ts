// Castingvokabularet (Lars 20.09.2026).
//
// 🔑 HVORFOR DETTE LIGGER I KODE OG IKKE I BASEN: et filter er verdiløst hvis
// «blond», «lys» og «lyshåret» er tre forskjellige verdier. Fritekst gir
// nettopp det. Her står ÉN kodeverdi per egenskap, og etiketten slås opp per
// språk (messages/*.json → `casting`). Basen lagrer bare kodene.
//
// Kodene er varige. Endrer du en kode, er det en migrasjon — ikke en
// oversettelse. Etiketter kan endres fritt.
//
// ⚠️ ETNISITET / SPILLEOMRÅDE er særlige kategorier (personvernforordningen
// art. 9). `appearance` er derfor rammet som «hvilke roller kan dette ansiktet
// plausibelt spille», er SELVERKLÆRT av rettighetshaveren, og krever eget
// samtykke (voice_actors.appearance_consent_at). Se `KREVER_SAMTYKKE` — både
// skjemaet og filter-API-et leser den lista, så porten ikke kan glemmes ett
// sted.

export type Fasett =
  | 'dialects' | 'languages' | 'hair' | 'eyes' | 'build' | 'appearance' | 'skills'

/** Fasetter som er art. 9-data og derfor krever uttrykkelig samtykke. */
export const KREVER_SAMTYKKE: readonly Fasett[] = ['appearance'] as const

export const KJOENN = ['kvinne', 'mann', 'annet'] as const
export type Kjoenn = (typeof KJOENN)[number]

/**
 * Verdiene per fasett. Rekkefølgen er visningsrekkefølgen i plukkeren —
 * de vanligste først, ikke alfabetisk, fordi en caster leter med øyet.
 */
export const VOKABULAR: Record<Fasett, readonly string[]> = {
  // Norske dialektregioner slik casting faktisk ber om dem. Bevisst grovt:
  // «østnorsk» dekker det en regissør spør etter; kommunenivå gjør det ikke.
  dialects: [
    'ostnorsk', 'bergensk', 'trondersk', 'nordnorsk', 'sorlandsk',
    'vestnorsk', 'stavangersk', 'innlandet', 'standard_ostnorsk', 'nynorsknaer',
  ],
  // Språk skuespilleren kan SPILLE PÅ, ikke språk de forstår.
  languages: [
    'norsk', 'engelsk', 'svensk', 'dansk', 'tysk', 'fransk', 'spansk',
    'polsk', 'arabisk', 'somali', 'urdu', 'russisk', 'ukrainsk', 'samisk',
  ],
  hair: ['blond', 'brunt', 'sort', 'rodt', 'gratt', 'hvitt', 'skallet', 'farget'],
  eyes: ['bla', 'gronne', 'brune', 'gra', 'hasselnott'],
  build: ['slank', 'atletisk', 'gjennomsnitt', 'kraftig', 'stor'],
  // Spilleområde — selverklært, art. 9. Se toppen av fila.
  appearance: [
    'nordisk', 'europeisk', 'soreuropeisk', 'ostasiatisk', 'sorasiatisk',
    'midtostlig', 'afrikansk', 'latinamerikansk', 'flerkulturell',
  ],
  skills: [
    'sang', 'dialektskifte', 'komikk', 'barnestemme', 'eldrestemme',
    'fortellerstemme', 'dubbing', 'lydbok', 'skrik_og_kamp', 'dyrelyder',
  ],
}

export const FASETTER = Object.keys(VOKABULAR) as Fasett[]

/**
 * Fasettene som vises på den ÅPNE katalogen (/stemmer).
 *
 * 🔑 ART. 9 HOLDES UTENFOR DEN ÅPNE SIDA. Samtykket vi faktisk har innhentet
 * gjelder casting — og et innlogget castingverktøy ER casting. En åpen
 * nettside er PUBLISERING, og det er en annen og større eksponering av
 * særlige kategorier. Skal spilleområde ut i det åpne galleriet, må
 * onboarding be om det uttrykkelig; den linja finnes ikke i dag.
 *
 * Endres dette, er det en samtykkebeslutning — ikke en UI-justering.
 */
export const OFFENTLIGE_FASETTER: readonly Fasett[] =
  FASETTER.filter((f) => !KREVER_SAMTYKKE.includes(f))

/** Attributtene slik de kan vises utenfor innlogging. */
export function offentligeAttributter(
  attr: Record<string, string[]> | null | undefined
): Record<string, string[]> {
  const ut: Record<string, string[]> = {}
  for (const f of OFFENTLIGE_FASETTER) {
    const v = attr?.[f]
    if (Array.isArray(v) && v.length) ut[f] = v
  }
  return ut
}

/** Én fasetts verdier, eller tom liste hvis fasetten ikke finnes. */
export function verdierFor(fasett: string): readonly string[] {
  return VOKABULAR[fasett as Fasett] ?? []
}

/** Er koden en gyldig verdi i denne fasetten? */
export function erGyldig(fasett: string, verdi: string): boolean {
  return verdierFor(fasett).includes(verdi)
}

/**
 * Renser et innsendt attributt-objekt mot vokabularet.
 *
 * Ukjente fasetter og ukjente verdier forsvinner — de ville gjort filteret
 * ubrukelig uten å feile synlig. Duplikater fjernes, og rekkefølgen settes
 * til vokabularets, så to like sett alltid ser like ut i basen.
 *
 * `harSamtykke` styrer art. 9-fasettene: uten samtykke skrives de ikke,
 * uansett hva klienten sendte.
 */
export function rensAttributter(
  raa: unknown,
  { harSamtykke = false }: { harSamtykke?: boolean } = {}
): Record<string, string[]> {
  if (!raa || typeof raa !== 'object' || Array.isArray(raa)) return {}
  const inn = raa as Record<string, unknown>
  const ut: Record<string, string[]> = {}
  for (const fasett of FASETTER) {
    if (KREVER_SAMTYKKE.includes(fasett) && !harSamtykke) continue
    const v = inn[fasett]
    if (!Array.isArray(v)) continue
    const valgte = new Set(v.filter((x): x is string => typeof x === 'string'))
    const rene = verdierFor(fasett).filter((k) => valgte.has(k))
    if (rene.length) ut[fasett] = [...rene]
  }
  return ut
}

/** Én kandidat slik plukkeren trenger den. Ingen personopplysninger utover
 *  det rettighetshaveren selv har lagt ut for å bli funnet. */
export interface Kandidat {
  id: string
  name: string
  photo: string | null
  isDemo: boolean
  gender: Kjoenn | null
  playingAgeFrom: number | null
  playingAgeTo: number | null
  heightCm: number | null
  attributes: Record<string, string[]>
  /** Aldersspenn fra ansiktsmodellene (082). Tomt når ingen er registrert. */
  modelAges: Array<{ from: number | null; to: number | null }>
}

export interface Filter {
  q?: string
  gender?: string[]
  ageFrom?: number | null
  ageTo?: number | null
  heightFrom?: number | null
  heightTo?: number | null
  /** Fasett → valgte koder. Innen én fasett: ELLER. Mellom fasetter: OG. */
  facets?: Partial<Record<Fasett, string[]>>
}

/** Overlapper to spenn? Åpne ender teller som uendelige. */
function spennOverlapper(
  aFra: number | null, aTil: number | null,
  bFra: number | null, bTil: number | null
): boolean {
  if (aFra != null && bTil != null && aFra > bTil) return false
  if (aTil != null && bFra != null && aTil < bFra) return false
  return true
}

/**
 * Filtrerer kandidater.
 *
 * 🔑 SPILLEALDER MATCHER OVERLAPP, IKKE INNESLUTNING. Ber en regissør om
 * 35–45, skal en som spiller 30–50 komme med — hen dekker jo hele spennet.
 * Innslutning ville skjult nettopp de mest anvendelige skuespillerne.
 *
 * Og den treffer ANSIKTSMODELLENE når de finnes (082): en veteran med
 * modeller på 30, 40 og 50 skal komme opp på 30 selv om hens eget spenn
 * starter på 55. Det er hele poenget med aldersmodellene.
 *
 * Et tomt filter slipper alle gjennom — ingen skjult forhåndsutvalg.
 */
export function filtrer(kandidater: Kandidat[], f: Filter): Kandidat[] {
  const q = f.q?.trim().toLowerCase() ?? ''
  const kjoenn = f.gender?.length ? new Set(f.gender) : null
  const fasetter = Object.entries(f.facets ?? {})
    .filter(([, v]) => Array.isArray(v) && v.length > 0) as Array<[string, string[]]>

  return kandidater.filter((k) => {
    if (q && !k.name.toLowerCase().includes(q)) return false
    if (kjoenn && !(k.gender && kjoenn.has(k.gender))) return false

    if (f.ageFrom != null || f.ageTo != null) {
      const spenn = [
        { from: k.playingAgeFrom, to: k.playingAgeTo },
        ...k.modelAges,
      ]
      // Har hen verken eget spenn eller modellspenn, er alderen ukjent — og
      // ukjent skal falle ut av et aldersfilter, ikke snike seg gjennom.
      const kjente = spenn.filter((s) => s.from != null || s.to != null)
      if (kjente.length === 0) return false
      if (!kjente.some((s) => spennOverlapper(s.from, s.to, f.ageFrom ?? null, f.ageTo ?? null))) return false
    }

    if (f.heightFrom != null || f.heightTo != null) {
      if (k.heightCm == null) return false
      if (f.heightFrom != null && k.heightCm < f.heightFrom) return false
      if (f.heightTo != null && k.heightCm > f.heightTo) return false
    }

    for (const [fasett, valgte] of fasetter) {
      const har = k.attributes?.[fasett]
      if (!Array.isArray(har) || !valgte.some((v) => har.includes(v))) return false
    }
    return true
  })
}

/** Teller hvor mange av kandidatene som har hver verdi — så en chip som ikke
 *  ville gitt treff kan vises som tom i stedet for å lure noen. */
export function tellFasett(kandidater: Kandidat[], fasett: Fasett): Record<string, number> {
  const ut: Record<string, number> = {}
  for (const v of verdierFor(fasett)) ut[v] = 0
  for (const k of kandidater) {
    for (const v of k.attributes?.[fasett] ?? []) {
      if (v in ut) ut[v] += 1
    }
  }
  return ut
}
