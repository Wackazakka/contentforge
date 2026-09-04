import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { isFilmVoice } from '@/lib/filmVoices'

// Enkel filmflyt (Standard Ropert, Lars 4/9): sangen ER lydsporet.
//
// Kunden har laget en sang i Sangskaper (vokal med personens navn) og vil ha
// den som film/invitasjon. Da kan det IKKE ligge en AI-fortellerstemme oppaa
// — renderen ducker musikken til 15 % under tale, og sangen forsvinner.
// Derfor: alle scener «uten tale», film = musikkens lengde, korte tekstlinjer
// paa skjermen baerer budskapet, og kundens egne bilder brukes naar de finnes.
//
// Utkastet lagres FERDIG GODKJENT: brukeren skal ikke gjennom
// segmentredigeringen. Mangler bilder, lages de av klienten etterpaa
// (samme generate-image-sti som redigereren), foer produksjonen startes.

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

export const maxDuration = 60

interface SimpleRequest {
  productId: string
  title?: string
  description?: string
  musicFile?: string | null
  musicDurationSec?: number | null
  photos?: string[]
  locale?: 'no' | 'en'
  // Uten egen sang (4/9): en stemme leser teksten (voiceId fra FILM_VOICES),
  // og/eller et spor fra det delte biblioteket ligger under.
  voiceId?: string | null
  libraryMusic?: string | null
}

// Ca. 8 sekunder per bilde gir ro nok til aa lese linja og se bildet.
// Minst 4 scener saa filmen ikke blir en plakat. TAKET er 12 (4/9): Netlify
// kutter synkrone funksjoner ved ~26 s, og et Claude-kall som skriver 24
// linjer med bildeprompter brukte mer enn det — kunden fikk HTML 502 og
// «ingenting skjedde». Ved lange sanger holdes bildene lenger i stedet.
// Uten egne bilder koster hver scene et AI-bilde (~12 s + kroner) → maks 8.
const SECONDS_PER_SCENE = 8
function sceneCount(durationSec: number | null | undefined, photoCount: number): number {
  const fromMusic = durationSec && durationSec > 0 ? Math.round(durationSec / SECONDS_PER_SCENE) : 6
  const cap = photoCount > 0 ? 12 : 8
  return Math.max(4, Math.min(cap, fromMusic))
}

async function writeLines(opts: {
  title: string
  description: string
  category: string
  count: number
  needImagePrompts: boolean
  spoken: boolean
  locale: 'no' | 'en'
}): Promise<Array<{ text: string; voiceover: string; image_prompt: string }>> {
  const { title, description, category, count, needImagePrompts, spoken, locale } = opts
  const lang = locale === 'en' ? 'English' : 'Norwegian (bokmål)'
  const t0 = Date.now()
  const prompt = `You write the on-screen text for a short personal celebration video (an invitation or greeting)${spoken ? ' read aloud by a warm narrator over gentle background music' : ' that plays over a song the sender made for the occasion. There is NO narrator — the text lines are the only words besides the song, so they must carry the message on their own'}.

Occasion: "${title}"
Type: ${category || 'unspecified'}
What the sender wrote about it: "${description || '(nothing more)'}"

Write exactly ${count} lines in ${lang}, one per scene, in this order:
1. An opening line that says what is being celebrated.
2–${count - 1}. The essentials, one per line: who it is for, when, where, what to bring or do, and warm personal touches drawn from the sender's text. If the sender gave no time or place, do NOT invent them — write a warm line instead. Never invent names, dates, addresses or facts.
${count}. A closing line: welcome / see you there / a warm wish.

Rules: max 60 characters per line, plain and warm, no hashtags, no emojis, no quotation marks, end each line with proper punctuation.
${spoken ? 'Also write "voiceover": what the narrator says for that scene — one or two natural spoken sentences (max 140 characters) that say the same thing as the line but the way a person would say it aloud. Never invent facts.' : 'Set voiceover to an empty string.'}
${needImagePrompts ? 'Also give each line a short image prompt (English, max 25 words) for a warm, photographic scene that fits the line. IMPORTANT: the setting is Norway — Scandinavian homes, gardens, light and seasons — and any people are Scandinavian/Northern European in appearance, unless the sender\'s text says otherwise. No faces in close-up, no text in the image.' : 'Set image_prompt to an empty string.'}

Return JSON only: {"lines":[{"text":"...","voiceover":"...","image_prompt":"..."}]}`

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY || '',
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 2000,
      messages: [{ role: 'user', content: prompt }],
    }),
    // Netlify kutter ved ~26 s totalt — gi opp foer det, med klar melding
    signal: AbortSignal.timeout(20000),
  })
  console.log(`[produce/simple] Claude svarte etter ${Date.now() - t0} ms (${count} scener, spoken=${spoken}, prompts=${needImagePrompts})`)
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}))
    console.error('[produce/simple] Claude API error', { status: response.status, error: errorData })
    throw new Error(`Tekstene kunne ikke skrives (${response.status})`)
  }
  const data = await response.json()
  const content: string = data.content?.[0]?.text || ''
  const match = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').match(/\{[\s\S]*\}/)
  if (!match) throw new Error('Tekstene kom i feil format')
  const parsed = JSON.parse(match[0])
  const lines = Array.isArray(parsed.lines) ? parsed.lines : []
  return lines.slice(0, count).map((l: { text?: unknown; voiceover?: unknown; image_prompt?: unknown }) => ({
    text: String(l?.text || '').trim(),
    voiceover: String(l?.voiceover || '').trim(),
    image_prompt: String(l?.image_prompt || '').trim(),
  })).filter((l: { text: string }) => l.text)
}

export async function POST(request: NextRequest) {
  try {
    const tStart = Date.now()
    const body: SimpleRequest = await request.json()
    const { productId, musicFile = null, musicDurationSec = null, locale = 'no' } = body
    const photos = (body.photos || []).filter((u) => typeof u === 'string' && /^https?:\/\//.test(u))
    if (!productId) return NextResponse.json({ error: 'productId mangler' }, { status: 400 })
    // Stemme og biblioteksmusikk gjelder bare UTEN egen sang (sangen har vokal)
    const voiceId = !musicFile && isFilmVoice(body.voiceId) ? String(body.voiceId) : null
    const libraryMusic = !musicFile && typeof body.libraryMusic === 'string'
      && /^[a-z0-9-]+\/[^/]+$/.test(body.libraryMusic)
      && !/^(tracks|jingles)-/.test(body.libraryMusic)
      ? body.libraryMusic : null

    // Eierskap: brukerens eget token mot RLS paa products.
    const auth = request.headers.get('authorization')
    if (!auth?.startsWith('Bearer ')) return NextResponse.json({ error: 'Du må være innlogget.' }, { status: 401 })
    const asUser = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: auth } } })
    const { data: product } = await asUser
      .from('products')
      .select('id, name, description, category')
      .eq('id', productId)
      .maybeSingle()
    if (!product) return NextResponse.json({ error: 'Fant ikke anledningen.' }, { status: 403 })

    const title = (body.title || product.name || '').trim()
    const description = (body.description || product.description || '').trim()
    if (!title) return NextResponse.json({ error: 'Fortell hva som feires.' }, { status: 400 })

    const count = sceneCount(musicFile ? musicDurationSec : null, photos.length)
    const lines = await writeLines({
      title,
      description,
      category: product.category || '',
      count,
      needImagePrompts: photos.length === 0,
      spoken: !!voiceId,
      locale,
    })
    if (lines.length < 2) throw new Error('Fikk for få tekstlinjer')

    // Egne bilder brukes i rekkefoelge og gjentas om det er faerre enn scener.
    // Ingen egne bilder: image_url tom → klienten lager AI-bilder etterpaa.
    // `simple_film` er filmflytens signatur — production.ts logger fastpris
    // paa den, uansett om filmen har sang, stemme eller bare musikk.
    const segments = lines.map((l, i) => ({
      index: i,
      text: l.text,
      voiceover: voiceId ? (l.voiceover || l.text) : '',
      image_url: photos.length > 0 ? photos[i % photos.length] : '',
      image_prompt: l.image_prompt,
      approved: true,
      no_voice: !voiceId,
      // Bare kundens EGEN sang styrer lengden. Biblioteksmusikk kuttes/
      // fades av renderen; scenene faar standard hviletid (5 s uten tale).
      match_music: !!musicFile,
      simple_film: true,
    }))

    const admin = createClient(SUPABASE_URL, SERVICE_KEY)
    const { data: draft, error } = await admin
      .from('production_drafts')
      .insert({
        product_id: productId,
        campaign_id: null,
        title,
        status: 'draft',
        segments,
        target_audience: '',
        problem: '',
        // Uten stemme: 'own' + alle scener uten tale → ingen TTS.
        // Med stemme: dropleten lager talen (turbo v2.5, norsk) ved produksjon.
        voice_id: voiceId || 'own',
        tone: 'Vennlig',
        cta: '',
        video_format: '9:16',
        music_style: 'Warm',
        music_file: musicFile || libraryMusic,
        // ⚠️ IKKE image_style/include_outro_card/ai_motion/user_id her: de
        // kolonnene finnes ikke i prod-tabellen (Lars 4/9: «Could not find
        // the 'include_outro_card' column»). Produksjonsvalgene sendes
        // eksplisitt fra klienten; webhook-stien faar standardene (ingen
        // sluttplakat uten nettside, ingen bevegelse).
      })
      .select('id')
      .single()
    if (error || !draft) throw new Error(error?.message || 'Utkastet kunne ikke lagres')

    console.log(`[produce/simple] ferdig etter ${Date.now() - tStart} ms — draft ${draft.id}`)
    return NextResponse.json({ draftId: draft.id, segments, needsImages: photos.length === 0 })
  } catch (err) {
    console.error('[produce/simple] Error:', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Noe gikk galt' }, { status: 500 })
  }
}
