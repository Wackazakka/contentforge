import { NextRequest, NextResponse } from 'next/server'

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY

export async function POST(request: NextRequest) {
  try {
    const { topic, targetAudience, problem, tone, cta, duration, perspective } = await request.json()

    if (!topic?.trim()) {
      return NextResponse.json({ error: 'topic er påkrevd' }, { status: 400 })
    }

    if (!ANTHROPIC_API_KEY) {
      return NextResponse.json({ error: 'ANTHROPIC_API_KEY ikke satt' }, { status: 500 })
    }

    const durationMap: Record<string, string> = {
      '15': 'ca. 15 sekunder (30–40 ord)',
      '30': 'ca. 30 sekunder (60–80 ord)',
      '60': 'ca. 60 sekunder (120–150 ord)',
      '90': 'ca. 90 sekunder (180–220 ord)',
    }
    const durationHint = durationMap[duration] || durationMap['30']

    const perspectiveHint = perspective === 'jeg'
      ? 'Første person ("jeg"). Snakk fra eget perspektiv — "Da jeg prøvde...", "Jeg anbefaler...", "Her er hva jeg lærte...".'
      : 'Andre person ("du"). Snakk direkte til seeren — "Du bør...", "Har du noen gang...", "Dette gjør du...".'

    const lines = [
      `Emne: ${topic}`,
      targetAudience ? `Målgruppe: ${targetAudience}` : '',
      problem ? `Problem/utfordring: ${problem}` : '',
      `Tone: ${tone || 'Energisk'}`,
      `Perspektiv: ${perspectiveHint}`,
      cta ? `Call-to-action: ${cta}` : '',
      `Varighet: ${durationHint}`,
    ].filter(Boolean).join('\n')

    const prompt = `Du er en manusforfatter for korte talking-head-videoer til sosiale medier (TikTok, Instagram Reels, YouTube Shorts).

Skriv et sammenhengende manus for en avatar-video basert på disse parameterne:

${lines}

Krav:
- Manuset leses høyt av en avatar og skal høres naturlig ut som tale (ikke skrivestil)
- Ingen overskrifter, ingen punktlister — bare flytende tekst som tales rett frem
- Åpne med en hook som fanger oppmerksomheten umiddelbart
- Avslutt med call-to-action hvis oppgitt
- Skriv på norsk med mindre emnet tilsier noe annet
- Kun manusteksten — ingen forklaringer, titler eller kommentarer rundt`

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 600,
        messages: [{ role: 'user', content: prompt }],
      }),
    })

    if (!res.ok) {
      const err = await res.text()
      console.error('[avatar-script] Anthropic error:', err)
      return NextResponse.json({ error: 'Feil fra AI-tjeneste' }, { status: 500 })
    }

    const data = await res.json()
    const script = data.content?.[0]?.text?.trim()

    if (!script) {
      return NextResponse.json({ error: 'Tom respons fra AI' }, { status: 500 })
    }

    return NextResponse.json({ script })
  } catch (err) {
    console.error('[avatar-script] Error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Intern serverfeil' },
      { status: 500 }
    )
  }
}
