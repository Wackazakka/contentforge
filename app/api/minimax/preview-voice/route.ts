import { NextRequest, NextResponse } from 'next/server'

const MINIMAX_API_KEY = process.env.MINIMAX_API_KEY

// Map our emotion presets to MiniMax emotion values
const EMOTION_MAP: Record<string, string> = {
  nøytral:      'calm',
  entusiastisk: 'happy',
  glad:         'happy',
  trist:        'sad',
  nølende:      'fluent',
  rolig:        'calm',
  dramatisk:    'angry',
}

export async function POST(request: NextRequest) {
  try {
    const { script, voiceId, emotion } = await request.json()

    if (!script) {
      return NextResponse.json({ error: 'Missing script' }, { status: 400 })
    }

    if (!MINIMAX_API_KEY) {
      return NextResponse.json({ error: 'MiniMax API key not configured' }, { status: 500 })
    }

    const minimaxEmotion = EMOTION_MAP[emotion] ?? 'calm'

    const res = await fetch('https://api.minimax.io/v1/t2a_v2', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${MINIMAX_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'speech-02-hd',
        text: script,
        voice_setting: {
          voice_id: voiceId || 'Friendly_Person',
          emotion: minimaxEmotion,
          speed: 1.0,
          vol: 1.0,
        },
        audio_setting: {
          format: 'mp3',
          sample_rate: 44100,
          bitrate: 128000,
        },
        language_boost: 'Norwegian',
      }),
    })

    const json = await res.json()

    if (!res.ok || json.base_resp?.status_code !== 0) {
      console.error('[minimax/preview-voice] error:', JSON.stringify(json))
      return NextResponse.json({ error: json.base_resp?.status_msg ?? 'MiniMax feilet' }, { status: 502 })
    }

    const audioHex: string = json.data?.audio
    if (!audioHex) {
      return NextResponse.json({ error: 'No audio in response' }, { status: 502 })
    }

    const audioBuffer = Buffer.from(audioHex, 'hex')

    return new NextResponse(audioBuffer, {
      headers: {
        'Content-Type': 'audio/mpeg',
        'Content-Length': String(audioBuffer.byteLength),
        'Cache-Control': 'no-store',
      },
    })
  } catch (err: any) {
    console.error('[minimax/preview-voice] Error:', err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
