// Stemmeabonnementet ved onboarding og påmeldingsavgiften (126, 28.10.2026).
//
// Ren modul, så reglene kan prøves for hånd (scripts/test-onboardingutlegg.mjs).
//
// 🔑 HVEM SOM BETALER, AVGJØRES AV VEIEN INN — ikke av hvem som sitter i møtet:
//   kom hun gjennom et byrå  -> byråets innstilling: TwinLedger eller byrået
//   drop-in                  -> hun selv
// Adminen kan overstyre ved registreringen, men forslaget kommer herfra.
//
// 🔑 HUN BETALER ALLTID FØRST. Abonnementet ligger på hennes egen konto hos
// stemmeleverandøren og må betales med et kort der. Dekker noen andre det, får
// hun pengene tilbake med en gang (Lars 28.10), ikke ved neste oppgjør.

export type Betaler = 'platform' | 'agency' | 'actor'
export type Dekning = 'platform' | 'agency'

export const BETALERE: readonly Betaler[] = ['platform', 'agency', 'actor']
export const erBetaler = (v: unknown): v is Betaler => typeof v === 'string' && (BETALERE as readonly string[]).includes(v)
export const erDekning = (v: unknown): v is Dekning => v === 'platform' || v === 'agency'

/** Byråets innstilling slik den står på raden; ukjent eller tomt = TwinLedger. */
export function lesDekning(v: unknown): Dekning {
  return erDekning(v) ? v : 'platform'
}

/** Hvem som skal dekke abonnementet, ut fra veien inn. */
export function foreslaattBetaler(byraa: { id: string; covers_onboarding?: unknown } | null): Betaler {
  if (!byraa?.id) return 'actor'
  return lesDekning(byraa.covers_onboarding)
}

/**
 * Er en overstyring lov? «Byrået» krever at hun har et byrå å fakturere.
 * Alt annet står adminen fritt til — det finnes avtaler systemet ikke kjenner.
 */
export function kanBetale(betaler: Betaler, harByraa: boolean): boolean {
  return betaler !== 'agency' || harByraa
}

export type UtleggStatus = 'own_cost' | 'to_refund' | 'refunded' | 'to_invoice' | 'invoiced'

/** Hvor utlegget står. Byråets utlegg går refundert -> til fakturering -> fakturert. */
export function utleggStatus(r: { payer: string; refunded_at: string | null; invoiced_at: string | null }): UtleggStatus {
  if (r.payer === 'actor') return 'own_cost'
  if (!r.refunded_at) return 'to_refund'
  if (r.payer === 'agency') return r.invoiced_at ? 'invoiced' : 'to_invoice'
  return 'refunded'
}

/** Leser et kronebeløp fra et skjemafelt («230», «229,50»). Null hvis ugyldig. */
export function lesBeloep(raa: unknown): number | null {
  const s = String(raa ?? '').trim().replace(/\s/g, '').replace(',', '.')
  if (!s) return null
  const n = Number(s)
  if (!Number.isFinite(n) || n <= 0 || n > 100000) return null
  return Math.round(n * 100) / 100
}

/**
 * Må hun betale påmeldingsavgiften før ansiktsmodellen trenes?
 *
 * Bare når banken har satt en avgift, hun kom inn uten byrå, og hun vil ha
 * ansiktsmodell — avgiften dekker treningen, og en ren stemme koster oss ingen
 * trening. Betalt eller fritatt én gang er nok.
 */
export function kreverAvgift(o: {
  avgiftNok: number | null | undefined
  harByraa: boolean
  vilHaAnsikt: boolean
  status: 'paid' | 'waived' | 'pending' | null | undefined
}): boolean {
  const avgift = Number(o.avgiftNok ?? 0)
  if (!(avgift > 0)) return false
  if (o.harByraa || !o.vilHaAnsikt) return false
  return o.status !== 'paid' && o.status !== 'waived'
}
