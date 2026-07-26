import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { checkAndDeductCredits } from '@/lib/credits'

const DROPLET_URL = 'http://139.59.212.218:3002'
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

// Strip emojis from text for compatibility with renderer
function stripEmojis(text: string): string {
  return text
    .replace(/[\u{1F000}-\u{1FFFF}|\u{2600}-\u{27FF}|\u{2300}-\u{23FF}|\u{2B00}-\u{2BFF}|\u{FE00}-\u{FEFF}|\u{1F900}-\u{1F9FF}|\u{1FA00}-\u{1FAFF}]/gu, '')
    .trim()
}

export async function POST(request: Request) {
  try {
    const { draftId, userId, imageStyle, includeOutroCard, outroJingle, aiMotion, aiMotionEngine } = await request.json()
    if (!draftId) return NextResponse.json({ error: 'Missing draftId' }, { status: 400 })

    if (userId) {
      const credit = await checkAndDeductCredits(userId, 'video_generation', `Videoproduksjon — draft ${draftId}`)
      if (!credit.ok) {
        return NextResponse.json({ error: credit.error }, { status: 402 })
      }
    }

    console.log('[start-production] Starting production for draft:', draftId)

    const supabase = createClient(SUPABASE_URL || '', SUPABASE_SERVICE_ROLE_KEY || '')

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

    // Hent produkt for logo — check product_profiles first, then products table
    console.log('[start-production] Fetching product logo...')
    const [{ data: productProfile }, { data: product }] = await Promise.all([
      supabase
        .from('product_profiles')
        .select('logo_url, website_url, primary_color, secondary_color')
        .eq('product_id', draft.product_id)
        .single(),
      supabase.from('products').select('logo_url').eq('id', draft.product_id).single(),
    ])
    const logoUrl = productProfile?.logo_url || product?.logo_url || null
    const websiteUrl = productProfile?.website_url || null
    console.log('[start-production] Logo URL:', logoUrl, 'Website URL:', websiteUrl)

    // Determine outro card preference: explicit body param wins, else draft column, else true
    const outroEnabled = includeOutroCard !== undefined
      ? !!includeOutroCard
      : (draft.include_outro_card ?? true)
    const outroCard = (outroEnabled && websiteUrl)
      ? {
          url: websiteUrl,
          cta: draft.cta || '',
          logoUrl: logoUrl || null,
          primaryColor: productProfile?.primary_color || '#1a1a2e',
          secondaryColor: productProfile?.secondary_color || '#ffffff',
          durationSeconds: 3,
          jingleFile: outroJingle || null,
        }
      : null
    console.log('[start-production] Outro card:', outroCard ? 'enabled' : 'disabled')

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

    // Bygg segments-array for job-queue (strip emojis from text).
    //
    // VIKTIG: `index`-feltet kommer fra LLM-output ved draft-generering og blir
    // ALDRI re-synkronisert med array-rekkefølgen. Draft-editoren viser, redigerer
    // og lagrer segmenter utelukkende etter array-posisjon (draft.segments.map),
    // så array-rekkefølgen er den autoritative rekkefølgen brukeren faktisk ser.
    // Tidligere sorterte vi på s.index — hvis LLM emitterte index-er ute av
    // rekkefølge/duplisert, ble segmentene stokket om bort fra brukerens
    // rekkefølge, slik at undertekst + voiceover kom fra feil segment.
    // Vi bevarer derfor array-rekkefølgen og re-stamper en ren sekvensiell index.
    const processedSegments = segments.map((s: any, i: number) => ({
      index: i,
      text: stripEmojis(s.text),
      voiceover: s.voiceover,
      imagePrompt: s.image_prompt || s.imagePrompt || '',
      imageUrl: s.image_url,
      voiceoverUrl: s.voiceover_url || null,
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
        campaignId: draft.campaign_id || draft.id, // fallback til draftId
        productId: draft.product_id,
        service: draft.service || 'storytelling',
        targetAudience: draft.target_audience || '',
        problem: draft.problem || '',
        voiceId: draft.voice_id || 'nhvaqgRyAq6BmFs3WcdX',
        tone: draft.tone || 'Energisk',
        cta: draft.cta || '',
        segments: processedSegments,
        video_format: draft.video_format || '9:16',
        musicStyle: draft.music_style || 'Upbeat',
        musicFile: draft.music_file || null,
        logoUrl: logoUrl,
        imageStyle: imageStyle || 'editorial',
        outroCard,
        aiMotion: !!aiMotion,
        aiMotionEngine: aiMotionEngine || 'pixverse',
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
