import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(request: Request) {
  try {
    const { containerId, igAccountId, pageId, caption, draftId, productId, userId, pageName, videoUrl } = await request.json()

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // Re-fetch token from social_connections (never expose token to client).
    // Scope til brukeren: flere brukere kan ha koblet samme side, og
    // .single() på page_id alene ga da PGRST116 → «Connection not found».
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
      return NextResponse.json({ status: 'failed', error: 'Connection not found' })
    }

    const token = conn.user_access_token || conn.access_token

    const statusRes = await fetch(
      `https://graph.facebook.com/v21.0/${containerId}?fields=status_code&access_token=${token}`
    )
    const statusData = await statusRes.json()
    const statusCode = statusData.status_code

    console.log('[instagram/status] Container', containerId, 'status:', statusCode)

    if (statusCode === 'IN_PROGRESS') {
      return NextResponse.json({ status: 'processing' })
    }

    if (statusCode !== 'FINISHED') {
      return NextResponse.json({ status: 'failed', error: `Instagram processing failed: ${statusCode}` })
    }

    // Publish the container
    const publishRes = await fetch(`https://graph.facebook.com/v21.0/${igAccountId}/media_publish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        creation_id: containerId,
        access_token: token,
      }),
    })

    const publishData = await publishRes.json()

    if (!publishData.id) {
      console.error('[instagram/status] Publish failed:', publishData.error)
      return NextResponse.json({ status: 'failed', error: publishData.error?.message || 'Publish failed' })
    }

    console.log('[instagram/status] Published successfully:', publishData.id)

    await supabase.from('publications').insert({
      user_id: userId,
      product_id: productId,
      draft_id: draftId,
      platform: 'instagram',
      page_id: igAccountId,
      page_name: pageName || conn.page_name,
      post_id: publishData.id,
      caption,
      video_url: videoUrl,
      status: 'published',
    })

    return NextResponse.json({ status: 'published', postId: publishData.id })
  } catch (err: any) {
    console.error('[instagram/status] Error:', err)
    return NextResponse.json({ status: 'failed', error: err.message })
  }
}
