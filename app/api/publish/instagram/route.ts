import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { hentbarMediaUrl } from '@/lib/r2Presign'

export async function POST(request: Request) {
  try {
    const { pageIds, videoUrl, imageUrl, caption, draftId, productId, userId } = await request.json()

    if (!videoUrl && !imageUrl) {
      return NextResponse.json({ error: 'videoUrl or imageUrl is required' }, { status: 400 })
    }

    // URL-en Instagram henter mediet fra. Ligger fila på det ratebegrensede
    // R2-dev-domenet, byttes den mot en presignert URL — ellers uendret.
    // Lagrede URL-er røres ikke; IG laster ned fila én gang.
    const hentbarVideo = videoUrl ? await hentbarMediaUrl(videoUrl) : videoUrl
    const hentbarBilde = imageUrl ? await hentbarMediaUrl(imageUrl) : imageUrl

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const results = []

    for (const pageId of pageIds) {
      try {
        console.log('[publish/instagram] Processing page:', pageId)

        // Flere brukere kan ha koblet SAMME side (én rad per bruker), og da
        // ga .single() på page_id alene PGRST116 → «Connection not found».
        // Samme feil som lå i FB-ruta før 22/8. Scope til brukeren når vi
        // har den, ellers nyeste rad.
        let connQuery = supabase
          .from('social_connections')
          .select('access_token, user_access_token, page_name')
          .eq('page_id', pageId)
          .eq('platform', 'facebook')
        if (userId) connQuery = connQuery.eq('user_id', userId)
        const { data: conn } = await connQuery
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()

        if (!conn) {
          results.push({ pageId, success: false, error: 'Connection not found' })
          continue
        }

        const tokenForIg = conn.user_access_token || conn.access_token
        const igRes = await fetch(
          `https://graph.facebook.com/v21.0/${pageId}?fields=instagram_business_account&access_token=${tokenForIg}`
        )
        const igData = await igRes.json()
        let igAccountId = igData.instagram_business_account?.id

        if (!igAccountId && pageId === '1104756536056684') {
          igAccountId = '17841434830750460'
        }

        if (!igAccountId) {
          results.push({ pageId, success: false, error: 'No Instagram account connected' })
          continue
        }

        console.log('[publish/instagram] Creating media container for account:', igAccountId)

        const containerRes = await fetch(`https://graph.facebook.com/v21.0/${igAccountId}/media`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          // Bilde (feed-innlegg) eller video (Reels) — samme to-fase-flyt;
          // bildecontainere blir som regel FINISHED umiddelbart.
          body: JSON.stringify(
            imageUrl
              ? { image_url: hentbarBilde, caption, access_token: tokenForIg }
              : { media_type: 'REELS', video_url: hentbarVideo, caption, access_token: tokenForIg }
          ),
        })

        const containerData = await containerRes.json()

        if (!containerData.id) {
          console.error('[publish/instagram] Failed to create container:', containerData.error)
          results.push({ pageId, success: false, error: containerData.error?.message || 'Failed to create media container' })
          continue
        }

        console.log('[publish/instagram] Container created:', containerData.id, '— returning to client for polling')

        // Return immediately — client will poll /api/publish/instagram/status
        results.push({
          pageId,
          success: false,
          processing: true,
          containerId: containerData.id,
          igAccountId,
          caption,
          draftId,
          productId,
          userId,
          pageName: conn.page_name,
        })
      } catch (err) {
        results.push({ pageId, success: false, error: String(err) })
      }
    }

    const allProcessing = results.every((r) => r.processing)
    return NextResponse.json({ success: false, processing: allProcessing, results })
  } catch (err: any) {
    console.error('[publish/instagram] Error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
