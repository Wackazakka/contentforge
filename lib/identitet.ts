// Identitetsgrunnlaget og publiseringssperren (101/116, 25.10.2026).
//
// Ren modul, så regelen kan prøves for hånd (scripts/test-identitet.mjs).
// Den samme regelen står i basen (triggeren publisering_krever_identitet);
// her er den for å kunne forklare den FØR noen trykker «Publiser».
//
// 🔑 FIRE VERDIER, IKKE EN BOOLEAN (101, 125): byrået som brakte henne
// (vouched), BankID (bankid), et møte med oss (in_person), eller bare en
// avkryssing (self_declared). Null = raden ble lagt inn av admin før
// påmeldingen fantes; den er ikke selverklært.
//
// in_person (125) er det sterkeste for ansiktet: vi har sett at personen på
// bildene er den som satt der. BankID beviser bare hvem som eier kontoen.

export type Grunnlag = 'self_declared' | 'vouched' | 'bankid' | 'in_person'

/** Kan grunnlaget løftes til «bekreftet i møte»? Alt unntatt det som alt er det. */
export function kanBekreftesIMoete(grunnlag: string | null | undefined): boolean {
  return grunnlag !== 'in_person'
}

/** Kan en profil med dette grunnlaget publiseres? Bare den selverklærte stoppes. */
export function kanPubliseres(grunnlag: string | null | undefined): boolean {
  return grunnlag !== 'self_declared'
}

export type Bekreftelse =
  | { av: 'byraa'; agentId: string }
  | { av: 'admin'; epost: string }
  | { av: 'bankid' }
  | { av: 'moete'; epost: string }
  | { av: null }

/** Leser identity_confirmed_by: «agent:<id>», «admin:<e-post>», «meeting:<e-post>» eller «bankid». */
export function lesBekreftelse(confirmedBy: string | null | undefined): Bekreftelse {
  const s = String(confirmedBy || '')
  if (s.startsWith('agent:') && s.length > 6) return { av: 'byraa', agentId: s.slice(6) }
  if (s.startsWith('admin:') && s.length > 6) return { av: 'admin', epost: s.slice(6) }
  if (s.startsWith('meeting:') && s.length > 8) return { av: 'moete', epost: s.slice(8) }
  if (s === 'bankid') return { av: 'bankid' }
  return { av: null }
}

/** En byrålenke-nøkkel slik vi lager dem: 18 tilfeldige bytes, base64url (24 tegn). */
export function erGyldigNoekkel(s: unknown): s is string {
  return typeof s === 'string' && /^[A-Za-z0-9_-]{20,64}$/.test(s)
}

export function byraaLenke(origin: string, token: string): string {
  return `${origin.replace(/\/+$/, '')}/bli-stemme?byraa=${encodeURIComponent(token)}`
}
