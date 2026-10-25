// Hvem får generere med en trent ansiktsmodell (user_characters)? (25.10.2026)
//
// Før: alle innloggede i tenanten, for enhver modell tenanten eide — og på
// rot-tenanten alle, for alt. På twinledger.ai kan hvem som helst registrere
// seg, så en id var nok til å lage bilder med en annens ansikt. Lista
// (/api/characters) slutter å vise andres id-er; denne regelen sørger for at
// en id man likevel har fått tak i, ikke åpner noe.
//
// Tre veier inn, i denne rekkefølgen:
//   1. Egen modell — laget av brukeren, eid i host-tenantens kjede. På rot
//      setter treningen ingen eier, så der gjelder eierløse rader.
//   2. Admin i host-tenanten — for modeller kjeden eier.
//   3. Bankansikt — rettighetshaverens ansikt er tilgjengelig for host-
//      tenanten. Det er prissatt og føres i hovedboken, så alle innloggede.
//
// Stengt (trukket tilbake, venter på godkjenning, aldersmodell av) avgjøres
// FØR denne regelen i kallstedet — et nei fra henne veier tyngre enn alt her.
//
// Ren modul, så regelen kan prøves for hånd (scripts/test-ansikttilgang.mjs).
// Oppslagene sendes inn som funksjoner og gjøres bare når de trengs.

export interface AnsiktRad {
  owner_tenant_id: string | null
  created_by: string | null
}

export interface Spoerrer {
  tenantId: string
  /** Host-tenanten og leddene over (tenantChainUp). Tom på rot. */
  kjede: string[]
  brukerId: string
  erAdmin: () => Promise<boolean>
  viaBank: () => Promise<boolean>
}

export async function kanBrukeAnsikt(rad: AnsiktRad, s: Spoerrer): Promise<boolean> {
  const rot = s.tenantId === 'root'
  const iKjeden = !!rad.owner_tenant_id && s.kjede.includes(rad.owner_tenant_id)
  const egen = !!rad.created_by && rad.created_by === s.brukerId
  if (egen && (iKjeden || (rot && !rad.owner_tenant_id))) return true
  if (iKjeden && (await s.erAdmin())) return true
  if (!rot && (await s.viaBank())) return true
  return false
}
