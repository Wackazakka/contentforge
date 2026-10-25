// Er en opplastet modellfil en Flux-LoRA? (egen modell, 23.10.2026)
//
// Ren modul, så regelen kan prøves for hånd (scripts/test-lorahode.mjs).
// Dropleten (/hash) leser safetensors-hodet — tensornavnene — mens den regner
// fingeravtrykket. Her avgjøres det ut fra navnene, FØR vi betaler fal for
// prøvebilder med en fil som aldri kan virke.
//
// Navnemønstrene:
//   Flux (begge generasjoner): «double_blocks» / «single_blocks» (kohya, PEFT)
//     eller «transformer_blocks» / «single_transformer_blocks» (diffusers).
//   SDXL / SD 1.5: «down_blocks» / «up_blocks» / «mid_block», «lora_te».
// Flux 1 og Flux 2 kan ikke skilles sikkert på navnene; hun velger selv, og
// kvalitetsporten fanger et feil valg (ingen bilder, eller ikke likt nok).

export type Grunnmodell = 'flux' | 'sd' | 'ukjent'

export interface HashSvar {
  safetensors: boolean
  tensors: number
  sample_keys: string[]
  error: string | null
}

export function grunnmodellFra(noekler: string[]): Grunnmodell {
  if (noekler.some((k) => /double_blocks|single_blocks|single_transformer_blocks|transformer\.transformer_blocks|transformer_blocks\./.test(k))) return 'flux'
  if (noekler.some((k) => /down_blocks|up_blocks|mid_block|lora_te\d?_|lora_unet_(input|output|middle)/.test(k))) return 'sd'
  return 'ukjent'
}

/** Null = brukbar. Ellers grunnen, i klarspråk til henne. */
export function hindringForModell(h: HashSvar): string | null {
  if (h.error || !h.safetensors) return 'Fila er ikke en modellfil (safetensors). Last opp .safetensors-fila fra treningen.'
  if (h.tensors < 2) return 'Fila inneholder ingen LoRA-vekter.'
  const g = grunnmodellFra(h.sample_keys)
  if (g === 'sd') return 'Dette er en LoRA for Stable Diffusion, ikke Flux. Vi genererer med Flux, så den kan ikke brukes her.'
  if (g === 'ukjent') return 'Vi kjenner ikke igjen modellen som en Flux-LoRA. Last opp LoRA-fila fra en Flux-trening.'
  return null
}
