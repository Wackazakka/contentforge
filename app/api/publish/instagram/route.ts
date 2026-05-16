import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(request: Request) {
  try {
    const { pageIds, videoUrl, caption, draftId, productId, userId } = await request.json()

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const results = []

    for (const pageId of pageIds) {
      try {
        console.log('[publish/instagram] Processing page:', pageId)

        const { data: conn } = await supabase
          .from('social_connections')
          .select('access_token, user_access_token, page_name')
          .eq('page_id', pageId)
          .single()

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
          body: JSON.stringify({
            media_type: 'REELS',
            video_url: videoUrl,
            caption,
            access_token: tokenForIg,
          }),
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
