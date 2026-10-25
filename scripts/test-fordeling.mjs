// Fordelingen i en lisens etter takstkortet (25.10.2026): TwinLedger klarerer,
// men selger ikke. Kjør: node --experimental-strip-types scripts/test-fordeling.mjs
import { registerHooks } from 'node:module'
import { pathToFileURL } from 'node:url'

// lib/licenceMath importerer '@/lib/rateCard' (Next-alias). Her løses aliaset
// til fila selv, så regnereglene kan prøves uten Next.
registerHooks({
  resolve(spec, ctx, next) {
    if (spec.startsWith('@/')) return next(pathToFileURL(`${process.cwd()}/${spec.slice(2)}.ts`).href, ctx)
    return next(spec, ctx)
  },
})
const { STANDARD_RATE_CARD, mergeRateCard, foreslaattHonorar } = await import('../lib/rateCard.ts')
const { beregnFordeling } = await import('../lib/licenceMath.ts')

let ok = 0, feil = 0
const sjekk = (navn, faktisk, ventet) => {
  const likt = JSON.stringify(faktisk) === JSON.stringify(ventet)
  if (likt) ok++
  else { feil++; console.log(`✗ ${navn}: fikk ${JSON.stringify(faktisk)}, ventet ${JSON.stringify(ventet)}`) }
}
const parter = (card, agentPct) => [
  { party_type: 'platform', party_label: 'Klareringsavgift (TwinLedger)', basis: 'customer_fee', pct: card.clearingPct },
  { party_type: 'agency', party_tenant_id: 't1', party_label: 'Selgende ledd (rest)', basis: 'customer_fee', pct: null },
  ...(agentPct ? [{ party_type: 'agent', party_label: 'Agent / manager', basis: 'actor_fee', pct: agentPct }] : []),
]
const beloep = (f, type) => f.rader.filter((r) => r.party_type === type).map((r) => r.amount_nok)

// Standardkortet: 10 % klarering, 90 % til rettighetshaveren, ingen rest.
const kort = STANDARD_RATE_CARD
sjekk('klareringsavgift 10 %', kort.clearingPct, 10)
sjekk('honorar 90 %', kort.rightsHolderPct, 90)
sjekk('foreslått honorar av 10 000', foreslaattHonorar(kort, 10000), 9000)

let f = beregnFordeling(10000, foreslaattHonorar(kort, 10000), parter(kort))
sjekk('rettighetshaver 9 000', beloep(f, 'rights_holder'), [9000])
sjekk('TwinLedger 1 000', beloep(f, 'platform'), [1000])
sjekk('selgende ledd 0', beloep(f, 'agency'), [0])
sjekk('ikke overtrukket', f.overtrekk, false)

// Agenten tar av honoraret, ikke av kundeprisen.
f = beregnFordeling(10000, 9000, parter(kort, 20))
sjekk('agent 20 % av honoraret', beloep(f, 'agent'), [1800])
sjekk('rettighetshaver netto', f.actorNetNok, 7200)
sjekk('TwinLedger uendret med agent', beloep(f, 'platform'), [1000])

// Nedforhandlet honorar: differansen står som egen post, ikke skjult.
f = beregnFordeling(10000, 8000, parter(kort))
sjekk('rest til selgende ledd', beloep(f, 'agency'), [1000])

// Honorar over det kundeprisen dekker: flagges.
f = beregnFordeling(10000, 9500, parter(kort))
sjekk('overtrekk flagges', f.overtrekk, true)

// Et ledd som bare endrer avgiften, får honoraret med seg.
const k12 = mergeRateCard({ clearingPct: 12 })
sjekk('egen avgift 12 %', [k12.clearingPct, k12.rightsHolderPct], [12, 88])
// Et ledd som setter honoraret selv, beholder det — resten blir dets margin.
const k55 = mergeRateCard({ rightsHolderPct: 55 })
sjekk('eget honorar 55 %', [k55.clearingPct, k55.rightsHolderPct], [10, 55])
f = beregnFordeling(10000, foreslaattHonorar(k55, 10000), parter(k55))
sjekk('margin til leddet som selger', beloep(f, 'agency'), [3500])
// Et gammelt platformPct i et lagret kort leses ikke som klareringsavgift.
const gammel = mergeRateCard({ platformPct: 3 })
sjekk('gammelt platformPct ignoreres', [gammel.clearingPct, gammel.rightsHolderPct], [10, 90])

console.log(`${ok}/${ok + feil} sjekker ok`)
if (feil) process.exit(1)
