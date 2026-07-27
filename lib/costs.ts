// Estimerte kostnader i NOK, inkl. 100 % påslag på underliggende API-pris.
// Grunnpriser: gpt-image low ~$0.02, flux-lora ~$0.04, ElevenLabs preview ~$0.02,
// PixVerse 720p 5s $0.20 / 8s ~$0.40. USD→NOK ~10.
export const COSTS_NOK = {
  imageStandard: 0.4,
  imageCharacter: 0.8,
  voiceoverPreview: 0.5,
  animate5s: 4,
  animate8s: 8,
}

export function fmtNok(n: number): string {
  return n.toFixed(2).replace('.', ',') + ' kr'
}
