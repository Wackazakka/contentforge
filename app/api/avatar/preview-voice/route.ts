import { NextRequest, NextResponse } from 'next/server'

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY

const EMOTION_PRESETS: Record<string, { stability: number; style: number; similarity_boost: number }> = {
  nøytral:      { stability: 0.50, style: 0.00, similarity_boost: 0.75 },
  entusiastisk: { stability: 0.30, style: 0.75, similarity_boost: 0.75 },
  glad:         { stability: 0.40, style: 0.50, similarity_boost: 0.75 },
  trist:        { stability: 0.70, style: 0.20, similarity_boost: 0.75 },
  nølende:      { stability: 0.20, style: 0.35, similarity_boost: 0.70 },
  rolig:        { stability: 0.80, style: 0.00, similarity_boost: 0.75 },
  dramatisk:    { stability: 0.25, style: 0.85, similarity_boost: 0.75 },
}

export async function POST(request: NextRequest) {
  try {
    const { script, voiceId, emotion } = await request.json()

    if (!script || !voiceId) {
      return NextResponse.json({ error: 'Missing script or voiceId' }, { status: 400 })
    }

    if (!ELEVENLABS_API_KEY) {
      return NextResponse.json({ error: 'ElevenLabs API key not configured' }, { status: 500 })
    }

    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: 'POST',
      headers: {
        'xi-api-key': ELEVENLABS_API_KEY,
        'Content-Type': 'application/json',
        Accept: 'audio/mpeg',
      },
      body: JSON.stringify({
        text: script,
        model_id: 'eleven_multilingual_v2',
        language_code: 'no',
        voice_settings: EMOTION_PRESETS[emotion] ?? EMOTION_PRESETS['nøytral'],
      }),
    })

    if (!res.ok) {
      const err = await res.text()
      console.error('[avatar/preview-voice] ElevenLabs error:', err)
      return NextResponse.json({ error: 'ElevenLabs feilet' }, { status: 502 })
    }

    const audioBuffer = await res.arrayBuffer()
    return new NextResponse(audioBuffer, {
      headers: {
        'Content-Type': 'audio/mpeg',
        'Content-Length': String(audioBuffer.byteLength),
        'Cache-Control': 'no-store',
      },
    })
  } catch (err: any) {
    console.error('[avatar/preview-voice] Error:', err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
