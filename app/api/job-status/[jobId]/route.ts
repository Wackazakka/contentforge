import { NextResponse, NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const DROPLET_URL = 'http://139.59.212.218:3002'
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const { jobId } = await params

    // First check Supabase for completed jobs (R2 URL already stored by webhook)
    if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
        auth: { persistSession: false },
      })
      const { data: job } = await supabase
        .from('production_jobs')
        .select('status, ai_parameters')
        .eq('id', jobId)
        .single()

      if (job?.status === 'done') {
        const videoUrl =
          job.ai_parameters?.video_url ||
          job.ai_parameters?.r2_url ||
          null
        return NextResponse.json({ jobId, status: 'done', videoUrl })
      }
    }

    // Fall back to polling the droplet for in-progress jobs
    const res = await fetch(`${DROPLET_URL}/jobs/${jobId}`)
    const data = await res.json()

    // If droplet says done, don't expose the HTTP droplet URL — the webhook
    // should have already written the R2 URL to Supabase; if not yet, return
    // 'uploading' so the client keeps polling until Supabase is updated.
    if (data.status === 'done') {
      return NextResponse.json({ jobId, status: 'uploading' })
    }

    return NextResponse.json(data)
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
