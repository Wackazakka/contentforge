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
  // undefined = åpen for alle tenants (Lars 2026-07-29: Adam eksklusiv).
  restrictToTenantSlug?: string
  // Bare disse brukerne (auth.users.id) får tilbud om / kan bruke karakteren.
  restrictToUserIds?: string[]
}

// Lars' egne kontoer: kilevold@gmail.com, kilevold@online.no, lars@norditech.io.
// Lars 12/10: «Lawrence skal bare være tilgjengelig for meg» — han lå åpen for
// alle tenants og ble tilbudt IndigoBoom-artistene i PromoMaker.
const LARS_USER_IDS = [
  '831847a0-daf3-4765-a3ea-632a065c5b92',
  '9c5991fb-9579-40b0-a1f8-68b8dd47612f',
  'cde8ce70-db9f-4a93-a554-dc480bbcfa47',
]

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
    restrictToUserIds: LARS_USER_IDS,
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

// Får denne brukeren på denne tenanten bruke karakteren? Både tenant- og
// brukersperre. Uten kjent bruker slipper en brukersperret karakter aldri gjennom.
export function characterAllowed(c: Character, ctx: { tenantSlug: string; userId?: string | null }): boolean {
  if (c.restrictToTenantSlug && c.restrictToTenantSlug !== ctx.tenantSlug) return false
  if (c.restrictToUserIds && (!ctx.userId || !c.restrictToUserIds.includes(ctx.userId))) return false
  return true
}

// Innebygde karakterer som skal tilbys (nedtrekkslistene får dem fra
// /api/characters; generate-image håndhever det samme server-side).
export function builtinCharactersFor(ctx: { tenantSlug: string; userId?: string | null }): Character[] {
  return Object.values(CHARACTERS).filter((c) => characterAllowed(c, ctx))
}
