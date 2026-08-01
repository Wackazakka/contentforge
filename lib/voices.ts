// Delt stemmeliste (trukket ut av draft-editoren 31/7 da segmentside V2 kom til
// — samme kilde til begge sidene, ellers driver de fra hverandre).
// ⚠️ «Helge» og «Terje» er LÅNTE bibliotekstemmer, ikke våre egne kloner.
export interface VoiceOption {
  id: string
  name: string
  desc: string
  preview: string
}

export const VOICES: VoiceOption[] = [
  { id: 'buLDb121bbD0rdxWw26y', name: 'Adam', desc: 'Reforhandle-verten (karakter-stemme)', preview: 'https://api.us.elevenlabs.io/v1/voices/buLDb121bbD0rdxWw26y/previews/audio?payload=eyJ2b2ljZV9zb3VyY2UiOiJjdXN0b20iLCJ3b3Jrc3BhY2VfaWQiOiJhODM3MTU4Y2UzYzM0MjQyODdjODhlYTg4ZDMxZDVjMSIsImZpbGVuYW1lIjoiZTdhYWNlNjQtNGU5OC00NTM3LTg5YTEtOTc4MTAwOGNiYTU5Lm1wMyIsInRpbWVzdGFtcCI6MTc4NTE0NjQwMDAwMDAwMH0%3D' },
  { id: 'nhvaqgRyAq6BmFs3WcdX', name: 'Øyvind', desc: 'Dyp og rolig', preview: 'https://storage.googleapis.com/eleven-public-prod/database/workspace/7dc5c03caf8f40daa575fa9eacbf3de8/voices/nhvaqgRyAq6BmFs3WcdX/Z8yVliHOyn9eSmt4YEVw.mp3' },
  { id: 's2xtA7B2CTXPPlJzch1v', name: 'Dennis', desc: 'Klar og behagelig', preview: 'https://storage.googleapis.com/eleven-public-prod/database/workspace/15af1c0d0dcd479cb8376a767ab07b4c/voices/s2xtA7B2CTXPPlJzch1v/YB9DE4weRg6BTei8hVZ5.mp3' },
  { id: '2dhHLsmg0MVma2t041qT', name: 'Johannes', desc: 'Selvsikker', preview: 'https://storage.googleapis.com/eleven-public-prod/custom/voices/2dhHLsmg0MVma2t041qT/fX3l7ljt7bx6zRPz8VdC.mp3' },
  { id: 'BGEU6wFi2uNm6Kje1Yhk', name: 'Maja', desc: 'Nordisk, dramatisk', preview: 'https://storage.googleapis.com/eleven-public-prod/database/workspace/ed9b05e6324c457685490352e9a1ec90/voices/BGEU6wFi2uNm6Kje1Yhk/gCIHS9pPkrtwiAjN4VgG.mp3' },
  { id: 'CMbvLbbccSd611KtwxV3', name: 'Robert', desc: 'Oslo', preview: 'https://storage.googleapis.com/eleven-public-prod/database/workspace/2461cf568dc042a3bbfbf75522203b35/voices/CMbvLbbccSd611KtwxV3/fabf86a6-90db-42c2-9993-47fff3f73a80.mp3' },
  { id: 'vUmLiNBm6MDcy1NUHaVr', name: 'Helge', desc: '', preview: 'https://storage.googleapis.com/eleven-public-prod/database/workspace/3690d7df74c84d8880e0e0d0641de7f2/voices/vUmLiNBm6MDcy1NUHaVr/6JBvRVvXcssLtXlaqLg1.mp3' },
  { id: 'uNsWM1StCcpydKYOjKyu', name: 'Mia', desc: 'Norsk kvinne', preview: 'https://storage.googleapis.com/eleven-public-prod/database/workspace/a2175a4ce5a74c88868dd9d4a000c9a6/voices/uNsWM1StCcpydKYOjKyu/868f87d5-7724-4786-a7fa-a48e01b2ba54.mp3' },
]

// Språkkode til ElevenLabs. Hardkodet 'no' ga engelsk tekst lest med norske
// uttaleregler så snart artistene fikk britiske/amerikanske stemmer
// (Lars 1/8). Gruppen kommer fra /api/voices; ukjent = norsk som før.
export function languageForGroup(gruppe?: string | null): 'no' | 'en' {
  const g = (gruppe || '').toLowerCase()
  if (!g) return 'no'
  if (g.includes('norsk') || g.includes('nordisk')) return 'no'
  if (/britisk|amerikansk|engelsk|australsk|kanadisk/.test(g)) return 'en'
  return 'no'
}

export const voiceName = (id?: string | null): string => {
  if (id === 'own') return 'Din egen stemme'
  return VOICES.find((v) => v.id === id)?.name || 'Ikke valgt'
}
