import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

export async function POST(request: NextRequest) {
  try {
    const { jobId, videoUrl, service, campaignId } = await request.json()

    if (!jobId || !videoUrl) {
      return NextResponse.json(
        { error: 'Missing jobId or videoUrl' },
        { status: 400 }
      )
    }

    // Create Supabase client
    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { persistSession: false },
    })

    // Update production_job status to 'done' and set video URL
    const { error: updateError } = await supabase
      .from('production_jobs')
      .update({
        status: 'done',
        completed_at: new Date().toISOString(),
        // Store video URL in ai_parameters for now (could add dedicated column)
        ai_parameters: {
          video_url: videoUrl,
          service,
          campaignId,
        },
      })
      .eq('id', jobId)

    if (updateError) {
      console.error('[api/productions/complete] Update error:', updateError)
      return NextResponse.json(
        { error: 'Failed to update production job status' },
        { status: 500 }
      )
    }

    console.log(`[api/productions/complete] Job ${jobId} marked as done with video URL: ${videoUrl}`)

    return NextResponse.json({
      jobId,
      status: 'done',
      videoUrl,
    })
  } catch (err) {
    console.error('[api/productions/complete] Error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
