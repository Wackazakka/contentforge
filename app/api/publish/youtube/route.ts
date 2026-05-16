import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(request: Request) {
  try {
    const { youtubeChannelId, videoUrl, caption, title, draftId, productId, userId } = await request.json()

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const { data: conn } = await supabase
      .from('social_connections')
      .select('access_token, page_name')
      .eq('page_id', youtubeChannelId)
      .eq('platform', 'youtube')
      .single()

    if (!conn) {
      return NextResponse.json({ success: false, error: 'YouTube channel not found' }, { status: 404 })
    }

    const videoTitle = (title || caption || 'Untitled').slice(0, 100)
    const videoDescription = caption?.slice(0, 5000) || ''

    // Step 1: Initiate resumable upload
    const initRes = await fetch(
      'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${conn.access_token}`,
          'Content-Type': 'application/json',
          'X-Upload-Content-Type': 'video/mp4',
        },
        body: JSON.stringify({
          snippet: {
            title: videoTitle,
            description: videoDescription,
            categoryId: '22', // People & Blogs
          },
          status: {
            privacyStatus: 'public',
          },
        }),
      }
    )

    if (!initRes.ok) {
      const errText = await initRes.text()
      console.error('[publish/youtube] Init failed:', initRes.status, errText)
      return NextResponse.json({ success: false, error: `YouTube init failed: ${initRes.status} ${errText}` })
    }

    const uploadUrl = initRes.headers.get('Location')
    if (!uploadUrl) {
      return NextResponse.json({ success: false, error: 'No upload URL returned from YouTube' })
    }

    console.log('[publish/youtube] Got upload URL, fetching video from R2')

    // Step 2: Fetch video from R2
    const videoRes = await fetch(videoUrl)
    if (!videoRes.ok) {
      return NextResponse.json({ success: false, error: `Failed to fetch video from R2: ${videoRes.status}` })
    }
    const videoBuffer = await videoRes.arrayBuffer()

    // Step 3: Upload video to YouTube
    const uploadRes = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${conn.access_token}`,
        'Content-Type': 'video/mp4',
        'Content-Length': String(videoBuffer.byteLength),
      },
      body: videoBuffer,
    })

    console.log('[publish/youtube] Upload status:', uploadRes.status)

    if (uploadRes.status !== 200 && uploadRes.status !== 201) {
      const errText = await uploadRes.text()
      return NextResponse.json({ success: false, error: `YouTube upload failed: ${uploadRes.status} ${errText}` })
    }

    const uploadData = await uploadRes.json()
    const videoId = uploadData.id

    console.log('[publish/youtube] ✅ Uploaded, videoId:', videoId)

    await supabase.from('publications').insert({
      user_id: userId,
      product_id: productId || null,
      draft_id: draftId || null,
      platform: 'youtube',
      page_id: youtubeChannelId,
      page_name: conn.page_name,
      post_id: videoId,
      caption: caption?.slice(0, 500),
      status: 'published',
    })

    return NextResponse.json({ success: true, video_id: videoId })
  } catch (err: any) {
    console.error('[publish/youtube] Error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
