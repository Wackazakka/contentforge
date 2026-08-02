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
  { id: 'privat-liten', amount: 200, credits: 2000, bonusPct: 0, rekker: '2–3 filmer' },
  { id: 'privat-mellom', amount: 500, credits: 5500, bonusPct: 10, rekker: '6–8 filmer' },
  { id: 'privat-stor', amount: 1000, credits: 12000, bonusPct: 20, rekker: '13–18 filmer' },
] as const

// Kredittene utloeper ALDRI (Lars 1/8): en artist som slipper album annethvert
// aar skal ikke miste saldoen — og tidsbegrenset forskudd er dessuten et
// forbrukerrettslig minefelt i Norge.
export const CREDITS_EXPIRE = false

export const ALL_CREDIT_PACKAGES = [...CREDIT_PACKAGES, ...CONSUMER_CREDIT_PACKAGES]
