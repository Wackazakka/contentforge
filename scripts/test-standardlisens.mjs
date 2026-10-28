// Standardlisens (lib/standardLisens.ts)
// Kjør:  node --experimental-strip-types scripts/test-standardlisens.mjs
import { lesVilkaar, standardHinder, aktoerHinder, kjentVilkaarTekst, STANDARD_VILKAAR_TEKST, STANDARD_FORSLAG } from '../lib/standardLisens.ts'

let ok = 0, feil = 0
const sjekk = (navn, faktisk, forventet) => {
  const likt = JSON.stringify(faktisk) === JSON.stringify(forventet)
  if (likt) ok++; else { feil++; console.log('FEIL:', navn, '\n  fikk     ', JSON.stringify(faktisk), '\n  forventet', JSON.stringify(forventet)) }
}

// 1. Vilkårene renses
sjekk('tomt = av, ingenting forhåndsgodkjent', lesVilkaar(null), { enabled: false, assets: [], media: [], territories: [], maxTermMonths: 12 })
sjekk('ukjente verdier faller bort', lesVilkaar({ enabled: true, assets: ['voice', 'smell'], media: ['online', 'tv'], territories: ['no', 'mars'], max_term_months: 3 }),
  { enabled: true, assets: ['voice'], media: ['online'], territories: ['no'], maxTermMonths: 3 })
sjekk('ukjent periode = 12', lesVilkaar({ maxTermMonths: 24 }).maxTermMonths, 12)
sjekk('forslaget er av', STANDARD_FORSLAG.enabled, false)

// 2. Skuespilleren
const a = (o = {}) => ({ tier: 'pro', isActive: true, isDemo: false, intakeStatus: 'accepted', ...o })
sjekk('vanlig skuespiller', aktoerHinder(a()), null)
sjekk('kjent navn', aktoerHinder(a({ tier: 'star' })), 'Kjente navn lisensieres alltid etter avtale.')
sjekk('testprofil', aktoerHinder(a({ isDemo: true })), 'Testprofiler kan ikke lisensieres.')
sjekk('ikke godtatt', aktoerHinder(a({ intakeStatus: 'pending' })), 'Påmeldingen er ikke godtatt ennå.')
sjekk('ikke aktiv', aktoerHinder(a({ isActive: false })), 'Rettighetshaveren er ikke aktiv.')

// 3. Valget mot vilkårene
const v = { ...STANDARD_FORSLAG, enabled: true }
const valg = (o = {}) => ({ kind: 'campaign', asset: 'voice', mediaClass: 'online', territory: 'no', termMonths: 3, exclusivity: 'none', ...o })
sjekk('innenfor', standardHinder(v, valg(), a()), null)
sjekk('12 mnd innenfor', standardHinder(v, valg({ termMonths: 12 }), a()), null)
sjekk('av', standardHinder({ ...v, enabled: false }, valg(), a()), 'Rettighetshaveren har ikke slått på standardlisens.')
sjekk('ingen vilkår', standardHinder(null, valg(), a()), 'Rettighetshaveren har ikke slått på standardlisens.')
sjekk('verk', standardHinder(v, valg({ kind: 'work' }), a()), 'Film, serie, spill og lydbok avtales alltid.')
sjekk('eksklusivitet', standardHinder(v, valg({ exclusivity: 'category' }), a()), 'Eksklusivitet avtales alltid.')
sjekk('uten sluttdato', standardHinder(v, valg({ termMonths: 0 }), a()), 'Lisens uten sluttdato avtales alltid.')
sjekk('for lang', standardHinder({ ...v, maxTermMonths: 3 }, valg({ termMonths: 12 }), a()), 'Standardlisensen gjelder opptil 3 måneder.')
sjekk('kringkasting ikke valgt', standardHinder(v, valg({ mediaClass: 'broadcast' }), a()), 'Standardlisensen dekker ikke dette mediet.')
sjekk('verden ikke valgt', standardHinder(v, valg({ territory: 'world' }), a()), 'Standardlisensen dekker ikke dette området.')
sjekk('ansikt ikke valgt', standardHinder({ ...v, assets: ['voice'] }, valg({ asset: 'face' }), a()), 'Standardlisensen dekker ikke dette (stemme, ansikt eller begge).')
sjekk('kjent navn går foran alt', standardHinder(v, valg(), a({ tier: 'star' })), 'Kjente navn lisensieres alltid etter avtale.')
sjekk('kringkasting når slått på', standardHinder({ ...v, media: ['online', 'broadcast'] }, valg({ mediaClass: 'broadcast' }), a()), null)

// 4. Vilkårsteksten
sjekk('norsk kjent', kjentVilkaarTekst(STANDARD_VILKAAR_TEKST.no), STANDARD_VILKAAR_TEKST.no)
sjekk('engelsk kjent', kjentVilkaarTekst(STANDARD_VILKAAR_TEKST.en), STANDARD_VILKAAR_TEKST.en)
sjekk('ukjent avvist', kjentVilkaarTekst('jeg lover å være snill'), null)

console.log(`${ok}/${ok + feil} ok`)
process.exit(feil ? 1 : 0)
