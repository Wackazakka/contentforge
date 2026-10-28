// Sangere — ekte og virtuelle — og sangmodellene deres (127, 28.10.2026).
//
// Ren modul, så reglene kan prøves for hånd (scripts/test-sang.mjs).
//
// 🔑 EN VIRTUELL ARTIST ER EN TVILLING UTEN ET MENNESKE BAK ANSIKTET. Stemme og
// utseende er laget med verktøy (Suno, bildeprogrammer). Rettighetshaveren er
// den som eier artisten — en person eller et selskap — og det er HENNES
// identitet som bekreftes, med de samme reglene som for alle andre. Hovedboken,
// lisensene og oppgjøret virker likt.
//
// 🔑 MISBRUKET VI MÅ STENGE: noen registrerer en kjent sanger som «virtuell».
// Derfor erklæring (fryst på raden), merking overalt der artisten vises, og
// kilden til hver modell: laget med verktøy, eller sunget av et menneske som
// har sagt ja. Synger en ekte sanger for en virtuell artist, er det HANS stemme
// som klones — da skal han stå navngitt på modellen.
//
// 🔑 FRAMFØRINGEN KOMMER FRA DEN SOM SYNGER FORSANGEN. Modellen gir klangen.

export type ArtistType = 'human' | 'virtual'
export type SangKilde = 'recorded' | 'generated'
export type SangStatus = 'training' | 'ready' | 'failed' | 'withdrawn'
export type SangGodkjenning = 'pending' | 'approved' | 'rejected'

export const ARTISTTYPER: readonly ArtistType[] = ['human', 'virtual']
export const erArtistType = (v: unknown): v is ArtistType => v === 'human' || v === 'virtual'
export const erSangKilde = (v: unknown): v is SangKilde => v === 'recorded' || v === 'generated'

/** Slik raden står; ukjent eller tomt = et menneske, som før 127. */
export function lesArtistType(v: unknown): ArtistType {
  return v === 'virtual' ? 'virtual' : 'human'
}

// Erklæringene fryses ordrett på raden, som samtykket (089) og
// modellerklæringen (115). Endres teksten, gjelder den nye bare nye rader.
// Den som ser skjemaet på engelsk, erklærer på engelsk — og det er den
// teksten som fryses. Serveren godtar bare ordlyder den kjenner.
export const VIRTUELLE_ERKLAERINGER = {
  no: 'Artisten er fiktiv. Stemmen og utseendet er laget med verktøy og er ikke laget for å ligne en bestemt, virkelig person. ' +
    'Jeg eier rettighetene til artisten, og jeg har rett til å bruke materialet stemmen og utseendet er laget av, etter vilkårene i verktøyene jeg brukte.',
  en: 'The artist is fictional. The voice and appearance are made with tools and are not made to resemble a specific, real person. ' +
    'I own the rights to the artist, and I have the right to use the material the voice and appearance are made from, under the terms of the tools I used.',
} as const
export const VIRTUELL_ERKLAERING = VIRTUELLE_ERKLAERINGER.no

/** Ordlyden hvis den er en vi kjenner, ellers null. */
export function kjentVirtuellErklaering(v: unknown): string | null {
  return (Object.values(VIRTUELLE_ERKLAERINGER) as string[]).includes(String(v)) ? String(v) : null
}

export const SANG_ERKLAERING_EGEN =
  'Opptakene er av min egen stemme, og jeg har rett til å bruke dem til å lage en sangmodell. ' +
  'De er ikke hentet fra innspillinger som et plateselskap eller andre har rettighetene til, med mindre jeg eier dem selv.'

export const SANG_ERKLAERING_GENERERT =
  'Opptakene er laget med verktøy på en konto som gir meg kommersielle rettigheter til resultatet, og de er ikke laget for å ligne en bestemt, virkelig person.'

export const SANG_ERKLAERING_SESJON =
  'Opptakene er av en sanger som har sagt ja skriftlig til at stemmen hans eller hennes brukes for denne artisten. Sangeren er navngitt under.'

/** Hvilke kilder en modell kan ha. Et menneske klones bare fra egne opptak. */
export function lovligeKilder(type: ArtistType): SangKilde[] {
  return type === 'virtual' ? ['generated', 'recorded'] : ['recorded']
}

/** Erklæringen som gjelder for kilden — den som fryses på modellen. */
export function erklaeringFor(type: ArtistType, kilde: SangKilde): string {
  if (kilde === 'generated') return SANG_ERKLAERING_GENERERT
  return type === 'virtual' ? SANG_ERKLAERING_SESJON : SANG_ERKLAERING_EGEN
}

/**
 * Kan det trenes en sangmodell? Samme vurdering som ansiktet (123), en kilde
 * som passer artisten, og for en virtuell artist sunget av et menneske: navnet
 * på sangeren. Svarer med grunnen når svaret er nei.
 */
export function sangHinder(o: {
  vurdering: unknown
  type: ArtistType
  kilde: unknown
  kildeNotat: string | null | undefined
  virtueltErklaert: boolean
}): string | null {
  if (o.vurdering !== 'accepted') return 'Påmeldingen er ikke godtatt ennå. Vurder den før modellen trenes.'
  if (!erSangKilde(o.kilde)) return 'Velg hvor opptakene kommer fra.'
  if (!lovligeKilder(o.type).includes(o.kilde)) return 'Et menneske kan bare klones fra sine egne opptak.'
  if (o.type === 'virtual' && !o.virtueltErklaert) return 'Den virtuelle artisten mangler erklæringen fra eieren.'
  if (o.type === 'virtual' && o.kilde === 'recorded' && !(o.kildeNotat || '').trim()) {
    return 'Synger et menneske for artisten, må sangeren stå navngitt — det er stemmen hans eller hennes som klones.'
  }
  if (o.kilde === 'generated' && !(o.kildeNotat || '').trim()) return 'Skriv hvilket verktøy opptakene er laget med.'
  return null
}

/** Kan modellen tas i bruk? Bare ferdig trent og godkjent av rettighetshaveren. */
export function kanAktiveres(m: { status: string; approval_status: string }): boolean {
  return m.status === 'ready' && m.approval_status === 'approved'
}

/** Mappenavnet i treningszipen: dataset/<navn>/*.wav. Bare a–z og tall. */
export function datasettNavn(navn: string): string {
  const s = navn.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/æ/g, 'ae').replace(/ø/g, 'o').replace(/å/g, 'a')
    .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
  return (s || 'sanger').slice(0, 40)
}

/**
 * Påmeldingens del om artisttype og sang (101/127), lest likt i begge
 * påmeldingsrutene. Erklæringen fryses fra konstanten her, aldri fra klienten.
 * En virtuell artist tilbyr ikke tale ennå: proffklonen hos stemmeleverandøren
 * må være eierens egen stemme, verifisert av eieren selv.
 */
export function lesSangPaamelding(b: Record<string, unknown>, naa: string):
  { feil: string } | { artistType: ArtistType; tilbyrSang: boolean; tvingIngenTale: boolean; felter: Record<string, unknown> } {
  const artistType = lesArtistType(b.artistKind)
  const tilbyrSang = b.offersSinging === true
  const erklaering = kjentVirtuellErklaering(b.virtualDeclarationText)
  if (artistType === 'virtual' && (b.virtualDeclared !== true || !erklaering)) {
    return { feil: 'Kryss av for erklæringen om den virtuelle artisten.' }
  }
  return {
    artistType,
    tilbyrSang,
    tvingIngenTale: artistType === 'virtual',
    felter: radFelter({ artistType, tilbyrSang, naa, erklaering }),
  }
}

/**
 * Kolonnene raden får. Tomt for et menneske som ikke synger — da skriver vi
 * ingenting nytt, og påmeldingen virker som før selv om 127 ikke er kjørt.
 */
export function radFelter(o: { artistType: ArtistType; tilbyrSang: boolean; naa: string; erklaering?: unknown }): Record<string, unknown> {
  const f: Record<string, unknown> = {}
  if (o.tilbyrSang) f.offers_singing = true
  if (o.artistType === 'virtual') {
    f.artist_kind = 'virtual'
    f.virtual_declaration = kjentVirtuellErklaering(o.erklaering) ?? VIRTUELL_ERKLAERING
    f.virtual_declared_at = o.naa
  }
  return f
}

/** Etiketten som skal stå der artisten vises. Tom for et menneske. */
export function merking(type: ArtistType): string {
  return type === 'virtual' ? 'Virtuell artist' : ''
}
