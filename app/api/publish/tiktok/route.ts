import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(request: Request) {
  try {
    const { tiktokAccountId, videoUrl, caption, draftId, productId, userId } = await request.json()

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const { data: conn } = await supabase
      .from('social_connections')
      .select('access_token, page_name')
      .eq('page_id', tiktokAccountId)
      .eq('platform', 'tiktok')
      .single()

    if (!conn) {
      return NextResponse.json({ success: false, error: 'TikTok connection not found' }, { status: 404 })
    }

    console.log('[publish/tiktok] Initiating video post for account:', tiktokAccountId)

    // Init video post (PULL_FROM_URL — TikTok fetches from our R2 URL)
    const initRes = await fetch('https://open.tiktokapis.com/v2/post/publish/video/init/', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${conn.access_token}`,
        'Content-Type': 'application/json; charset=UTF-8',
      },
      body: JSON.stringify({
        post_info: {
          title: caption.slice(0, 150),
          privacy_level: 'PUBLIC_TO_EVERYONE',
          disable_duet: false,
          disable_comment: false,
          disable_stitch: false,
          video_cover_timestamp_ms: 1000,
        },
        source_info: {
          source: 'PULL_FROM_URL',
          video_url: videoUrl,
        },
      }),
    })

    const initData = await initRes.json()
    console.log('[publish/tiktok] Init response:', JSON.stringify(initData))

    if (!initData.data?.publish_id) {
      const errMsg = initData.error?.message || JSON.stringify(initData)
      console.error('[publish/tiktok] Init failed:', errMsg)
      return NextResponse.json({ success: false, error: errMsg })
    }

    const publishId = initData.data.publish_id
    console.log('[publish/tiktok] publish_id:', publishId)

    // Poll status (max 20 attempts × 5s = 100s)
    let status = 'PROCESSING_UPLOAD'
    let attempts = 0
    while (attempts < 20 && ['PROCESSING_UPLOAD', 'PROCESSING_DOWNLOAD', 'SEND_BY_FILE_API'].includes(status)) {
      await new Promise((r) => setTimeout(r, 5000))
      const statusRes = await fetch('https://open.tiktokapis.com/v2/post/publish/status/fetch/', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${conn.access_token}`,
          'Content-Type': 'application/json; charset=UTF-8',
        },
        body: JSON.stringify({ publish_id: publishId }),
      })
      const statusData = await statusRes.json()
      status = statusData.data?.status || 'UNKNOWN'
      console.log(`[publish/tiktok] Status check ${attempts + 1}: ${status}`)
      attempts++

      if (status === 'PUBLISH_COMPLETE') break
      if (status === 'FAILED') {
        const failReason = statusData.data?.fail_reason || 'unknown'
        console.error('[publish/tiktok] Publish failed:', failReason)
        return NextResponse.json({ success: false, error: `TikTok publish failed: ${failReason}` })
      }
    }

    if (status !== 'PUBLISH_COMPLETE') {
      console.error('[publish/tiktok] Timed out, final status:', status)
      return NextResponse.json({ success: false, error: `TikTok processing timed out (status: ${status})` })
    }

    // Save publication record
    await supabase.from('publications').insert({
      user_id: userId,
      product_id: productId,
      draft_id: draftId,
      platform: 'tiktok',
      page_id: tiktokAccountId,
      page_name: conn.page_name,
      post_id: publishId,
      caption,
      video_url: videoUrl,
      status: 'published',
    })

    console.log('[publish/tiktok] ✅ Published successfully')
    return NextResponse.json({ success: true, publish_id: publishId })
  } catch (err: any) {
    console.error('[publish/tiktok] Error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
