// Estimerte kostnader i NOK, inkl. 100 % påslag på underliggende API-pris.
// Grunnpriser: gpt-image low ~$0.02, flux-lora ~$0.04, ElevenLabs preview ~$0.02,
// PixVerse 720p 5s $0.20 / 8s ~$0.40. USD→NOK ~10.
export const COSTS_NOK = {
  imageStandard: 0.4,
  imageCharacter: 0.8,
  voiceoverPreview: 0.5,
  animate5s: 4,
  animate8s: 8,
  // VEED Fabric 1.0 (lip-sync): $0,15/sek 720p → ~3 kr/sek inkl. påslag.
  lipsyncPerSec: 3,
  lipsyncTypical: 18, // typisk snakke-segment ~6 sek
  // fal flux-lora-portrait-trainer: ~$2 per kjøring → ~20 kr råkost.
  // Var UMÅLT frem til 27/8 — hver trening brant ekte GPU-penger usynlig.
  characterTraining: 40,
}

export function fmtNok(n: number): string {
  return n.toFixed(2).replace('.', ',') + ' kr'
}

// Kundevendt visning i kreditter: katalogkursen er 1 kreditt = 0,10 kr,
// så kreditter = kroner × 10. Valutanøytralt for utenlandske sluttkunder —
// ekte betalinger (Stripe) vises fortsatt i kroner.
export function fmtCredits(nok: number, enhet = 'kreditter'): string {
  const c = nok * 10
  const rounded = Math.round(c * 10) / 10
  const txt = Number.isInteger(rounded) ? rounded.toLocaleString('nb-NO') : rounded.toFixed(1).replace('.', ',')
  // Enheten var hardkodet norsk (Lars 3/8) — engelske tenanter som Isabel
  // fikk «180 kreditter» midt i en engelsk setning.
  return txt + ' ' + enhet
}

// Prisnivåer: COSTS_NOK er allerede 2× underliggende kost (100 % påslag).
// Registrert betaler 1,0× av dette; anonym 1,5× (= 3× kost / 200 % påslag).
// Budskap: «Registrer deg og få 33 % rabatt» (1 − 1/1,5).
export const TIER_MULTIPLIERS = {
  registered: 1,
  anonymous: 1.5,
} as const

export type PriceTier = keyof typeof TIER_MULTIPLIERS

// Minstepris per produksjon (unngår gebyr-dominerte småbeløp hos Stripe)
export const MIN_PRICE_NOK = 10
