// Karakter-personaer for konsistente verter i videoer (fal.ai flux-lora).
// Karakter-blokkene er hentet fra Studio Kit-prompt-bibliotekene (Peregrine/Reforhandle).
// LoRA-vekt-URL-ene settes som env-variabler i Netlify (fra fal-dashbordet:
// «Copy link» på Diffusers Lora File etter trening) — da trengs ingen redeploy
// for å bytte/oppdatere en LoRA.

export interface Character {
  id: string
  name: string
  trigger: string
  loraUrl?: string
  characterBlock: string
}

export const CHARACTERS: Record<string, Character> = {
  adam: {
    id: 'adam',
    name: 'Adam (Reforhandle)',
    trigger: 'ADAMKEY',
    loraUrl: process.env.ADAM_LORA_URL,
    characterBlock:
      'ADAMKEY, a friendly approachable man in a dark blazer over a light shirt, warm genuine smile, slim face, lean features, defined jawline, natural relaxed posture',
  },
  lawrence: {
    id: 'lawrence',
    name: 'Lawrence (Peregrine)',
    trigger: 'LK',
    loraUrl: process.env.LAWRENCE_LORA_URL,
    characterBlock:
      'LK, a distinguished man in his early 60s, long grey-blond hair in a loose ponytail, black rectangular glasses, trimmed light stubble, calm confident expression, wearing a dark navy blazer over a black crew-neck sweater, dark jeans, a classic dive watch, natural relaxed posture',
  },
  // torben: legges til når LoRA-en er trent (fal flux-lora-fast-training)
}

export function getCharacter(id?: string | null): Character | null {
  if (!id) return null
  return CHARACTERS[id] || null
}
