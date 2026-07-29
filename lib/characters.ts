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
  // Eksklusivitet: karakteren tilbys/godtas kun på denne tenant-sluggen.
  // undefined = åpen for alle tenants (Lars 2026-07-29: Adam eksklusiv, Lawrence åpen).
  restrictToTenantSlug?: string
}

export const CHARACTERS: Record<string, Character> = {
  adam: {
    id: 'adam',
    name: 'Adam (Reforhandle)',
    trigger: 'ADAMKEY',
    restrictToTenantSlug: 'centerforge', // Reforhandle-innhold produseres på rot — Adam skal ikke tilbys hos white-labels
    loraUrl: process.env.ADAM_LORA_URL,
    characterBlock:
      'ADAMKEY, a friendly approachable man in a dark blazer over a light shirt, warm genuine smile, slim face, lean features, defined jawline, natural relaxed posture',
  },
  lawrence: {
    id: 'lawrence',
    name: 'Lawrence (Peregrine)',
    trigger: 'LK',
    loraUrl: process.env.LAWRENCE_LORA_URL,
    // «Ung, pen»-varianten (bevist i fal-kjøringene 2026-07-13) — samme LoRA, penere formulering
    characterBlock:
      'LK, five years younger, exceptionally well-groomed and charismatic, confident but approachable, long grey-blond hair in a loose ponytail, black rectangular glasses, wearing a perfectly tailored dark navy blazer over a premium black T-shirt, luxury watch, no tie, natural relaxed posture',
  },
  // torben: legges til når LoRA-en er trent (fal flux-lora-fast-training)
}

export function getCharacter(id?: string | null): Character | null {
  if (!id) return null
  return CHARACTERS[id] || null
}

// Innebygde karakterer som skal tilbys på gitt tenant (brukes av nedtrekkslistene
// og håndheves server-side i generate-image).
export function builtinCharactersForTenant(tenantSlug: string): Character[] {
  return Object.values(CHARACTERS).filter(
    (c) => !c.restrictToTenantSlug || c.restrictToTenantSlug === tenantSlug
  )
}
