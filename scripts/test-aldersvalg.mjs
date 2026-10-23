// Valget av aldersmodell for en ønsket alder (lib/aldersvalg.ts).
// Kjør:  node --experimental-strip-types scripts/test-aldersvalg.mjs
import { dekkerAlder, velgForAlder, spennTekst, lesAlder } from '../lib/aldersvalg.ts'

let ok = 0, feil = 0
const sjekk = (navn, faktisk, forventet) => {
  const likt = JSON.stringify(faktisk) === JSON.stringify(forventet)
  if (likt) ok++; else { feil++; console.log('FEIL:', navn, '\n  fikk     ', JSON.stringify(faktisk), '\n  forventet', JSON.stringify(forventet)) }
}
const m = (id, ageFrom, ageTo) => ({ id, actorId: 'a', characterId: 'c' + id, label: id, ageFrom, ageTo })
const M = [m('tjue', 20, 29), m('tretti', 30, 39), m('tidlig30', 30, 33), m('femti+', 50, null)]

sjekk('30 dekkes av 30–39', dekkerAlder(M[1], 30), true)
sjekk('39 dekkes av 30–39 (begge ender med)', dekkerAlder(M[1], 39), true)
sjekk('40 dekkes ikke av 30–39', dekkerAlder(M[1], 40), false)
sjekk('åpen øvre ende: 80 dekkes av 50+', dekkerAlder(M[3], 80), true)
sjekk('uten spenn kan ikke velges på alder', dekkerAlder(m('x', null, null), 30), false)

sjekk('31: det smaleste spennet vinner (30–33 foran 30–39)', velgForAlder(M, 31)?.id, 'tidlig30')
sjekk('36: bare 30–39 dekker', velgForAlder(M, 36)?.id, 'tretti')
sjekk('25 → 20–29', velgForAlder(M, 25)?.id, 'tjue')
sjekk('45: ingen dekker → null, ikke nærmeste', velgForAlder(M, 45), null)
sjekk('70 → 50+', velgForAlder(M, 70)?.id, 'femti+')
sjekk('tom liste → null', velgForAlder([], 30), null)

sjekk('spenn 30–39', spennTekst(M[1]), '30–39')
sjekk('spenn 50+', spennTekst(M[3]), '50+')
sjekk('spenn –25', spennTekst(m('y', null, 25)), '–25')
sjekk('spenn ett år', spennTekst(m('z', 30, 30)), '30')

sjekk('alder ikke oppgitt', lesAlder(undefined), undefined)
sjekk('alder tom streng', lesAlder(''), undefined)
sjekk('alder «30»', lesAlder('30'), 30)
sjekk('alder 30.5 er ugyldig', lesAlder(30.5), null)
sjekk('alder 200 er ugyldig', lesAlder(200), null)
sjekk('alder «tretti» er ugyldig', lesAlder('tretti'), null)

console.log(`${ok}/${ok + feil} sjekker ok`)
process.exit(feil ? 1 : 0)
