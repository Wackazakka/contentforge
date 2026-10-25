import { NextRequest, NextResponse } from 'next/server'
import { innloggetBruker } from '@/lib/innlogget'
import { eierProdukt } from '@/lib/eierskap'
import { createClient } from '@supabase/supabase-js'

const DROPLET_URL = 'http://139.59.212.218:3002'
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

const DEFAULT_VOICE_ID = 'nPczCjzI2devNBz1zQrb'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { productId, campaignName, script, avatarImageUrl, voiceId, musicFile, outroCard, audioSegmentUrls, emotion } = body

    if (!productId || !script || !avatarImageUrl) {
      return NextResponse.json(
        { error: 'Missing required fields: productId, script, avatarImageUrl' },
        { status: 400 }
      )
    }

    const authHeader = request.headers.get('Authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Missing or invalid Authorization header' }, { status: 401 })
    }

    // 🔑 Tokenet verifiseres hos Supabase (25.10). Før ble det bare dekodet:
    // en forfalsket {"sub": "<offer>"} holdt. Og produktet må være brukerens.
    const bruker = await innloggetBruker(request)
    if (!bruker) return NextResponse.json({ error: 'Invalid authentication token' }, { status: 401 })
    const userId: string = bruker.id
    if (productId && !(await eierProdukt(userId, String(productId)))) {
      return NextResponse.json({ error: 'Produktet tilhører ikke deg' }, { status: 403 })
    }

    // Royalty-raden skrives FØRST NÅ — etter at vi vet hvem som spør (25.10):
    // før lå den foran innloggingssjekken, så et uautentisert kall skrev i hovedboken.
    // Stemmebank: royalty-hendelse hvis stemmen er en registrert skuespiller
    try {
      const { getProductTenant } = await import('@/lib/tenantBilling')
      const { logVoiceUsage } = await import('@/lib/voiceBank')
      const pt = await getProductTenant(productId)
      if (pt.tenantId && voiceId) {
        await logVoiceUsage({ elevenlabsVoiceId: voiceId, usedByTenantId: pt.tenantId, organizationId: pt.organizationId, productId, meta: { kind: 'avatar' } })
      }
    } catch { /* royalty-logging velter aldri produksjon */ }


    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { persistSession: false },
    })

    const { data: jobData, error: jobError } = await supabase
      .from('production_jobs')
      .insert({
        product_id: productId,
        created_by: userId,
        title: campaignName || 'Avatar Video',
        description: script.slice(0, 500),
        status: 'queued',
        content_type: 'avatar',
        video_format: '9:16',
        ai_parameters: {
          script,
          avatarImageUrl,
          voiceId: voiceId || DEFAULT_VOICE_ID,
        },
      })
      .select()
      .single()

    if (jobError || !jobData) {
      console.error('[api/productions/avatar] Supabase insert error:', jobError)
      return NextResponse.json({ error: 'Failed to create production job' }, { status: 500 })
    }

    const jobId = jobData.id

    try {
      const queueResponse = await fetch(`${DROPLET_URL}/jobs/avatar-jobs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobId,
          script,
          avatarImageUrl,
          voiceId: voiceId || DEFAULT_VOICE_ID,
          musicFile: musicFile || null,
          outroCard: outroCard || null,
          audioSegmentUrls: audioSegmentUrls || null,
          emotion: emotion || 'nøytral',
          productId,
          campaignId: productId,
        }),
      })

      if (!queueResponse.ok) {
        const errorText = await queueResponse.text()
        console.error(`[api/productions/avatar] Droplet error (${queueResponse.status}):`, errorText)
        await supabase.from('production_jobs').update({ status: 'failed' }).eq('id', jobId)
        return NextResponse.json({ error: 'Failed to queue avatar job on server' }, { status: 500 })
      }

      await supabase
        .from('production_jobs')
        .update({ status: 'generating', updated_at: new Date().toISOString() })
        .eq('id', jobId)

      return NextResponse.json({ jobId, status: 'queued', message: 'Avatar video production started' })
    } catch (dropletError) {
      console.error('[api/productions/avatar] Droplet fetch error:', dropletError)
      await supabase.from('production_jobs').update({ status: 'failed' }).eq('id', jobId)
      return NextResponse.json({ error: 'Failed to connect to production server' }, { status: 500 })
    }
  } catch (err) {
    console.error('[api/productions/avatar] Request error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
