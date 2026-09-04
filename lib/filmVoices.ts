import { VOICES } from '@/lib/voices'

// Stemmene i den enkle filmflyten (Lars 4/9): to herrestemmer og to
// damestemmer, alle norske ElevenLabs-stemmer fra hovedlista. Brukes naar
// kunden ikke har en sang og velger «Les opp teksten». Id-ene valideres
// server-side mot denne lista — klienten kan ikke sende inn hva som helst.

export interface FilmVoice { id: string; name: string; desc: string; preview?: string }

const PICK: Array<{ id: string; desc: string }> = [
  { id: 'nhvaqgRyAq6BmFs3WcdX', desc: 'Dyp og rolig' },       // Øyvind
  { id: 's2xtA7B2CTXPPlJzch1v', desc: 'Klar og behagelig' },  // Dennis
  { id: 'uNsWM1StCcpydKYOjKyu', desc: 'Varm og vennlig' },    // Mia
  { id: 'BGEU6wFi2uNm6Kje1Yhk', desc: 'Nordisk og tydelig' }, // Maja
]

export const FILM_VOICES: FilmVoice[] = PICK.map((p) => {
  const v = VOICES.find((x) => x.id === p.id)
  return { id: p.id, name: v?.name || p.id, desc: p.desc, preview: v?.preview }
})

export function isFilmVoice(id: string | null | undefined): boolean {
  return !!id && FILM_VOICES.some((v) => v.id === id)
}

// Delt musikkmappe paa dropleten for anledningsfilmene (ReelHome-sporene
// inntil skreddersydd musikk finnes, Lars 4/9).
export const FILM_LIBRARY_FOLDER = 'celebration'
