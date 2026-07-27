import { NextResponse } from 'next/server'
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY
const R2_ENDPOINT = process.env.R2_ENDPOINT
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME || 'contentforge-assets'
const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL || 'https://pub-5dcdfe9305a740febc87568c9ccb40a6.r2.dev'

export async function POST(request: Request) {
  try {
    const { text, voiceId, draftId, segmentIndex } = await request.json()

    console.log(`[preview-voiceover] Generating preview for segment ${segmentIndex} of draft ${draftId}`)

    // Call ElevenLabs
    const elevenRes = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: 'POST',
      headers: {
        'xi-api-key': ELEVENLABS_API_KEY!,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text,
        model_id: 'eleven_turbo_v2_5',
        language_code: 'no',
        voice_settings: { stability: 0.5, similarity_boost: 0.75 },
      }),
    })

    if (!elevenRes.ok) {
      const error = await elevenRes.text()
      console.error(`[preview-voiceover] ElevenLabs error:`, error)
      throw new Error('ElevenLabs API failed')
    }

    const audioBuffer = await elevenRes.arrayBuffer()
    console.log(`[preview-voiceover] Audio generated, size: ${audioBuffer.byteLength} bytes`)

    // Server-side kost-akkumulering (atomisk RPC) — klientens addCost er kun visning
    if (draftId) {
      try {
        const { createClient } = await import('@supabase/supabase-js')
        const { COSTS_NOK } = await import('@/lib/costs')
        const supabase = createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
        )
        await supabase.rpc('add_draft_cost', { p_draft_id: draftId, p_amount: COSTS_NOK.voiceoverPreview })
      } catch (costErr) {
        console.warn('[preview-voiceover] add_draft_cost feilet:', costErr)
      }
    }

    // Upload to R2
    const r2 = new S3Client({
      region: 'auto',
      endpoint: R2_ENDPOINT!,
      credentials: {
        accessKeyId: R2_ACCESS_KEY_ID!,
        secretAccessKey: R2_SECRET_ACCESS_KEY!,
      },
    })

    const timestamp = Date.now()
    const key = `voiceovers/${draftId}/segment_${segmentIndex}_${timestamp}.mp3`
    console.log(`[preview-voiceover] Uploading to R2: ${key}`)

    await r2.send(
      new PutObjectCommand({
        Bucket: R2_BUCKET_NAME,
        Key: key,
        Body: Buffer.from(audioBuffer),
        ContentType: 'audio/mpeg',
      })
    )

    const url = `${R2_PUBLIC_URL}/${key}`
    console.log(`[preview-voiceover] Success: ${url}`)

    return NextResponse.json({ url })
  } catch (err: any) {
    console.error(`[preview-voiceover] Error:`, err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
