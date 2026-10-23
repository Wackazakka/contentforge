import { createClient } from '@supabase/supabase-js'
import { dekkerPerioden } from '@/lib/licenceMath'
import { skillPaaVersjon, versjonForModell, modellForLisens, type Komponent, type TvillingVersjon } from '@/lib/twinVersions'

// Hvilken lisens hjemler denne genereringen?
//
// Dette er leddet som gjør hovedboken til et KLARERINGSREGISTER i stedet for
// en forbruksmåler: hvert genererte aktivum peker på avtalen som ga lov, og
// «var dette autorisert?» blir et oppslag i stedet for en gjetning.
//
// 🔑 Konservativ med vilje. Er det tvil om hvilken lisens som gjelder, lenkes
// ingen. En rad uten hjemmel er et ærlig hull man kan lete opp; en rad med
// FEIL hjemmel er en påstand om at noe var klarert da det ikke var det — og
// det er den ene feilen et proveniensprodukt ikke har råd til.
//
// Egen modul, uten import fra lib/voiceBank: voiceBank kaller hit, og
// lib/licences kaller voiceBank. Uten skillet blir det en importsirkel.

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
  )
}

/**
 * Hvorfor raden fikk (eller ikke fikk) en hjemmel. Lagres i meta, så hullene kan revideres.
 * `version_mismatch` (112): det finnes en lisens som ellers ville gjeldt, men
 * den er festet til en annen versjon av modellen enn den som ble brukt.
 */
export type LisensTreff = 'explicit' | 'inferred' | 'none' | 'ambiguous' | 'no_customer' | 'version_mismatch'

const komponent = (assetType?: string | null): Komponent => (assetType === 'face' ? 'face' : 'voice')

/** Versjonshistorikken for en eller flere tvillinger (112). Tom ved feil — da dekker ingen lisens en kjent modell. */
export async function hentVersjoner(actorIds: string[]): Promise<TvillingVersjon[]> {
  if (actorIds.length === 0) return []
  const { data } = await admin().from('twin_versions')
    .select('actor_id, version, face_character_id, elevenlabs_voice_id, change, created_at')
    .in('actor_id', actorIds).order('version')
  return (data || []) as TvillingVersjon[]
}

/**
 * Hvem eide denne modellen — også etter at den er byttet ut? Produksjoner som
 * ble satt opp før et modellbytte, bruker fortsatt den gamle modellen. Før 112
 * ble den bruken ikke ført i det hele tatt: oppslaget så bare på gjeldende
 * modell, fant ingen, og returnerte stille. Nå finnes den i historikken.
 */
export async function skuespillereForModell(assetType: string, modell: string): Promise<string[]> {
  const kol = komponent(assetType) === 'face' ? 'face_character_id' : 'elevenlabs_voice_id'
  const { data } = await admin().from('twin_versions').select('actor_id').eq(kol, modell)
  return [...new Set(((data || []) as Array<{ actor_id: string }>).map((r) => r.actor_id))]
}

/** Versjonsnummeret en bruk med `modell` hører til (nyeste med den modellen). */
export async function versjonForBruk(actorId: string, assetType: string, modell: string | null | undefined): Promise<number | null> {
  if (!modell) return null
  try { return versjonForModell(await hentVersjoner([actorId]), komponent(assetType), modell) } catch { return null }
}

/**
 * Hvilken modell skal kunden generere med (gatewayen)? Har kunden én entydig,
 * gyldig lisens på denne tvillingen for komponenten, er svaret modellen den
 * lisensen er festet til — produksjonen får det den klarerte. Ellers den
 * gjeldende. Feiler mot den gjeldende: oppslaget skal aldri stoppe en
 * generering, og hovedboken avgjør uansett hjemmelen etterpå.
 */
export async function modellForKunde(e: {
  actorId: string; organizationId?: string | null; assetType: string; gjeldende: string | null; at?: Date
}): Promise<{ modell: string | null; versjon: number | null; festet: boolean }> {
  try {
    const type = komponent(e.assetType)
    const versjoner = await hentVersjoner([e.actorId])
    if (!e.organizationId) return modellForLisens(versjoner, null, type, e.gjeldende)
    const dag = (e.at ?? new Date()).toISOString().slice(0, 10)
    const { data } = await admin().from('licences')
      .select('id, term_start, term_end, twin_version')
      .eq('actor_id', e.actorId).eq('organization_id', e.organizationId).eq('status', 'active')
      .in('asset_type', type === 'face' ? ['face', 'both'] : ['voice', 'both'])
    const gyldige = ((data || []) as LisensRad[]).filter((l) => dekkerPerioden(l.term_start, l.term_end, dag))
    return modellForLisens(versjoner, gyldige.length === 1 ? gyldige[0].twin_version : null, type, e.gjeldende)
  } catch {
    return { modell: e.gjeldende, versjon: null, festet: false }
  }
}

export interface LisensKobling {
  licenceId: string | null
  match: LisensTreff
}

/**
 * Finn hjemmelen for én generering.
 *
 * 1. Et eksplisitt valg vinner alltid — men valideres mot skuespilleren, så
 *    en klient ikke kan feste bruk til en fremmed avtale.
 * 2. Uten kunde kan bruken ikke tilskrives noen avtale.
 * 3. Ellers: aktive lisenser på denne skuespilleren, for denne kunden, som
 *    dekker aktivumet og gjelder i dag. Nøyaktig én → lenk. Flere → la være.
 */
export async function finnLisensFor(e: {
  actorId: string
  organizationId?: string | null
  /** 'voice' | 'face' — 'both'-lisenser dekker begge. */
  assetType?: string | null
  licenceId?: string | null
  /**
   * Modellen som faktisk ble brukt (ansiktsmodell-id eller stemme-id). Med
   * den dekker en lisens bare bruk av versjonen den er festet til (112).
   * Uten den gjelder regelen som før versjonene — alle kallsteder skal sende den.
   */
  modell?: string | null
  at?: Date
}): Promise<LisensKobling> {
  try {
    const supabase = admin()
    const type = komponent(e.assetType)
    const versjoner = e.modell ? await hentVersjoner([e.actorId]) : []

    if (e.licenceId) {
      const { data } = await supabase
        .from('licences').select('id, actor_id, status, twin_version')
        .eq('id', e.licenceId).maybeSingle()
      const ok = data && data.actor_id === e.actorId && data.status === 'active'
      if (!ok) return { licenceId: null, match: 'none' }
      // Et eksplisitt valg kan heller ikke feste bruk av en annen versjon.
      const { dekket } = skillPaaVersjon([data as { twin_version?: number | null }], versjoner, type, e.modell)
      return dekket.length ? { licenceId: e.licenceId, match: 'explicit' } : { licenceId: null, match: 'version_mismatch' }
    }

    if (!e.organizationId) return { licenceId: null, match: 'no_customer' }

    const dag = (e.at ?? new Date()).toISOString().slice(0, 10)
    const dekker = type === 'face' ? ['face', 'both'] : ['voice', 'both']

    const { data } = await supabase
      .from('licences')
      .select('id, term_start, term_end, twin_version')
      .eq('actor_id', e.actorId)
      .eq('organization_id', e.organizationId)
      .eq('status', 'active')
      .in('asset_type', dekker)

    return velgHjemmel((data || []) as LisensRad[], dag, e.modell ? { versjoner, type, modell: e.modell } : undefined)
  } catch {
    // Hjemmelsoppslaget skal ALDRI stoppe en logging. En rad uten hjemmel er
    // langt bedre enn ingen rad — da forsvinner både royaltyen og sporet.
    return { licenceId: null, match: 'none' }
  }
}

export interface LisensRad { id: string; actor_id?: string; term_start: string | null; term_end: string | null; twin_version?: number | null }

/** Versjonskonteksten for én dom (112): historikken og modellen bruken gjelder. */
export interface VersjonsKontekst { versjoner: TvillingVersjon[]; type: Komponent; modell: string }

/**
 * Dommen over ÉN skuespillers lisensrader. Eneste sted regelen står.
 *
 * ⚠️ DELT MED `lisensStatusFor` MED VILJE. Produksjonsflaten spør på forhånd
 * «har jeg hjemmel?», og `finnLisensFor` svarer på det samme i det bruken
 * logges. Drifter de to fra hverandre, viser skjermen «Lisens på plass» mens
 * hovedboken skriver et hull — og da lyver produktet om nøyaktig det ene det
 * selger. Derfor én funksjon, ikke to like.
 */
function velgHjemmel(rader: LisensRad[], dag: string, versjon?: VersjonsKontekst): LisensKobling {
  // Perioden filtreres i koden, ikke i spørringen: null betyr «ingen grense»
  // i begge ender, og det uttrykkes tungt i PostgREST.
  const iPerioden = rader.filter((l) => dekkerPerioden(l.term_start, l.term_end, dag))
  // 🔑 VERSJONEN (112) ETTER PERIODEN. En lisens som gjelder i dag, men er
  // festet til en annen modell, er ikke «ingen lisens» — den er en lisens på
  // noe annet. Det skillet er hele grunnen til at kunden skal få vite det.
  const gyldige = versjon ? skillPaaVersjon(iPerioden, versjon.versjoner, versjon.type, versjon.modell).dekket : iPerioden
  if (gyldige.length === 1) return { licenceId: gyldige[0].id, match: 'inferred' }
  if (gyldige.length > 1) return { licenceId: null, match: 'ambiguous' }
  if (iPerioden.length > 0) return { licenceId: null, match: 'version_mismatch' }
  return { licenceId: null, match: 'none' }
}

/**
 * Sorter lisensradene tilbake på skuespillerne de gjelder, og døm hver for seg.
 *
 * Skilt ut og eksportert fordi det er her en feil ville vært stillest: bommer
 * grupperingen, står «Lisens på plass» på feil navn, og skjermen sier ja på
 * vegne av en avtale som gjelder en annen. Rene inndata, ingen nettverk.
 */
export function fordelPaaSkuespillere(
  rader: LisensRad[], actorIds: string[], dag: string,
  /** Per skuespiller: versjonskonteksten (gjeldende modell + historikk). Uten den: regelen før 112. */
  versjonFor?: (actorId: string) => VersjonsKontekst | undefined,
): Record<string, LisensKobling> {
  const perSkuespiller = new Map<string, LisensRad[]>()
  for (const rad of rader) {
    const id = rad.actor_id
    if (!id) continue
    perSkuespiller.set(id, [...(perSkuespiller.get(id) || []), rad])
  }
  return Object.fromEntries(
    actorIds.map((id) => [id, velgHjemmel(perSkuespiller.get(id) || [], dag, versjonFor?.(id))])
  )
}

/**
 * Samme spørsmål som `finnLisensFor`, men for en hel stemmebank i ett oppslag.
 *
 * Brukes av produksjonsflatene, som skal vise hjemmelen FØR noe produseres.
 * Én spørring for hele banken: et oppslag per skuespiller i en liste er både
 * tregt og lett å glemme å avbryte når lista vokser.
 *
 * Skuespillere uten treff kommer med som `none` — en tom plass i kartet ville
 * ikke skilles fra «ikke spurt», og det er forskjellen mellom «ingen lisens»
 * og «vet ikke».
 */
export async function lisensStatusFor(e: {
  actorIds: string[]
  organizationId?: string | null
  assetType?: string | null
  at?: Date
}): Promise<Record<string, LisensKobling>> {
  const tomt = (grunn: LisensTreff): Record<string, LisensKobling> =>
    Object.fromEntries(e.actorIds.map((id) => [id, { licenceId: null, match: grunn }]))

  if (e.actorIds.length === 0) return {}
  if (!e.organizationId) return tomt('no_customer')

  try {
    const dag = (e.at ?? new Date()).toISOString().slice(0, 10)
    const dekker = e.assetType === 'face' ? ['face', 'both'] : ['voice', 'both']

    const { data } = await admin()
      .from('licences')
      .select('id, actor_id, term_start, term_end, twin_version')
      .in('actor_id', e.actorIds)
      .eq('organization_id', e.organizationId)
      .eq('status', 'active')
      .in('asset_type', dekker)

    // 🔑 SAMME VERSJONSREGEL SOM VED LOGGING (112). Flaten spør om den
    // GJELDENDE modellen — det er den produksjonen ville brukt. Uten dette
    // ville skjermen sagt «Lisens på plass» for en lisens festet til en
    // modell som er byttet ut, mens hovedboken skrev et hull.
    const type = komponent(e.assetType)
    const kol = type === 'face' ? 'face_character_id' : 'elevenlabs_voice_id'
    const [{ data: aktoerer }, versjoner] = await Promise.all([
      admin().from('voice_actors').select(`id, ${kol}`).in('id', e.actorIds),
      hentVersjoner(e.actorIds),
    ])
    const gjeldende = new Map(((aktoerer || []) as unknown as Array<Record<string, string | null>>).map((a) => [String(a.id), a[kol] ? String(a[kol]) : null]))
    const versjonFor = (id: string): VersjonsKontekst | undefined => {
      const modell = gjeldende.get(id)
      return modell ? { versjoner: versjoner.filter((v) => v.actor_id === id), type, modell } : undefined
    }

    return fordelPaaSkuespillere((data || []) as LisensRad[], e.actorIds, dag, versjonFor)
  } catch {
    // Feiler oppslaget, er svaret «vet ikke» — og da skal ingen flate påstå at
    // hjemmelen mangler. `ambiguous` er det ærlige svaret: noe står uavklart.
    return tomt('ambiguous')
  }
}
