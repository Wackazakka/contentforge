// Regelen for tvillingversjoner (migrasjon 112): når dekker en lisens en bruk?
// Kjør:  node --experimental-strip-types scripts/test-versjoner.mjs
import { komponentAv, versjonForModell, lisensDekkerModell, skillPaaVersjon, modellForLisens } from '../lib/twinVersions.ts'

let ok = 0, feil = 0
const sjekk = (navn, faktisk, forventet) => {
  const likt = JSON.stringify(faktisk) === JSON.stringify(forventet)
  if (likt) ok++; else { feil++; console.log('FEIL:', navn, '\n  fikk     ', JSON.stringify(faktisk), '\n  forventet', JSON.stringify(forventet)) }
}

// Historikk: v1 ansikt A + stemme X · v2 bare stemmen byttet (Y) · v3 ansiktet byttet (B)
const V = [
  { actor_id: 'a', version: 1, face_character_id: 'A', elevenlabs_voice_id: 'X' },
  { actor_id: 'a', version: 2, face_character_id: 'A', elevenlabs_voice_id: 'Y' },
  { actor_id: 'a', version: 3, face_character_id: 'B', elevenlabs_voice_id: 'Y' },
]

sjekk('komponent ansikt', komponentAv(V[0], 'face'), 'A')
sjekk('komponent stemme', komponentAv(V[1], 'voice'), 'Y')
sjekk('tom komponent er null', komponentAv({ actor_id: 'a', version: 9, face_character_id: '  ', elevenlabs_voice_id: null }, 'face'), null)

sjekk('ansikt A brukt → nyeste versjon med A (v2)', versjonForModell(V, 'face', 'A'), 2)
sjekk('ansikt B brukt → v3', versjonForModell(V, 'face', 'B'), 3)
sjekk('stemme X brukt → v1', versjonForModell(V, 'voice', 'X'), 1)
sjekk('ukjent modell → null', versjonForModell(V, 'face', 'Z'), null)

// Kjernen: en ny versjon utvider ikke gammel tillatelse
sjekk('ansiktslisens v1 dekker ansikt A', lisensDekkerModell(V, 1, 'face', 'A'), true)
sjekk('ansiktslisens v1 dekker IKKE nytt ansikt B', lisensDekkerModell(V, 1, 'face', 'B'), false)
sjekk('ansiktslisens v1 dekker fortsatt A etter at bare stemmen ble byttet (v2)', lisensDekkerModell(V, 2, 'face', 'A'), true)
sjekk('stemmelisens v1 dekker IKKE ny stemme Y', lisensDekkerModell(V, 1, 'voice', 'Y'), false)
sjekk('stemmelisens v2 dekker Y også i v3 (bare ansiktet byttet)', lisensDekkerModell(V, 2, 'voice', 'Y'), true)
sjekk('lisens uten versjon dekker ingenting', lisensDekkerModell(V, null, 'face', 'A'), false)
sjekk('lisens festet til versjon som ikke finnes', lisensDekkerModell(V, 7, 'face', 'A'), false)
sjekk('ukjent modell → regelen kan ikke anvendes (dekker)', lisensDekkerModell(V, 1, 'face', null), true)

const rader = [{ id: 'l1', twin_version: 1 }, { id: 'l3', twin_version: 3 }]
sjekk('skill: ansikt B → bare v3-lisensen', skillPaaVersjon(rader, V, 'face', 'B'), { dekket: [{ id: 'l3', twin_version: 3 }], annenVersjon: [{ id: 'l1', twin_version: 1 }] })
sjekk('skill: ansikt A → bare v1-lisensen', skillPaaVersjon(rader, V, 'face', 'A').dekket.map((r) => r.id), ['l1'])

// Generering: kunden får det den klarerte
sjekk('lisens v1 → generer med ansikt A selv om B er gjeldende', modellForLisens(V, 1, 'face', 'B'), { modell: 'A', versjon: 1, festet: true })
sjekk('ingen lisens → gjeldende modell og dens versjon', modellForLisens(V, null, 'face', 'B'), { modell: 'B', versjon: 3, festet: false })
sjekk('lisensens versjon mangler komponenten → gjeldende', modellForLisens(
  [{ actor_id: 'a', version: 1, face_character_id: null, elevenlabs_voice_id: 'X' }, ...V.slice(1)], 1, 'face', 'B'), { modell: 'B', versjon: 3, festet: false })

console.log(`${ok}/${ok + feil} sjekker ok`)
process.exit(feil ? 1 : 0)
