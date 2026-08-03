// Kredittkurs-modellen (Lars 2026-07-28): beste kurs er 1 kreditt = 0,10 kr —
// den får man ved kjøp på 100 000 kr. Ved 1 000 kr er kursen 0,135, og
// glidningen imellom er logaritmisk (jevn opplevd rabatt per størrelsesorden).
// Katalogprisene er satt i bestekursen: kreditter = kroner × 10.
export const CREDIT_VALUE_NOK = 0.1 // intern verdi: 1 kreditt = 0,10 kr saldo
export const RATE_BEST = 0.1 // ved 100 000 kr
export const RATE_MIN_PURCHASE = 0.135 // ved 1 000 kr

export function creditRate(amountNok: number): number {
  const a = Math.min(100000, Math.max(1000, amountNok))
  const t = (Math.log(a) - Math.log(1000)) / (Math.log(100000) - Math.log(1000))
  return RATE_MIN_PURCHASE + t * (RATE_BEST - RATE_MIN_PURCHASE)
}

export function creditsFor(amountNok: number): number {
  return Math.floor(amountNok / creditRate(amountNok))
}

// Runde kredittall per pakke (Lars 2026-07-28) — implisitt kurs = amount/credits,
// forankret i beste kurs 0,10 ved 100 000 kr.
export const CREDIT_PACKAGES = [
  { id: 'starter', amount: 1000, credits: 7400 },
  { id: 'medium', amount: 5000, credits: 40000 },
  { id: 'stor', amount: 10000, credits: 85000 },
  { id: 'proff', amount: 50000, credits: 475000 },
  { id: 'byraa', amount: 100000, credits: 1000000 },
] as const

// Forbrukerpakker (/for-deg og artist-tenanter). Grunnkurs 1 kr = 10 kreditter;
// bonus oppover gir en reell grunn til aa ta en stoerre pakke (Lars 1/8).
// Bedre kurs enn bedriftskurven — derfor gates privat-* i credit-checkout.
// «rekker» er til kundevendt tekst: en typisk artistvideo (8 scener med
// bevegelse) koster ~590 kreditter, ~800 med proeving paa animasjonene.
export const CONSUMER_CREDIT_PACKAGES = [
  { id: 'privat-liten', amount: 200, credits: 2000, bonusPct: 0, rekker: 'films23' },
  { id: 'privat-mellom', amount: 500, credits: 5500, bonusPct: 10, rekker: 'films68' },
  { id: 'privat-stor', amount: 1000, credits: 12000, bonusPct: 20, rekker: 'films1318' },
] as const

// Valuta per tenant (Lars 3/8: «Isabels tjeneste maa ta betalt i GBP»).
// KREDITTENE er den faste stoerrelsen — de er valutanoeytrale og betyr det
// samme overalt. Det er PRISEN paa pakken som skifter, ikke innholdet, saa en
// britisk artist faar noeyaktig like mange kreditter for pengene sine.
// Beloepene er runde tall i hver valuta, ikke maskinomregning: 200 kr -> 15
// pund er ~13 kr/pund, og et rundt beloep selger bedre enn 14,83.
export type Valuta = 'nok' | 'gbp'

export const VALUTA_SYMBOL: Record<Valuta, string> = { nok: 'kr', gbp: '£' }

const GBP_BELOEP: Record<string, number> = {
  'privat-liten': 15,
  'privat-mellom': 40,
  'privat-stor': 80,
}

/** Forbrukerpakkene priset i tenantens valuta. Ukjent valuta -> kroner. */
export function consumerPackages(valuta: Valuta = 'nok') {
  if (valuta !== 'gbp') return CONSUMER_CREDIT_PACKAGES.map((p) => ({ ...p }))
  return CONSUMER_CREDIT_PACKAGES.map((p) => ({ ...p, amount: GBP_BELOEP[p.id] ?? p.amount }))
}

/**
 * Pakken med RIKTIG beloep for valutaen. MAA brukes paa serveren ogsaa:
 * gjoer man omregningen kun i visningen, viser siden £15 mens Stripe krever
 * 200 - beloepet fra kronelista, tolket som pund (Lars 3/8, fanget i sandkasse).
 */
export function packageFor(id: string, valuta: Valuta = 'nok') {
  const forbruker = consumerPackages(valuta).find((p) => p.id === id)
  if (forbruker) return forbruker
  return CREDIT_PACKAGES.find((p) => p.id === id) ?? null
}

/** «200 kr» / «£15» — symbolet staar der valutaen forventer det. */
export function fmtBeloep(amount: number, valuta: Valuta = 'nok'): string {
  const tall = amount.toLocaleString(valuta === 'gbp' ? 'en-GB' : 'nb-NO')
  return valuta === 'gbp' ? `£${tall}` : `${tall} kr`
}

// Kredittene utloeper ALDRI (Lars 1/8): en artist som slipper album annethvert
// aar skal ikke miste saldoen — og tidsbegrenset forskudd er dessuten et
// forbrukerrettslig minefelt i Norge.
export const CREDITS_EXPIRE = false

export const ALL_CREDIT_PACKAGES = [...CREDIT_PACKAGES, ...CONSUMER_CREDIT_PACKAGES]
