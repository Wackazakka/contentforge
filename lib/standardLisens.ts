// Standardlisens (128, Lars 28.10.2026): lisens med en gang der
// rettighetshaveren har sagt ja på forhånd.
//
// Ren modul, så reglene kan prøves for hånd (scripts/test-standardlisens.mjs).
//
// 🔑 TO LAG AV GRENSER. Plattformens grenser gjelder alltid, uansett hva noen
// krysser av: aldri kjente navn (de godkjenner hver leveranse selv), aldri verk
// (evig og bundet til verket, store beløp), aldri eksklusivitet (stenger andre
// ute), aldri uten sluttdato. Innenfor dem velger rettighetshaveren hva hun
// forhåndsgodkjenner: hva, hvor, hvor lenge.
//
// 🔑 SENSITIVE KATEGORIER ER KUNDENS ERKLÆRING, i vilkårene hun godtar.
// Politikk, religion, alkohol og liknende avtales alltid — og står kunden inne
// for at bruken ikke er det, er det hennes ansvar om den likevel er det.

import type { Asset, MediaClass, Territory, Exclusivity } from '@/lib/rateCard'

export const ASSETS: readonly Asset[] = ['voice', 'face', 'both']
export const MEDIA: readonly MediaClass[] = ['internal', 'online', 'broadcast']
export const TERRITORIER: readonly Territory[] = ['no', 'nordic', 'world']
export const PERIODER = [3, 12] as const
export type Periode = (typeof PERIODER)[number]

export interface StandardVilkaar {
  enabled: boolean
  assets: Asset[]
  media: MediaClass[]
  territories: Territory[]
  maxTermMonths: Periode
}

/** Forslaget når noen slår det på første gang: det trygge midtsjiktet. */
export const STANDARD_FORSLAG: StandardVilkaar = {
  enabled: false,
  assets: ['voice', 'face', 'both'],
  media: ['internal', 'online'],
  territories: ['no', 'nordic'],
  maxTermMonths: 12,
}

const delmengde = <T extends string>(raa: unknown, lov: readonly T[]): T[] =>
  Array.isArray(raa) ? lov.filter((v) => raa.includes(v)) : []

/** Vilkårene slik de står på raden — eller fra et skjema — renset for ukjente verdier. */
export function lesVilkaar(r: unknown): StandardVilkaar {
  const o = (r && typeof r === 'object' ? r : {}) as Record<string, unknown>
  const termin = Number(o.maxTermMonths ?? o.max_term_months)
  return {
    enabled: o.enabled === true,
    assets: delmengde(o.assets, ASSETS),
    media: delmengde(o.media, MEDIA),
    territories: delmengde(o.territories, TERRITORIER),
    maxTermMonths: termin === 3 ? 3 : 12,
  }
}

export interface Valg {
  kind: 'campaign' | 'work'
  asset: Asset
  mediaClass: MediaClass
  territory: Territory
  termMonths: number
  exclusivity: Exclusivity
}

export interface AktoerForStandard {
  tier: string | null
  isActive: boolean
  isDemo: boolean
  intakeStatus: string | null
}

/** Plattformens grenser for selve skuespilleren. Null = kan ha standardlisens. */
export function aktoerHinder(a: AktoerForStandard): string | null {
  if (a.isDemo) return 'Testprofiler kan ikke lisensieres.'
  if (a.tier === 'star') return 'Kjente navn lisensieres alltid etter avtale.'
  if ((a.intakeStatus ?? 'accepted') !== 'accepted') return 'Påmeldingen er ikke godtatt ennå.'
  if (!a.isActive) return 'Rettighetshaveren er ikke aktiv.'
  return null
}

/**
 * Kan denne bruken få standardlisens? Svarer med grunnen når svaret er nei —
 * da sendes kunden til en vanlig forespørsel, med valgene i behold.
 */
export function standardHinder(v: StandardVilkaar | null, valg: Valg, a: AktoerForStandard): string | null {
  const aktoer = aktoerHinder(a)
  if (aktoer) return aktoer
  if (!v || !v.enabled) return 'Rettighetshaveren har ikke slått på standardlisens.'
  if (valg.kind !== 'campaign') return 'Film, serie, spill og lydbok avtales alltid.'
  if (valg.exclusivity !== 'none') return 'Eksklusivitet avtales alltid.'
  if (!(valg.termMonths > 0)) return 'Lisens uten sluttdato avtales alltid.'
  if (valg.termMonths > v.maxTermMonths) return `Standardlisensen gjelder opptil ${v.maxTermMonths} måneder.`
  if (!v.assets.includes(valg.asset)) return 'Standardlisensen dekker ikke dette (stemme, ansikt eller begge).'
  if (!v.media.includes(valg.mediaClass)) return 'Standardlisensen dekker ikke dette mediet.'
  if (!v.territories.includes(valg.territory)) return 'Standardlisensen dekker ikke dette området.'
  return null
}

// Vilkårene kunden godtar, fryst ordrett på lisensen (128). Endres teksten,
// gjelder den nye bare nye lisenser.
export const STANDARD_VILKAAR_TEKST = {
  no: 'Jeg godtar standardvilkårene for lisensen: bruken er begrenset til det som står på lisensen (hva, medium, område og periode), ' +
    'den er ikke eksklusiv, og den kan ikke overdras. Bruken gjelder ikke politikk, religion, alkohol, pengespill eller erotikk, ' +
    'og den fremstiller ikke rettighetshaveren på en nedsettende eller villedende måte. All bruk føres i hovedboken, ' +
    'og lisensen faller bort hvis vilkårene brytes. Prisen trekkes fra saldoen med en gang.',
  en: 'I accept the standard terms for the licence: use is limited to what the licence states (what, medium, territory and period), ' +
    'it is not exclusive, and it cannot be transferred. The use does not concern politics, religion, alcohol, gambling or adult content, ' +
    'and it does not portray the rights holder in a demeaning or misleading way. All use is recorded in the ledger, ' +
    'and the licence lapses if the terms are breached. The price is deducted from the balance at once.',
} as const

/** Ordlyden hvis den er en vi kjenner, ellers null. Serveren godtar bare kjente. */
export function kjentVilkaarTekst(v: unknown): string | null {
  return (Object.values(STANDARD_VILKAAR_TEKST) as string[]).includes(String(v)) ? String(v) : null
}

/** Kort sammendrag til skjermen og API-et. */
export function sammendrag(v: StandardVilkaar): { assets: Asset[]; media: MediaClass[]; territories: Territory[]; maxTermMonths: number } {
  return { assets: v.assets, media: v.media, territories: v.territories, maxTermMonths: v.maxTermMonths }
}
