// Sjekker lib/identity.ts uten database. Kjoer: node scripts/test-identity.mjs
// (Transpileres i farta med tsx hvis den finnes, ellers via en enkel import
// av den kompilerte logikken — se bunnen.)
import { vurderIdentitet, cosinus, normaliser, sentroide, SAMME_PERSON_TERSKEL } from '../lib/identity.ts'

let n = 0, feil = 0
const ok = (navn, betingelse) => { n++; if (!betingelse) { feil++; console.log('  ✗', navn) } else console.log('  ✓', navn) }

// Syntetiske «personer»: en basevektor pluss litt stoey per bilde.
const rnd = (seed) => () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280 - 0.5 }
function person(seed, d = 64) { const r = rnd(seed); return normaliser(Array.from({ length: d }, () => r())) }
function bildeAv(base, seed, stoey = 0.15) {
  const r = rnd(seed); return normaliser(base.map((x) => x + r() * stoey))
}
const A = person(1), B = person(2)

console.log('cosinus/normaliser/sentroide')
ok('normalisert vektor har lengde 1', Math.abs(cosinus(A, A) - 1) < 1e-9)
ok('to ulike personer er langt fra hverandre', cosinus(A, B) < SAMME_PERSON_TERSKEL)
ok('sentroiden av like vektorer er vektoren', Math.abs(cosinus(sentroide([A, A, A]), A) - 1) < 1e-9)

console.log('vurderIdentitet')
const alleA = Array.from({ length: 12 }, (_, i) => ({ path: `a${i}.jpg`, embedding: bildeAv(A, 100 + i), faces: 1 }))
let v = vurderIdentitet(alleA)
ok('12 bilder av samme person → ok', v.ok && v.outliers.length === 0 && v.sameCount === 12)
ok('meanSim over terskelen', v.meanSim > SAMME_PERSON_TERSKEL)

const medEnB = [...alleA, { path: 'b0.jpg', embedding: bildeAv(B, 200), faces: 1 }]
v = vurderIdentitet(medEnB)
ok('ett bilde av en annen → nettopp det bildet er avvik', !v.ok && v.outliers.length === 1 && v.outliers[0] === 'b0.jpg')
ok('de tolv ekte teller som samme person', v.sameCount === 12)

const medToB = [...alleA, { path: 'b0.jpg', embedding: bildeAv(B, 200), faces: 1 }, { path: 'b1.jpg', embedding: bildeAv(B, 201), faces: 1 }]
v = vurderIdentitet(medToB)
ok('to bilder av en annen → begge avvik, ingen ekte feilstemplet', v.outliers.length === 2 && v.outliers.every((p) => p.startsWith('b')) && v.sameCount === 12)

const utenAnsikt = [...alleA.slice(0, 5), { path: 'tom.jpg', embedding: null, faces: 0 }]
v = vurderIdentitet(utenAnsikt)
ok('bilde uten ansikt → noFace, ikke ok', !v.ok && v.noFace.includes('tom.jpg') && v.outliers.length === 0)

const flere = [...alleA.slice(0, 5), { path: 'to.jpg', embedding: bildeAv(A, 300), faces: 2 }]
v = vurderIdentitet(flere)
ok('to ansikter i ett bilde → multiFace, men brukbart', v.multiFace.includes('to.jpg') && v.withFace === 6)

v = vurderIdentitet([{ path: 'x.jpg', embedding: bildeAv(A, 1), faces: 1 }])
ok('ett bilde alene → ikke avvik, men «bare ett ansikt»', v.outliers.length === 0 && v.reason && v.reason.includes('ett ansikt'))

v = vurderIdentitet([])
ok('tomt sett → ikke ok, ingen ansikter', !v.ok && v.reason === 'Ingen ansikter funnet')

// Runde 2: uten omregning ville et sterkt avvik dratt sentroiden mot seg.
const skjevt = [...alleA.slice(0, 3), { path: 'b0.jpg', embedding: bildeAv(B, 200, 0.02), faces: 1 }]
v = vurderIdentitet(skjevt)
ok('3 ekte + 1 annen (lite stoey) → den ene er avvik, de tre er inne', v.outliers.length === 1 && v.outliers[0] === 'b0.jpg' && v.sameCount === 3)

console.log(`\n${n - feil} av ${n} ok`)
process.exit(feil ? 1 : 0)
