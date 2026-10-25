// Nivåene og vurderingen (123, 25.10.2026).
//
// Ren modul, så reglene kan prøves for hånd (scripts/test-nivaa.mjs). De samme
// reglene står i basen der det går (publiseringstriggeren) og i rutene ellers.
//
// 🔑 TRE NIVÅER, IKKE EN RANGERING AV MENNESKER. Nivået sier hvordan personen
// kom inn og hva kunden leter etter: nye ansikter melder seg på selv og
// vurderes før vi bruker penger på en trening; profesjonelle kommer gjennom et
// byrå som går god for dem; kjente navn kommer bare inn på invitasjon, fordi
// det er der misbruket skjer — noen som melder seg på med en kjent persons
// bilder.

export type Nivaa = 'new' | 'pro' | 'star'
export type Vurdering = 'pending' | 'accepted' | 'declined'

export const NIVAAER: readonly Nivaa[] = ['new', 'pro', 'star']
export const VURDERINGER: readonly Vurdering[] = ['pending', 'accepted', 'declined']

export const erNivaa = (v: unknown): v is Nivaa => typeof v === 'string' && (NIVAAER as readonly string[]).includes(v)
export const erVurdering = (v: unknown): v is Vurdering => typeof v === 'string' && (VURDERINGER as readonly string[]).includes(v)

/** Leser nivået slik det står på raden; ukjent eller tomt = nytt ansikt. */
export function lesNivaa(v: unknown): Nivaa {
  return erNivaa(v) ? v : 'new'
}

/** Kan det trenes en modell av henne? Bare når påmeldingen er godtatt. */
export function kanTrenes(vurdering: unknown): boolean {
  return vurdering === 'accepted'
}

/**
 * Takstkortets faktor per nivå. Kortet foreslår, avtalen bestemmer — dette
 * flytter bare forslaget. Nye ansikter får halv sats: «vanlige folk» til
 * reklame er et ekte marked, men et annet enn en profesjonell skuespiller.
 * Kjente navn forhandles alltid; kortet er utgangspunktet, ikke prisen.
 */
export const PRISFAKTOR: Record<Nivaa, number> = { new: 0.5, pro: 1, star: 1 }

export function prisFaktor(nivaa: unknown): number {
  return PRISFAKTOR[lesNivaa(nivaa)]
}

/**
 * Godkjenning per leveranse når ingen regel er satt for kunden. Kjente navn
 * får det som standard: et feilaktig bilde av en kjent person koster mer enn
 * en dags ventetid.
 */
export function standardGodkjenning(nivaa: unknown): 'auto' | 'review' {
  return lesNivaa(nivaa) === 'star' ? 'review' : 'auto'
}

/**
 * Feltene en påmelding får. Byrålenken gir «pro» og en godtatt påmelding —
 * byrået går god for personen. Ellers: nytt ansikt som venter på vurdering.
 * «star» kan aldri komme herfra.
 */
export function paameldingsFelter(viaByraa: { agentId: string } | null, naa = new Date().toISOString()) {
  return viaByraa
    ? { tier: 'pro' as const, intake_status: 'accepted' as const, intake_decided_at: naa, intake_decided_by: `agent:${viaByraa.agentId}` }
    : { tier: 'new' as const, intake_status: 'pending' as const, intake_decided_at: null, intake_decided_by: null }
}

/** Galleriets rekkefølge: kjente navn først, så profesjonelle, så nye ansikter. */
export const GALLERI_REKKEFOLGE: readonly Nivaa[] = ['star', 'pro', 'new']
