import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const DROPLET_URL = 'http://139.59.212.218:3002'
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('[api/productions/video] Missing Supabase env vars')
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { productId, campaignName, headline, bodyCopy, cta, tone, formats } = body

    // Validation
    if (!productId || !headline || !bodyCopy) {
      return NextResponse.json(
        { error: 'Missing required fields: productId, headline, bodyCopy' },
        { status: 400 }
      )
    }

    if (!formats || formats.length === 0) {
      return NextResponse.json({ error: 'At least one format is required' }, { status: 400 })
    }

    // Create Supabase client (server-side)
    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { persistSession: false },
    })

    // Step 1: Create production_job in Supabase
    const { data: jobData, error: jobError } = await supabase
      .from('production_jobs')
      .insert({
        product_id: productId,
        title: campaignName,
        description: bodyCopy,
        status: 'queued',
        content_type: 'video',
        video_format: formats.join(','),
        ai_parameters: {
          headline,
          tone: tone || 'professional',
          cta,
        },
      })
      .select()
      .single()

    if (jobError) {
      console.error('[api/productions/video] Supabase insert error:', jobError)
      return NextResponse.json(
        { error: 'Failed to create production job in database' },
        { status: 500 }
      )
    }

    if (!jobData) {
      return NextResponse.json(
        { error: 'Failed to create production job' },
        { status: 500 }
      )
    }

    const jobId = jobData.id

    // Step 2: Queue the job on droplet server
    try {
      const queueResponse = await fetch(`${DROPLET_URL}/jobs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobId,
          campaignId: productId,
          service: 'contentforge',
          headline,
          bodyCopy,
          tone: tone || 'professional',
          cta: cta || '',
          musicFile: null, // Use default music
        }),
      })

      if (!queueResponse.ok) {
        const errorText = await queueResponse.text()
        console.error(`[api/productions/video] Droplet error (${queueResponse.status}):`, errorText)
        
        // Update job status to failed
        await supabase
          .from('production_jobs')
          .update({ status: 'failed' })
          .eq('id', jobId)

        return NextResponse.json(
          { error: 'Failed to queue video production on server' },
          { status: 500 }
        )
      }

      const queueData = await queueResponse.json()
      console.log(`[api/productions/video] Job ${jobId} queued on droplet:`, queueData)

      // Step 3: Update job status to 'generating'
      await supabase
        .from('production_jobs')
        .update({ status: 'generating', updated_at: new Date().toISOString() })
        .eq('id', jobId)

      return NextResponse.json({
        jobId,
        status: 'queued',
        message: 'Video production started',
      })
    } catch (dropletError) {
      console.error('[api/productions/video] Droplet fetch error:', dropletError)

      // Update job status to failed
      await supabase
        .from('production_jobs')
        .update({ status: 'failed' })
        .eq('id', jobId)

      return NextResponse.json(
        { error: 'Failed to connect to production server' },
        { status: 500 }
      )
    }
  } catch (err) {
    console.error('[api/productions/video] Request error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
