// Tvillingversjoner (migrasjon 112) — regelen for når en lisens dekker en bruk.
//
// Ren modul uten database og uten importer, så regelen kan prøves for hånd
// (scripts/test-versjoner.mjs) — samme grunn som licenceMath og identity.
//
// 🔑 EN LISENS DEKKER KOMPONENTEN DEN BLE FESTET TIL, IKKE NUMMERET. En
// versjon er et øyeblikksbilde av ansiktsmodell + stemme. Byttes bare
// stemmen (v1 → v2), er ansiktet i v2 det samme som i v1 — og en ansiktslisens
// festet til v1 dekker det fortsatt. Byttes ansiktet, gjør den det ikke:
// «en ny versjon utvider ikke stilltiende gammel tillatelse».
//
// 🔑 KONSERVATIV. Kan det ikke fastslås at lisensens versjon hadde akkurat
// den modellen som ble brukt, dekker den ikke. En rad uten hjemmel er et
// ærlig hull; en rad med feil hjemmel er en påstand om klarering som ikke
// fantes (samme prinsipp som licenceMatch).

export type Komponent = 'voice' | 'face'

export interface TvillingVersjon {
  actor_id: string
  version: number
  face_character_id: string | null
  elevenlabs_voice_id: string | null
  change?: string
  created_at?: string
}

/** Modellen versjonen har for komponenten. 'both'-lisenser spør per komponent som ble brukt. */
export function komponentAv(v: TvillingVersjon, type: Komponent): string | null {
  const m = type === 'face' ? v.face_character_id : v.elevenlabs_voice_id
  return m && String(m).trim() ? String(m) : null
}

/**
 * Hvilken versjon ble brukt? Den nyeste som hadde akkurat denne modellen.
 * (Ble bare stemmen byttet, finnes samme ansikt i flere versjoner — da er
 * den nyeste av dem det ærligste svaret.) Null når modellen ikke finnes i
 * historikken.
 */
export function versjonForModell(versjoner: TvillingVersjon[], type: Komponent, modell: string | null | undefined): number | null {
  if (!modell) return null
  const treff = versjoner.filter((v) => komponentAv(v, type) === modell).map((v) => v.version)
  return treff.length ? Math.max(...treff) : null
}

/**
 * Dekker en lisens festet til `lisensVersjon` en bruk gjort med `modell`?
 *
 * - `modell` ukjent (kalleren sa ikke hva som ble brukt) → ja: regelen kan
 *   ikke anvendes, og oppførselen er som før versjonene.
 * - Lisensen uten versjon, eller versjonen finnes ikke → nei.
 * - Ellers: ja bare når versjonens modell for komponenten er nøyaktig den
 *   som ble brukt.
 */
export function lisensDekkerModell(
  versjoner: TvillingVersjon[], lisensVersjon: number | null | undefined, type: Komponent, modell: string | null | undefined,
): boolean {
  if (!modell) return true
  if (lisensVersjon == null) return false
  const v = versjoner.find((x) => x.version === lisensVersjon)
  return !!v && komponentAv(v, type) === modell
}

/** Del lisensradene i de som dekker modellen og de som er festet til en annen. */
export function skillPaaVersjon<T extends { twin_version?: number | null }>(
  rader: T[], versjoner: TvillingVersjon[], type: Komponent, modell: string | null | undefined,
): { dekket: T[]; annenVersjon: T[] } {
  const dekket: T[] = []
  const annenVersjon: T[] = []
  for (const r of rader) (lisensDekkerModell(versjoner, r.twin_version, type, modell) ? dekket : annenVersjon).push(r)
  return { dekket, annenVersjon }
}

/**
 * Hvilken modell skal en kunde med lisens generere med? Lisensens festede
 * modell — produksjonen får det den klarerte, ikke det som er nyest. Uten én
 * entydig lisens, eller når den festede versjonen mangler komponenten: den
 * gjeldende modellen (og hovedboken avgjør om bruken er hjemlet).
 */
export function modellForLisens(
  versjoner: TvillingVersjon[], lisensVersjon: number | null | undefined, type: Komponent, gjeldende: string | null,
): { modell: string | null; versjon: number | null; festet: boolean } {
  if (lisensVersjon != null) {
    const v = versjoner.find((x) => x.version === lisensVersjon)
    const m = v ? komponentAv(v, type) : null
    if (m) return { modell: m, versjon: lisensVersjon, festet: true }
  }
  return { modell: gjeldende, versjon: versjonForModell(versjoner, type, gjeldende), festet: false }
}
