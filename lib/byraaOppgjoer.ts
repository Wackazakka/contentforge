// Byråets andel av skuespillerens oppgjør (097/117, 25.10.2026).
//
// Ren modul, så regnestykket kan prøves for hånd (scripts/test-byraaoppgjoer.mjs).
// Det er dette tallet Pullman spør om først: hva tjener vi, og hvordan ser
// skuespilleren at det stemmer?
//
// 🔑 TO SLAGS ANDEL, ALDRI DOBBELT:
//   per bruk + royalty  byråets PROSENT, brukt ved avregning og frosset der.
//                       Bruk er tusenvis av små hendelser — prosenten ligger på
//                       relasjonen, ikke på hver rad (097).
//   lisenser            byråets andel står PÅ LISENSEN (licence_splits), frosset
//                       da avtalen ble inngått. Prosenten legges ikke på igjen.
//
// 🔑 FROSSET VED AVREGNING. En endret prosent gjelder det som ikke er avregnet
// ennå — aldri det som alt er utbetalt. Derfor bærer hver utbetaling hvor mye
// prosenten ble brukt på (commission_base_nok) og hvor mye lisensandel som ble
// avregnet (licence_agent_nok). Alt «til gode» regnes som opptjent minus det.
//
// 🔑 BRUTTO = NETTO + KUTT, på hver rad og i hver sum.

export const kr = (n: number) => Math.round(n * 100) / 100

/** Alt skuespilleren har tjent, summert over hele historikken. */
export interface Opptjent {
  meterNok: number        // per bruk (voice_usage_events.actor_rate_nok)
  royaltyNok: number      // royalty (royalty_statements.artist_nok)
  licenceFeeNok: number   // lisenshonorar til skuespilleren (licences.fee_actor_nok)
  licenceAgentNok: number // byråets andel av lisensene (licence_splits, agent/actor_fee)
}

/** Alt som er avregnet, summert over utbetalingene. */
export interface Avregnet {
  grossNok: number           // Σ gross_nok
  netNok: number             // Σ amount_nok (det skuespilleren har fått)
  cutNok: number             // Σ agent_cut_nok
  baseNok: number            // Σ commission_base_nok
  licenceAgentNok: number    // Σ licence_agent_nok
}

export interface Til_gode {
  grossNok: number      // brutto til gode, før byråets andel
  baseNok: number       // delen prosenten brukes på (per bruk + royalty)
  licenceGrossNok: number
  commissionNok: number // prosent × grunnlag
  licenceAgentNok: number
  cutNok: number        // byråets andel av det som er til gode
  netNok: number        // det skuespilleren har til gode
  pct: number
}

/**
 * Hva er til gode nå, og hvor mye av det er byråets?
 * pct = byråets prosent (0 uten byrå). Lisensandelen trekkes bare når hun har
 * et byrå i systemet — uten byrå er en manuell agentlinje på lisensen bare
 * informasjon, slik den var før (ingen å betale den til).
 */
export function tilGode(o: Opptjent, a: Avregnet, pct: number, harByraa: boolean): Til_gode {
  const p = harByraa && pct > 0 ? Math.min(100, pct) : 0
  const baseNok = kr(Math.max(0, o.meterNok + o.royaltyNok - a.baseNok))
  const licenceGrossNok = kr(Math.max(0, o.licenceFeeNok - (a.grossNok - a.baseNok)))
  const licenceAgentNok = harByraa ? kr(Math.max(0, o.licenceAgentNok - a.licenceAgentNok)) : 0
  const grossNok = kr(baseNok + licenceGrossNok)
  const commissionNok = kr((baseNok * p) / 100)
  const cutNok = kr(Math.min(grossNok, commissionNok + licenceAgentNok))
  return { grossNok, baseNok, licenceGrossNok, commissionNok, licenceAgentNok, cutNok, netNok: kr(grossNok - cutNok), pct: p }
}

/** Feltene en utbetaling får. Brutto = netto + kutt, eksakt. */
export interface Utbetalingsfelter {
  amount_nok: number
  gross_nok: number
  agent_cut_nok: number
  agent_pct: number | null
  commission_base_nok: number
  licence_agent_nok: number
}

/**
 * Fordeler en utbetaling. beloep = det skuespilleren får (netto). Er det hele
 * beløpet til gode, avregnes alt; er det mindre, avregnes en forholdsmessig
 * del av hvert ledd — og resten står til neste gang.
 * Returnerer null når beløpet er større enn det som er til gode.
 */
export function fordelUtbetaling(t: Til_gode, beloepNetto: number): Utbetalingsfelter | null {
  const netto = kr(beloepNetto)
  if (!(netto > 0) || netto > t.netNok + 0.005) return null
  const hele = Math.abs(netto - t.netNok) <= 0.005
  const f = hele || t.netNok <= 0 ? 1 : netto / t.netNok
  const base = hele ? t.baseNok : kr(t.baseNok * f)
  const lisensByraa = hele ? t.licenceAgentNok : kr(t.licenceAgentNok * f)
  const kutt = hele ? t.cutNok : kr(t.commissionNok * f + lisensByraa)
  return {
    amount_nok: netto,
    gross_nok: kr(netto + kutt),
    agent_cut_nok: kutt,
    agent_pct: t.pct > 0 ? t.pct : null,
    commission_base_nok: base,
    licence_agent_nok: lisensByraa,
  }
}

/** Byråets prosent for én skuespiller: forhandlet sats, ellers byråets standard. */
export function byraaProsent(skuespillerPct: number | null | undefined, byraaStandard: number | null | undefined): number {
  const v = skuespillerPct ?? byraaStandard
  return v != null && Number.isFinite(Number(v)) ? Math.max(0, Math.min(100, Number(v))) : 0
}
