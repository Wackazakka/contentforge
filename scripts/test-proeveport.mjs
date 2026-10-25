// Kvalitetsporten på prøvebildene (lib/identity.ts, avgjoerProever)
// Kjør:  node --experimental-strip-types scripts/test-proeveport.mjs
import { avgjoerProever, PROEVE_LIKHET_MIN, PROEVE_BILDE_MIN } from '../lib/identity.ts'

let ok = 0, feil = 0
const sjekk = (navn, faktisk, forventet) => {
  const likt = JSON.stringify(faktisk) === JSON.stringify(forventet)
  if (likt) ok++; else { feil++; console.log('FEIL:', navn, '\n  fikk     ', JSON.stringify(faktisk), '\n  forventet', JSON.stringify(forventet)) }
}
const dom = (s) => { const d = avgjoerProever(s); return [d.passed, d.grunn] }

sjekk('kravene', [PROEVE_LIKHET_MIN, PROEVE_BILDE_MIN], [0.8, 0.75])

// Ekte målinger, Lars' leverte bilder som sentroide
sjekk('22.09 Flux 1, godkjent', dom([0.83, 0.84, 0.83]), [true, 'ok'])
sjekk('22.09 Flux 2 x1,5, «ikke bra nok»', dom([0.72, 0.70, 0.71]), [false, 'svakt_bilde'])
sjekk('25.10 egen Flux 1, godkjent', dom([0.85, 0.87, 0.84]), [true, 'ok'])
sjekk('25.10 egen Flux 2, avvist — slapp gjennom den gamle regelen', dom([0.72, 0.77, 0.77]), [false, 'svakt_bilde'])
sjekk('22.09 Flux 2 x1,0', dom([0.36, 0.41, 0.33]), [false, 'svakt_bilde'])

// Kantene
sjekk('ingen bilder', dom([]), [false, 'ingen_bilder'])
sjekk('ett bilde uten ansikt stopper, selv om resten er gode', dom([0.9, 0.9, null]), [false, 'mangler_ansikt'])
sjekk('ingen ansikter', dom([null, null, null]), [false, 'mangler_ansikt'])
sjekk('ett bommet bilde stopper et høyt snitt', dom([0.95, 0.95, 0.7]), [false, 'svakt_bilde'])
sjekk('alle over gulvet, snitt under kravet', dom([0.78, 0.79, 0.79]), [false, 'lavt_snitt'])
sjekk('akkurat på kravene', dom([0.75, 0.85, 0.8]), [true, 'ok'])
sjekk('snittet regnes og rundes', avgjoerProever([0.72, 0.77, 0.77]).mean, 0.753)
sjekk('snitt også når et ansikt mangler', avgjoerProever([0.9, null, 0.8]).mean, 0.85)

console.log(`${ok} ok, ${feil} feil`)
process.exit(feil ? 1 : 0)
