import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Publish a video as a Facebook Reel via the 3-phase video_reels upload
// (start → hosted upload by file_url → finish/publish). Returns the reel video id.
async function publishFacebookReel(
  pageId: string,
  videoUrl: string,
  caption: string,
  accessToken: string
): Promise<string> {
  const base = `https://graph.facebook.com/v19.0/${pageId}/video_reels`

  // Phase 1 — start: reserve a video_id and get the upload URL
  const startRes = await fetch(base, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ upload_phase: 'start', access_token: accessToken }),
  })
  const startData = await startRes.json()
  if (startData.error || !startData.video_id) {
    throw new Error(startData.error?.message || 'Reel start-fase feilet')
  }
  const videoId: string = startData.video_id
  const uploadUrl: string =
    startData.upload_url || `https://rupload.facebook.com/video-upload/v19.0/${videoId}`

  // Phase 2 — upload: hosted upload, Facebook pulls the file from our R2 URL
  const upRes = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      Authorization: `OAuth ${accessToken}`,
      file_url: videoUrl,
    },
  })
  const upData = await upRes.json().catch(() => ({}))
  if (upData.error || upData.success === false) {
    throw new Error(upData.error?.message || 'Reel opplasting feilet')
  }

  // Phase 3 — finish: publish the reel with its caption
  const finishParams = new URLSearchParams({
    access_token: accessToken,
    upload_phase: 'finish',
    video_id: videoId,
    video_state: 'PUBLISHED',
    description: caption || '',
  })
  const finRes = await fetch(`${base}?${finishParams.toString()}`, { method: 'POST' })
  const finData = await finRes.json()
  if (finData.error || finData.success === false) {
    throw new Error(finData.error?.message || 'Reel finish-fase feilet')
  }
  return videoId
}

export async function POST(request: Request) {
  try {
    const { pageIds, videoUrl, caption, draftId, productId, userId, pages, asReel } = await request.json()

    if (!pageIds || !Array.isArray(pageIds) || pageIds.length === 0) {
      return NextResponse.json({ error: 'No page IDs provided' }, { status: 400 })
    }

    if (!videoUrl) {
      return NextResponse.json({ error: 'Missing videoUrl' }, { status: 400 })
    }
    const captionText = caption || '' // bildetekst er valgfritt

    console.log('[publish/facebook] videoUrl:', videoUrl, '| asReel:', !!asReel)
    console.log('[publish/facebook] Publishing to pages:', pageIds)

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const results = []

    for (const pageId of pageIds) {
      try {
        // Hent page access token
        const { data: conn, error } = await supabase
          .from('social_connections')
          .select('*')
          .eq('page_id', pageId)
          .single()

        if (error || !conn) {
          console.error('[publish/facebook] Failed to fetch token for page:', pageId, error)
          results.push({ pageId, success: false, error: 'Token not found' })
          continue
        }

        let postId: string

        if (asReel) {
          console.log('[publish/facebook] Publishing as Reel to page:', pageId)
          postId = await publishFacebookReel(pageId, videoUrl, captionText, conn.access_token)
        } else {
          console.log('[publish/facebook] Posting video to page:', pageId)
          const res = await fetch(`https://graph.facebook.com/v19.0/${pageId}/videos`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              file_url: videoUrl,
              description: captionText,
              access_token: conn.access_token,
            }),
          })
          const data = await res.json()
          if (data.error) {
            console.error('[publish/facebook] Facebook error for page:', pageId, data.error)
            results.push({ pageId, success: false, error: data.error.message })
            continue
          }
          postId = data.id
        }

        console.log('[publish/facebook] Successfully published to page:', pageId, '| id:', postId)

        // Lagre publisering i Supabase
        if (draftId && productId && userId) {
          const pageName = pages?.[pageId] || conn.page_name
          await supabase.from('publications').insert({
            user_id: userId,
            product_id: productId,
            draft_id: draftId,
            platform: 'facebook',
            page_id: pageId,
            page_name: pageName,
            post_id: postId,
            caption: captionText,
            video_url: videoUrl,
            status: 'published',
          })
          console.log('[publish/facebook] Publication saved to database for page:', pageId)
        }

        results.push({ pageId, success: true, post_id: postId, reel: !!asReel })
      } catch (err: any) {
        console.error('[publish/facebook] Error posting to page:', pageId, err)
        results.push({ pageId, success: false, error: err?.message || String(err) })
      }
    }

    const allSuccess = results.every((r) => r.success)
    console.log('[publish/facebook] Results:', results)

    return NextResponse.json({ success: allSuccess, results })
  } catch (err: any) {
    console.error('[publish/facebook] Error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
