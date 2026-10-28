// Stemmeabonnementet og påmeldingsavgiften (lib/onboardingUtlegg.ts)
// Kjør:  node --experimental-strip-types scripts/test-onboardingutlegg.mjs
import { foreslaattBetaler, kanBetale, utleggStatus, lesBeloep, kreverAvgift, lesDekning } from '../lib/onboardingUtlegg.ts'

let ok = 0, feil = 0
const sjekk = (navn, faktisk, forventet) => {
  const likt = JSON.stringify(faktisk) === JSON.stringify(forventet)
  if (likt) ok++; else { feil++; console.log('FEIL:', navn, '\n  fikk     ', JSON.stringify(faktisk), '\n  forventet', JSON.stringify(forventet)) }
}

// 1. Hvem betaler, ut fra veien inn
sjekk('drop-in betaler selv', foreslaattBetaler(null), 'actor')
sjekk('byrå uten innstilling = TwinLedger', foreslaattBetaler({ id: 'b1' }), 'platform')
sjekk('byrå som dekker selv', foreslaattBetaler({ id: 'b1', covers_onboarding: 'agency' }), 'agency')
sjekk('byrå med TwinLedger', foreslaattBetaler({ id: 'b1', covers_onboarding: 'platform' }), 'platform')
sjekk('ukjent verdi = TwinLedger', foreslaattBetaler({ id: 'b1', covers_onboarding: 'x' }), 'platform')
sjekk('lesDekning tom', lesDekning(null), 'platform')

// 2. Overstyring
sjekk('byrå krever byrå', kanBetale('agency', false), false)
sjekk('byrå med byrå', kanBetale('agency', true), true)
sjekk('TwinLedger for drop-in er lov', kanBetale('platform', false), true)
sjekk('selv med byrå er lov', kanBetale('actor', true), true)

// 3. Status
const r = (payer, refunded_at = null, invoiced_at = null) => ({ payer, refunded_at, invoiced_at })
sjekk('egen kostnad', utleggStatus(r('actor')), 'own_cost')
sjekk('TwinLedger, ikke refundert', utleggStatus(r('platform')), 'to_refund')
sjekk('TwinLedger, refundert', utleggStatus(r('platform', '2026-10-28')), 'refunded')
sjekk('byrå, ikke refundert', utleggStatus(r('agency')), 'to_refund')
sjekk('byrå, refundert = til fakturering', utleggStatus(r('agency', '2026-10-28')), 'to_invoice')
sjekk('byrå, fakturert', utleggStatus(r('agency', '2026-10-28', '2026-11-01')), 'invoiced')

// 4. Beløp
sjekk('heltall', lesBeloep('230'), 230)
sjekk('komma', lesBeloep('229,50'), 229.5)
sjekk('mellomrom', lesBeloep(' 1 230 '), 1230)
sjekk('tomt', lesBeloep(''), null)
sjekk('null', lesBeloep('0'), null)
sjekk('negativt', lesBeloep('-5'), null)
sjekk('tekst', lesBeloep('abc'), null)
sjekk('urimelig stort', lesBeloep('250000'), null)

// 5. Påmeldingsavgiften
const a = (o) => kreverAvgift({ avgiftNok: 49, harByraa: false, vilHaAnsikt: true, status: null, ...o })
sjekk('drop-in med ansikt, ikke betalt', a({}), true)
sjekk('ingen avgift satt', a({ avgiftNok: null }), false)
sjekk('avgift 0', a({ avgiftNok: 0 }), false)
sjekk('byråskuespiller slipper', a({ harByraa: true }), false)
sjekk('bare stemme slipper', a({ vilHaAnsikt: false }), false)
sjekk('betalt', a({ status: 'paid' }), false)
sjekk('fritatt', a({ status: 'waived' }), false)
sjekk('påbegynt teller ikke', a({ status: 'pending' }), true)

console.log(`${ok}/${ok + feil} ok`)
process.exit(feil ? 1 : 0)
