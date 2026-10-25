// Prøver reglene for nivå og vurdering (lib/nivaa.ts, migrasjon 123).
// Kjør: node --experimental-strip-types scripts/test-nivaa.mjs
import {
  lesNivaa, kanTrenes, prisFaktor, standardGodkjenning, paameldingsFelter,
  erNivaa, erVurdering, GALLERI_REKKEFOLGE,
} from '../lib/nivaa.ts'

let ok = 0, feil = 0
const sjekk = (navn, faktisk, ventet) => {
  const likt = JSON.stringify(faktisk) === JSON.stringify(ventet)
  if (likt) ok++
  else { feil++; console.log(`✗ ${navn}: fikk ${JSON.stringify(faktisk)}, ventet ${JSON.stringify(ventet)}`) }
}

// Nivået leses forsiktig: ukjent eller tomt er et nytt ansikt, aldri et kjent navn.
sjekk('ukjent nivå = new', lesNivaa('superstar'), 'new')
sjekk('tomt nivå = new', lesNivaa(null), 'new')
sjekk('star leses', lesNivaa('star'), 'star')
sjekk('erNivaa pro', erNivaa('pro'), true)
sjekk('erNivaa tull', erNivaa('admin'), false)
sjekk('erVurdering declined', erVurdering('declined'), true)
sjekk('erVurdering tull', erVurdering('yes'), false)

// Trening bare når påmeldingen er godtatt.
sjekk('trening: accepted', kanTrenes('accepted'), true)
sjekk('trening: pending', kanTrenes('pending'), false)
sjekk('trening: declined', kanTrenes('declined'), false)
sjekk('trening: mangler', kanTrenes(undefined), false)

// Prisforslaget: nye ansikter halv sats; ukjent faller til nytt ansikt.
sjekk('pris new', prisFaktor('new'), 0.5)
sjekk('pris pro', prisFaktor('pro'), 1)
sjekk('pris star', prisFaktor('star'), 1)
sjekk('pris ukjent', prisFaktor('x'), 0.5)

// Godkjenning per leveranse som standard: bare kjente navn.
sjekk('godkjenning star', standardGodkjenning('star'), 'review')
sjekk('godkjenning pro', standardGodkjenning('pro'), 'auto')
sjekk('godkjenning new', standardGodkjenning('new'), 'auto')

// Påmeldingen: byrålenken gir pro og godtatt; ellers nytt ansikt som venter.
const naa = '2026-10-25T12:00:00.000Z'
sjekk('påmelding uten byrå', paameldingsFelter(null, naa),
  { tier: 'new', intake_status: 'pending', intake_decided_at: null, intake_decided_by: null })
sjekk('påmelding via byrå', paameldingsFelter({ agentId: 'a1' }, naa),
  { tier: 'pro', intake_status: 'accepted', intake_decided_at: naa, intake_decided_by: 'agent:a1' })
sjekk('påmelding gir aldri star', [paameldingsFelter(null).tier, paameldingsFelter({ agentId: 'x' }).tier].includes('star'), false)

// Galleriet: kjente navn først.
sjekk('galleriets rekkefølge', [...GALLERI_REKKEFOLGE], ['star', 'pro', 'new'])

console.log(`${ok}/${ok + feil} sjekker ok`)
if (feil) process.exit(1)
