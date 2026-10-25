// Takstkortet: en TILBUDSGENERATOR, ikke en prisliste.
//
// Kortet foreslår; avtalen bestemmer. Hver lisensrad bærer sine egne kroner,
// frosset ved inngåelse (se migrasjon 078). Slår man opp prisen i kortet ved
// visning, ville en justering her i 2027 skrevet om historien — og da mister
// hovedboken det eneste den egentlig selger.
//
// Oppslaget går i kjede, mest spesifikk vinner:
//   lisensen  →  skuespilleren  →  tenanten (tenants.rate_card)  →  dette
//
// Tallene er Lars' utgangspunkt 20.09.2026, ikke markedsfakta. Strukturen er
// den som holder; kronene skal forhandles fra verk til verk. ⚠️ Verk-satsene
// er dårligere fundert enn kampanje-satsene — ankeret bør være Norsk
// Skuespillerforbunds satser for sammenlignbart arbeid.

export const RATE_CARD_VERSION = '2026-10-25'

export type Asset = 'voice' | 'face' | 'both'
export type MediaClass = 'internal' | 'online' | 'broadcast'
export type Territory = 'no' | 'nordic' | 'world'
export type Exclusivity = 'none' | 'category' | 'full'
export type ProductionTier = 'short' | 'national' | 'major' | 'international'
export type RoleScope = 'line' | 'supporting' | 'lead'

export interface RateCard {
  version: string
  campaign: {
    /** Grunnpris: Norge, 3 måneder, ikke-eksklusivt. */
    base: Record<MediaClass, { voice: number; face: number }>
    territory: Record<Territory, number>
    /** Nøkkel = antall måneder; 0 = evig (buyout). */
    term: Record<string, number>
    exclusivity: Record<Exclusivity, number>
  }
  work: {
    /** Engangssum, evigvarende, bundet til verket. Stemme. */
    base: Record<ProductionTier, Record<RoleScope, number>>
    /** Ansikt er mer eksponert, og tilbaketrekking virker ikke bakover. */
    faceFactor: number
    /** Etterbetaling som trinn, i prosent av kundeprisen. */
    steps: Record<string, number>
  }
  /**
   * TwinLedgers klareringsavgift, i prosent av kundeprisen (25.10.2026).
   * TwinLedger klarerer, men selger ikke: avgiften er den samme uansett hvem
   * som selger, og den står som egen post i hver lisens.
   */
  clearingPct: number
  /**
   * Forslag til rettighetshaverens honorar, i prosent av kundeprisen.
   * Standard = alt som ikke er klareringsavgift. Agentens provisjon trekkes
   * av honoraret, ikke av kundeprisen. Settes den lavere i et ledds eget
   * kort, går differansen til det selgende leddet — og står da som egen post.
   */
  rightsHolderPct: number
  /** Fornyelse skal være billigere enn å starte på nytt. */
  renewalPct: number
}

export const STANDARD_RATE_CARD: RateCard = {
  version: RATE_CARD_VERSION,
  campaign: {
    base: {
      internal:  { voice: 1500, face: 2500 },   // e-læring, telefonsvarer, intern film, pitch
      online:    { voice: 4000, face: 6000 },   // betalt distribusjon, web, sosiale kanaler
      broadcast: { voice: 9000, face: 15000 },  // radio, TV, kino, DOOH
    },
    territory: { no: 1.0, nordic: 1.6, world: 2.5 },
    term: { '3': 1.0, '12': 2.0, '0': 4.0 },
    exclusivity: { none: 1.0, category: 1.5, full: 2.0 },
  },
  work: {
    base: {
      short:         { line: 1500,  supporting: 4000,  lead: 9000 },
      national:      { line: 5000,  supporting: 15000, lead: 40000 },
      major:         { line: 10000, supporting: 30000, lead: 80000 },
      international: { line: 25000, supporting: 75000, lead: 200000 },
    },
    faceFactor: 1.75,
    steps: { theatrical_release: 25, international_sale: 50, streamer_pickup: 50 },
  },
  clearingPct: 10,
  rightsHolderPct: 90,
  renewalPct: 80,
}

export const kr = (n: number) => Math.round(n * 100) / 100

/**
 * Slå sammen et lagret kort (tenants.rate_card) med standardkortet. Delvis
 * overstyring skal være mulig: et byrå som bare vil endre kringkastingssatsen
 * skal ikke måtte kopiere hele kortet og dermed fryse resten ved et uhell.
 */
export function mergeRateCard(lagret: unknown): RateCard {
  const c = STANDARD_RATE_CARD
  if (!lagret || typeof lagret !== 'object') return c
  const o = lagret as Partial<RateCard>
  const oc = (o.campaign ?? {}) as Partial<RateCard['campaign']>
  const ow = (o.work ?? {}) as Partial<RateCard['work']>
  return {
    version: typeof o.version === 'string' ? o.version : c.version,
    campaign: {
      base: { ...c.campaign.base, ...(oc.base ?? {}) },
      territory: { ...c.campaign.territory, ...(oc.territory ?? {}) },
      term: { ...c.campaign.term, ...(oc.term ?? {}) },
      exclusivity: { ...c.campaign.exclusivity, ...(oc.exclusivity ?? {}) },
    },
    work: {
      base: { ...c.work.base, ...(ow.base ?? {}) },
      faceFactor: typeof ow.faceFactor === 'number' ? ow.faceFactor : c.work.faceFactor,
      steps: { ...c.work.steps, ...(ow.steps ?? {}) },
    },
    clearingPct: typeof o.clearingPct === 'number' ? o.clearingPct : c.clearingPct,
    // Honoraret følger klareringsavgiften når et kort bare endrer avgiften.
    // (Et gammelt platformPct i et lagret kort betydde noe annet og leses ikke.)
    rightsHolderPct: typeof o.rightsHolderPct === 'number'
      ? o.rightsHolderPct
      : 100 - (typeof o.clearingPct === 'number' ? o.clearingPct : c.clearingPct),
    renewalPct: typeof o.renewalPct === 'number' ? o.renewalPct : c.renewalPct,
  }
}

/** Grunnpris per aktivum. 'both' = to rettigheter, altså summen. */
function grunnKampanje(card: RateCard, asset: Asset, media: MediaClass): number {
  const b = card.campaign.base[media]
  if (!b) return 0
  return asset === 'voice' ? b.voice : asset === 'face' ? b.face : b.voice + b.face
}

function grunnVerk(card: RateCard, asset: Asset, tier: ProductionTier, role: RoleScope): number {
  const stemme = card.work.base[tier]?.[role] ?? 0
  const ansikt = kr(stemme * card.work.faceFactor)
  return asset === 'voice' ? stemme : asset === 'face' ? ansikt : stemme + ansikt
}

export interface KampanjeSpec {
  asset: Asset
  mediaClass: MediaClass
  territory: Territory
  /** Måneder; 0 = evig. */
  termMonths: number
  exclusivity: Exclusivity
}

export interface VerkSpec {
  asset: Asset
  productionTier: ProductionTier
  roleScope: RoleScope
}

/** Listepris for en kampanjelisens. Forslag — skal kunne overstyres. */
export function quoteCampaign(card: RateCard, s: KampanjeSpec): number {
  const t = card.campaign.territory[s.territory] ?? 1
  // Ukjent periode faller til nærmeste kjente i stedet for å gi 0 kr — en
  // stille nullpris er verre enn et tall noen må korrigere.
  const term = card.campaign.term[String(s.termMonths)] ?? (s.termMonths >= 12 ? card.campaign.term['12'] : card.campaign.term['3']) ?? 1
  const e = card.campaign.exclusivity[s.exclusivity] ?? 1
  return kr(grunnKampanje(card, s.asset, s.mediaClass) * t * term * e)
}

/** Listepris for en verkslisens: engangssum, evig, bundet til verket. */
export function quoteWork(card: RateCard, s: VerkSpec): number {
  return kr(grunnVerk(card, s.asset, s.productionTier, s.roleScope))
}

/** Trinnbeløp (etterbetaling) i kroner, av kundeprisen. */
export function quoteStep(card: RateCard, trigger: string, feeCustomerNok: number): number {
  const pct = card.work.steps[trigger]
  if (!pct) return 0
  return kr((feeCustomerNok * pct) / 100)
}

/** Forslag til rettighetshaverens honorar, gitt en kundepris. */
export function foreslaattHonorar(card: RateCard, feeCustomerNok: number): number {
  return kr((feeCustomerNok * card.rightsHolderPct) / 100)
}
