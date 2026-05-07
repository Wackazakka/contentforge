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

        // Hent page og user access tokens
        const { data: conn } = await supabase
          .from('social_connections')
          .select('access_token, user_access_token, page_name')
          .eq('page_id', pageId)
          .single()

        if (!conn) {
          results.push({ pageId, success: false, error: 'Connection not found' })
          continue
        }

        // Steg 1: Hent Instagram Business Account ID
        // Bruk user_access_token for Instagram API (fallback til page token)
        const tokenForIg = conn.user_access_token || conn.access_token
        console.log('[publish/instagram] Using token type:', conn.user_access_token ? 'user_access_token' : 'page_access_token')
        const igRes = await fetch(
          `https://graph.facebook.com/v19.0/${pageId}?fields=instagram_business_account&access_token=${tokenForIg}`
        )
        const igData = await igRes.json()
        let igAccountId = igData.instagram_business_account?.id

        // Hardkodet fallback for SinglePicker App (New Page Experience)
        if (!igAccountId && pageId === '1104756536056684') {
          console.log('[publish/instagram] Using hardcoded Instagram account ID for SinglePicker App')
          igAccountId = '17841434830750460'
        }

        if (!igAccountId) {
          console.error('[publish/instagram] No Instagram account found for page:', pageId)
          results.push({ pageId, success: false, error: 'No Instagram account connected' })
          continue
        }

        console.log('[publish/instagram] Found Instagram account:', igAccountId)

        // Steg 2: Opprett media container (reels)
        const containerRes = await fetch(`https://graph.facebook.com/v19.0/${igAccountId}/media`, {
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
          console.error('[publish/instagram] Failed to create media container:', containerData.error)
          results.push({ pageId, success: false, error: containerData.error?.message || 'Failed to create media' })
          continue
        }

        console.log('[publish/instagram] Media container created:', containerData.id)

        // Vent på at video prosesseres (polling)
        let status = 'IN_PROGRESS'
        let attempts = 0
        while (status === 'IN_PROGRESS' && attempts < 30) {
          await new Promise((r) => setTimeout(r, 3000))
          const statusRes = await fetch(
            `https://graph.facebook.com/v19.0/${containerData.id}?fields=status_code&access_token=${tokenForIg}`
          )
          const statusData = await statusRes.json()
          status = statusData.status_code
          attempts++
          console.log('[publish/instagram] Media status check:', status, `(attempt ${attempts})`)
        }

        if (status !== 'FINISHED') {
          console.error('[publish/instagram] Video processing failed with status:', status)
          results.push({ pageId, success: false, error: `Video processing failed: ${status}` })
          continue
        }

        console.log('[publish/instagram] Video processing finished, publishing...')

        // Steg 3: Publiser containeren
        const publishRes = await fetch(`https://graph.facebook.com/v19.0/${igAccountId}/media_publish`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            creation_id: containerData.id,
            access_token: tokenForIg,
          }),
        })

        const publishData = await publishRes.json()

        if (publishData.id) {
          console.log('[publish/instagram] Successfully published to Instagram:', publishData.id)

          // Lagre i publications
          await supabase.from('publications').insert({
            user_id: userId,
            product_id: productId,
            draft_id: draftId,
            platform: 'instagram',
            page_id: igAccountId,
            page_name: conn.page_name,
            post_id: publishData.id,
            caption,
            video_url: videoUrl,
            status: 'published',
          })

          results.push({ pageId, success: true, post_id: publishData.id })
        } else {
          console.error('[publish/instagram] Publish failed:', publishData.error)
          results.push({ pageId, success: false, error: publishData.error?.message || 'Publish failed' })
        }
      } catch (err) {
        console.error('[publish/instagram] Error processing page:', pageId, err)
        results.push({ pageId, success: false, error: String(err) })
      }
    }

    const allSuccess = results.every((r) => r.success)
    return NextResponse.json({ success: allSuccess, results })
  } catch (err: any) {
    console.error('[publish/instagram] Error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
