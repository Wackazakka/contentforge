import { kr } from '@/lib/rateCard'

// Fordelingsmatematikken, skilt ut som REN funksjon uten database.
// Grunnen: dette er stedet der feil koster ekte penger for et menneske som
// ikke sitter i rommet når avtalen forhandles — da skal den kunne kjøres og
// etterprøves uten å røre prod.

export type SplitBasis = 'customer_fee' | 'actor_fee'
export type PartyType = 'rights_holder' | 'agent' | 'agency' | 'platform' | 'other'

export interface SplitSpec {
  party_type: PartyType
  party_tenant_id?: string | null
  party_label?: string | null
  basis: SplitBasis
  /** Avtalt sats. Null når beløpet er satt direkte. */
  pct?: number | null
  /** Eksplisitt kronebeløp — overstyrer pct. */
  amount_nok?: number | null
}

export interface SplitRad extends SplitSpec {
  amount_nok: number
}

export interface Fordeling {
  rader: SplitRad[]
  /** Til rettighetshaveren NETTO, etter agent/manager. */
  actorNetNok: number
  /** Det som blir igjen til den som har avtalen. */
  agencyNok: number
  /** Kundeprisen dekker ikke det som er lovet bort. */
  overtrekk: boolean
}

/**
 * Gjelder lisensen på denne datoen? Alle tre som ISO-datoer (YYYY-MM-DD), som
 * sammenlignes leksikalsk — riktig for det formatet, og uten tidssone-feller.
 *
 * null i en ende = ingen grense (evigvarende verk, eller kampanje-buyout).
 *
 * 🔑 Grensene er INKLUSIVE: en lisens som utløper i dag gjelder fortsatt i
 * dag. Den motsatte tolkningen ville gjort siste døgn av hver avtale til en
 * stille klareringsbrist.
 */
export function dekkerPerioden(start: string | null, slutt: string | null, dag: string): boolean {
  if (start && start > dag) return false
  if (slutt && slutt < dag) return false
  return true
}

/**
 * 🔑 TO BEREGNINGSGRUNNLAG (Lars 20.09.2026).
 *
 * Kutt av KUNDEPRISEN — infrastrukturavgift, byråets margin.
 * Kutt av HONORARET — agent- og managerprovisjon.
 *
 * Forhandles honoraret ned, faller alt i den andre gruppen forholdsmessig.
 * Det er hele grunnen til at `basis` finnes, og til at fordelingen regnes om
 * i sin helhet hver gang et av de to beløpene endres.
 *
 * Rekkefølgen er bevisst:
 *   1) rettighetshaveren får feeActorNok brutto (det ER honoraret)
 *   2) prosentkutt av kundeprisen
 *   3) byrået får RESTEN av kundeprisen
 *   4) prosentkutt av honoraret, som trekkes fra rettighetshaverens netto
 *
 * ⚠️ Konsekvensen av (3), som bør være synlig i UI: forhandles honoraret ned
 * uten at kundeprisen faller, øker byråets andel tilsvarende. Det er ikke en
 * feil — men det er ikke en besparelse for kunden heller.
 */
export function beregnFordeling(feeCustomerNok: number, feeActorNok: number, parter: SplitSpec[]): Fordeling {
  const rader: SplitRad[] = []

  const beloep = (s: SplitSpec, grunnlag: number): number =>
    s.amount_nok != null ? kr(s.amount_nok) : kr((grunnlag * Number(s.pct ?? 0)) / 100)

  rader.push({
    party_type: 'rights_holder',
    party_tenant_id: null,
    party_label: null,
    basis: 'customer_fee',
    pct: feeCustomerNok > 0 ? kr((feeActorNok / feeCustomerNok) * 100) : null,
    amount_nok: kr(feeActorNok),
  })

  for (const s of parter) {
    if (s.basis !== 'customer_fee') continue
    if (s.party_type === 'rights_holder' || s.party_type === 'agency') continue
    rader.push({ ...s, amount_nok: beloep(s, feeCustomerNok) })
  }

  const brukt = rader.reduce((sum, r) => sum + r.amount_nok, 0)
  const byraa = parter.find((s) => s.party_type === 'agency')
  const restNok = kr(feeCustomerNok - brukt)
  rader.push({
    party_type: 'agency',
    party_tenant_id: byraa?.party_tenant_id ?? null,
    party_label: byraa?.party_label ?? null,
    basis: 'customer_fee',
    pct: feeCustomerNok > 0 ? kr((restNok / feeCustomerNok) * 100) : null,
    amount_nok: restNok,
  })

  let avHonorar = 0
  for (const s of parter) {
    if (s.basis !== 'actor_fee') continue
    const a = beloep(s, feeActorNok)
    avHonorar += a
    rader.push({ ...s, amount_nok: a })
  }

  return {
    rader,
    actorNetNok: kr(feeActorNok - avHonorar),
    agencyNok: restNok,
    overtrekk: restNok < 0,
  }
}
