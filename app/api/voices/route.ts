import { NextResponse } from 'next/server'
import { VOICES as FALLBACK } from '@/lib/voices'

// Stemmeutvalget hentes fra ElevenLabs-kontoen (Lars 1/8: IndigoBoom-artister
// trenger britiske/amerikanske stemmer også). Legger Lars en stemme til i
// «My Voices» i ElevenLabs, dukker den opp her uten kodeendring.
//
// Faller tilbake til den hardkodede lista hvis API-et er utilgjengelig eller
// nøkkelen er for begrenset til å lese stemmer — utvalget skal aldri bli tomt.

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY

let cache: { at: number; voices: unknown[] } | null = null
const TTL_MS = 5 * 60 * 1000

export async function GET() {
  if (cache && Date.now() - cache.at < TTL_MS) {
    return NextResponse.json({ voices: cache.voices, cached: true })
  }
  if (!ELEVENLABS_API_KEY) {
    return NextResponse.json({ voices: FALLBACK, source: 'fallback', reason: 'mangler nøkkel' })
  }
  try {
    const res = await fetch('https://api.elevenlabs.io/v1/voices', {
      headers: { 'xi-api-key': ELEVENLABS_API_KEY },
      signal: AbortSignal.timeout(10000),
    })
    if (!res.ok) {
      // 401 = nøkkelen er begrenset til tale-generering (kjent oppsett)
      return NextResponse.json({ voices: FALLBACK, source: 'fallback', reason: `elevenlabs ${res.status}` })
    }
    const data = await res.json()
    const voices = (data.voices || [])
      .map((v: any) => {
        const lab = v.labels || {}
        // Beskrivelsen artisten ser: aksent + karakter, på norsk der vi kan
        const biter = [lab.accent, lab.description, lab.age, lab.use_case].filter(Boolean)
        return {
          id: v.voice_id,
          name: v.name,
          desc: biter.join(', '),
          preview: v.preview_url || '',
          language: lab.language || '',
          accent: lab.accent || '',
          category: v.category || '',
        }
      })
      // Stemmer uten forhåndsvisning er ubrukelige i velgeren
      .filter((v: any) => v.id && v.name)
    if (voices.length === 0) {
      return NextResponse.json({ voices: FALLBACK, source: 'fallback', reason: 'tom liste' })
    }
    cache = { at: Date.now(), voices }
    return NextResponse.json({ voices, source: 'elevenlabs' })
  } catch (err: any) {
    return NextResponse.json({ voices: FALLBACK, source: 'fallback', reason: err?.message || 'ukjent feil' })
  }
}
