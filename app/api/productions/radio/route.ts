import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const DROPLET_URL = 'http://139.59.212.218:3002'
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

const DEFAULT_VOICE_ID = 'nPczCjzI2devNBz1zQrb'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { productId, campaignName, script, voiceId, musicFile } = body

    if (!productId || !script) {
      return NextResponse.json({ error: 'Missing required fields: productId, script' }, { status: 400 })
    }

    const authHeader = request.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Missing or invalid Authorization header' }, { status: 401 })
    }

    const token = authHeader.substring(7)
    let userId: string
    try {
      const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString('utf8'))
      userId = payload.sub
      if (!userId) throw new Error('No user ID')
    } catch {
      return NextResponse.json({ error: 'Invalid authentication token' }, { status: 401 })
    }

    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { persistSession: false },
    })

    const { data: jobData, error: jobError } = await supabase
      .from('production_jobs')
      .insert({
        product_id: productId,
        created_by: userId,
        title: campaignName || 'Radioreklame',
        description: script.slice(0, 500),
        status: 'queued',
        content_type: 'radio',
        video_format: 'audio',
        ai_parameters: { script, voiceId: voiceId || DEFAULT_VOICE_ID, musicFile: musicFile || null },
      })
      .select()
      .single()

    if (jobError || !jobData) {
      console.error('[api/productions/radio] Supabase insert error:', jobError)
      return NextResponse.json({ error: 'Failed to create production job' }, { status: 500 })
    }

    const jobId = jobData.id

    try {
      const queueResponse = await fetch(`${DROPLET_URL}/jobs/radio-jobs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobId,
          script,
          voiceId: voiceId || DEFAULT_VOICE_ID,
          musicFile: musicFile || null,
          productId,
          campaignId: productId,
        }),
      })

      if (!queueResponse.ok) {
        const errorText = await queueResponse.text()
        console.error(`[api/productions/radio] Droplet error:`, errorText)
        await supabase.from('production_jobs').update({ status: 'failed' }).eq('id', jobId)
        return NextResponse.json({ error: 'Failed to queue radio job on server' }, { status: 500 })
      }

      await supabase
        .from('production_jobs')
        .update({ status: 'generating', updated_at: new Date().toISOString() })
        .eq('id', jobId)

      return NextResponse.json({ jobId, status: 'queued', message: 'Radio ad production started' })
    } catch (dropletError) {
      console.error('[api/productions/radio] Droplet fetch error:', dropletError)
      await supabase.from('production_jobs').update({ status: 'failed' }).eq('id', jobId)
      return NextResponse.json({ error: 'Failed to connect to production server' }, { status: 500 })
    }
  } catch (err) {
    console.error('[api/productions/radio] Request error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
