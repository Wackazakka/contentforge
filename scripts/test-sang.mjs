// Sangere og sangmodeller (lib/sang.ts, lib/rvc.ts sin skjematilpasning)
// Kjør:  node --experimental-strip-types scripts/test-sang.mjs
import { lesArtistType, lovligeKilder, erklaeringFor, sangHinder, kanAktiveres, datasettNavn, merking,
  SANG_ERKLAERING_EGEN, SANG_ERKLAERING_GENERERT, SANG_ERKLAERING_SESJON,
  lesSangPaamelding, radFelter, VIRTUELLE_ERKLAERINGER } from '../lib/sang.ts'
import { tilpassInndata } from '../lib/rvc.ts'

let ok = 0, feil = 0
const sjekk = (navn, faktisk, forventet) => {
  const likt = JSON.stringify(faktisk) === JSON.stringify(forventet)
  if (likt) ok++; else { feil++; console.log('FEIL:', navn, '\n  fikk     ', JSON.stringify(faktisk), '\n  forventet', JSON.stringify(forventet)) }
}

// 1. Artisttype
sjekk('tomt = menneske', lesArtistType(null), 'human')
sjekk('virtuell', lesArtistType('virtual'), 'virtual')
sjekk('ukjent = menneske', lesArtistType('robot'), 'human')

// 2. Kilder og erklæringer
sjekk('menneske: bare egne opptak', lovligeKilder('human'), ['recorded'])
sjekk('virtuell: generert eller sunget', lovligeKilder('virtual'), ['generated', 'recorded'])
sjekk('erklæring egen', erklaeringFor('human', 'recorded'), SANG_ERKLAERING_EGEN)
sjekk('erklæring generert', erklaeringFor('virtual', 'generated'), SANG_ERKLAERING_GENERERT)
sjekk('erklæring sesjonssanger', erklaeringFor('virtual', 'recorded'), SANG_ERKLAERING_SESJON)

// 3. Hinder for trening
const h = (o) => sangHinder({ vurdering: 'accepted', type: 'human', kilde: 'recorded', kildeNotat: null, virtueltErklaert: false, ...o })
sjekk('menneske med egne opptak', h({}), null)
sjekk('ikke vurdert', h({ vurdering: 'pending' })?.startsWith('Påmeldingen'), true)
sjekk('menneske fra generert', h({ kilde: 'generated', kildeNotat: 'Suno' }), 'Et menneske kan bare klones fra sine egne opptak.')
sjekk('ingen kilde', h({ kilde: null }), 'Velg hvor opptakene kommer fra.')
sjekk('virtuell uten erklæring', h({ type: 'virtual', kilde: 'generated', kildeNotat: 'Suno' })?.includes('erklæringen'), true)
sjekk('virtuell generert uten verktøy', h({ type: 'virtual', kilde: 'generated', virtueltErklaert: true })?.includes('verktøy'), true)
sjekk('virtuell generert ok', h({ type: 'virtual', kilde: 'generated', kildeNotat: 'Suno v5.5', virtueltErklaert: true }), null)
sjekk('virtuell sunget uten navn', h({ type: 'virtual', kilde: 'recorded', virtueltErklaert: true })?.includes('navngitt'), true)
sjekk('virtuell sunget med navn', h({ type: 'virtual', kilde: 'recorded', kildeNotat: 'Kari Nordmann', virtueltErklaert: true }), null)

// 4. Aktivering
sjekk('ferdig og godkjent', kanAktiveres({ status: 'ready', approval_status: 'approved' }), true)
sjekk('ferdig, ikke godkjent', kanAktiveres({ status: 'ready', approval_status: 'pending' }), false)
sjekk('avvist', kanAktiveres({ status: 'ready', approval_status: 'rejected' }), false)
sjekk('trener', kanAktiveres({ status: 'training', approval_status: 'approved' }), false)

// 5. Mappenavn og merking
sjekk('æøå', datasettNavn('Åse Bjørnstad Ærø'), 'ase_bjornstad_aero')
sjekk('tegn', datasettNavn('  !!Nova_X 2026!! '), 'nova_x_2026')
sjekk('tomt', datasettNavn('***'), 'sanger')
sjekk('merking virtuell', merking('virtual'), 'Virtuell artist')
sjekk('merking menneske', merking('human'), '')

// 6. Skjematilpasning mot Replicate
const skjema = {
  properties: { song_input: { type: 'string' }, rvc_model: { type: 'string' }, pitch_change: { allOf: [{ $ref: '#/components/schemas/pitch_change' }] }, index_rate: { type: 'number' } },
  enums: { pitch_change: ['no-change', 'male-to-female', 'female-to-male'] },
}
sjekk('ukjente felt faller bort', tilpassInndata(skjema, { song_input: 'u', ukjent: 1, index_rate: 0.5 }), { song_input: 'u', index_rate: 0.5 })
sjekk('lovlig valg beholdes', tilpassInndata(skjema, { pitch_change: 'no-change' }), { pitch_change: 'no-change' })
sjekk('ulovlig valg faller bort', tilpassInndata(skjema, { pitch_change: 0 }), {})
sjekk('undefined faller bort', tilpassInndata(skjema, { song_input: undefined }), {})

// 7. Påmeldingen
const naa = '2026-10-28T10:00:00.000Z'
sjekk('menneske uten sang: ingen nye felt', lesSangPaamelding({}, naa).felter, {})
sjekk('menneske som synger', lesSangPaamelding({ offersSinging: true }, naa).felter, { offers_singing: true })
sjekk('virtuell uten erklæring', lesSangPaamelding({ artistKind: 'virtual', offersSinging: true }, naa).feil?.includes('erklæringen'), true)
sjekk('virtuell med ukjent tekst', lesSangPaamelding({ artistKind: 'virtual', virtualDeclared: true, virtualDeclarationText: 'jeg lover' }, naa).feil?.includes('erklæringen'), true)
const v = lesSangPaamelding({ artistKind: 'virtual', offersSinging: true, virtualDeclared: true, virtualDeclarationText: VIRTUELLE_ERKLAERINGER.en }, naa)
sjekk('virtuell på engelsk fryses på engelsk', v.felter, { offers_singing: true, artist_kind: 'virtual', virtual_declaration: VIRTUELLE_ERKLAERINGER.en, virtual_declared_at: naa })
sjekk('virtuell tilbyr ikke tale', v.tvingIngenTale, true)
sjekk('fra metadata: ukjent tekst blir den norske', radFelter({ artistType: 'virtual', tilbyrSang: false, naa, erklaering: 'tull' }).virtual_declaration, VIRTUELLE_ERKLAERINGER.no)

console.log(`${ok}/${ok + feil} ok`)
process.exit(feil ? 1 : 0)
