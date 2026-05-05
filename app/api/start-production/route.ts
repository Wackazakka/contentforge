import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

const DROPLET_URL = 'http://139.59.212.218:3002'

export async function POST(request: Request) {
  try {
    const { draftId } = await request.json()
    if (!draftId) return NextResponse.json({ error: 'Missing draftId' }, { status: 400 })

    console.log('[start-production] Starting production for draft:', draftId)

    const supabase = createRouteHandlerClient({ cookies })

    // Hent draft med segmenter
    console.log('[start-production] Fetching draft from Supabase...')
    const { data: draft, error } = await supabase
      .from('production_drafts')
      .select('*')
      .eq('id', draftId)
      .single()

    if (error || !draft) {
      console.error('[start-production] Draft not found:', error)
      return NextResponse.json({ error: 'Draft ikke funnet' }, { status: 404 })
    }

    console.log('[start-production] Draft fetched:', { draftId: draft.id, segments: draft.segments?.length || 0 })

    // Sjekk at alle segmenter er godkjent
    const segments = draft.segments || []
    const allApproved = segments.every((s: any) => s.approved === true)
    if (!allApproved) {
      console.warn('[start-production] Not all segments approved')
      const approvedCount = segments.filter((s: any) => s.approved).length
      return NextResponse.json(
        { error: `Ikke alle segmenter er godkjent (${approvedCount}/${segments.length})` },
        { status: 400 }
      )
    }

    // Bygg segments-array for job-queue
    const processedSegments = segments
      .sort((a: any, b: any) => a.index - b.index)
      .map((s: any) => ({
        text: s.text,
        voiceover: s.voiceover,
        imageUrl: s.image_url,
      }))

    console.log('[start-production] Prepared segments:', {
      count: processedSegments.length,
      first: processedSegments[0] ? { text: processedSegments[0].text.substring(0, 50) + '...' } : null,
    })

    // Post til droplet job-queue
    console.log('[start-production] Posting to droplet job-queue...')
    const jobRes = await fetch(`${DROPLET_URL}/jobs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        campaignId: draft.campaign_id,
        productId: draft.product_id,
        service: draft.service || 'storytelling',
        segments: processedSegments,
        video_format: draft.video_format || 'tiktok',
        musicFile: draft.music_file || null,
      }),
    })

    const job = await jobRes.json()
    console.log('[start-production] Droplet response:', { status: jobRes.status, jobId: job.jobId })

    if (!jobRes.ok) {
      console.error('[start-production] Droplet error:', job.error)
      return NextResponse.json({ error: job.error || 'Job queue error' }, { status: 500 })
    }

    // Oppdater draft med jobId og status
    console.log('[start-production] Updating draft status to processing...')
    const { error: updateError } = await supabase
      .from('production_drafts')
      .update({ status: 'processing', job_id: job.jobId })
      .eq('id', draftId)

    if (updateError) {
      console.error('[start-production] Update error:', updateError)
      // Don't fail if update fails, job was queued
    }

    console.log('[start-production] ========== ✅ PRODUCTION STARTED ==========')
    console.log('[start-production] JobId:', job.jobId)

    return NextResponse.json({ jobId: job.jobId, status: 'queued' })
  } catch (err: any) {
    console.error('[start-production] ========== ❌ ERROR ==========')
    console.error('[start-production] Error:', err.message || String(err))
    console.error('[start-production] Stack:', err.stack)
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 })
  }
}
