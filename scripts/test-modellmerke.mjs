// Merket i «Medvirkende» (lib/modellMerke.ts)
// Kjør:  node --experimental-strip-types scripts/test-modellmerke.mjs
import { modellMerke } from '../lib/modellMerke.ts'

let ok = 0, feil = 0
const sjekk = (navn, faktisk, forventet) => {
  const likt = JSON.stringify(faktisk) === JSON.stringify(forventet)
  if (likt) ok++; else { feil++; console.log('FEIL:', navn, '\n  fikk     ', JSON.stringify(faktisk), '\n  forventet', JSON.stringify(forventet)) }
}
const t = (r) => modellMerke(r).tekst
const naa = '2026-10-25T09:00:00Z'

// Lars' fem rader på skjermbildet 25.10
sjekk('egen Flux 2, avvist i e-posten', t({ status: 'ready', approval_status: 'rejected', approval_sent_at: naa, withdrawn_at: naa }), '✗ Avvist')
sjekk('egen Flux 1, e-post sendt, ikke svart', t({ status: 'ready', approval_status: 'pending', approval_sent_at: naa }), '⏳ Venter på svar')
sjekk('Flux 2 22.09, avvist', t({ status: 'ready', approval_status: 'rejected', withdrawn_at: naa }), '✗ Avvist')
sjekk('Flux 2 22.09, fal 422', t({ status: 'failed', approval_status: 'pending' }), '✗ Feilet')
sjekk('Flux 1 22.09, godkjent', t({ status: 'ready', approval_status: 'approved', approval_sent_at: naa }), '✓ Godkjent')

// Resten av tilstandene
sjekk('trener', t({ status: 'training', approval_status: 'pending' }), '⏳ Trener…')
sjekk('ferdig, prøvebilder/port i gang', t({ status: 'ready', approval_status: 'pending', approval_sent_at: null }), '⏳ Sjekkes')
sjekk('godkjent og senere trukket tilbake', t({ status: 'ready', approval_status: 'approved', withdrawn_at: naa }), '⛔ Stengt')
sjekk('ingen godkjenning kreves', t({ status: 'ready', approval_status: 'not_required' }), '✓ Klar')
sjekk('eldre rad uten feltet', t({ status: 'ready' }), '✓ Klar')
sjekk('feilet går foran avvist', t({ status: 'failed', approval_status: 'rejected' }), '✗ Feilet')
sjekk('tone: avvist er stopp', modellMerke({ status: 'ready', approval_status: 'rejected' }).tone, 'stopp')
sjekk('tone: venter er venter', modellMerke({ status: 'ready', approval_status: 'pending', approval_sent_at: naa }).tone, 'venter')
sjekk('tone: godkjent er ok', modellMerke({ status: 'ready', approval_status: 'approved' }).tone, 'ok')

console.log(`${ok} ok, ${feil} feil`)
process.exit(feil ? 1 : 0)
