import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const MAX_TWEET_LENGTH = 280
const CHUNK_SIZE = 5 * 1024 * 1024 // 5MB

async function uploadVideoToX(videoUrl: string, accessToken: string): Promise<string> {
  // Fetch video from R2
  const videoRes = await fetch(videoUrl)
  if (!videoRes.ok) throw new Error(`Failed to fetch video: ${videoRes.status}`)
  const videoBuffer = await videoRes.arrayBuffer()
  const totalBytes = videoBuffer.byteLength

  const authHeader = `Bearer ${accessToken}`

  // INIT
  const initRes = await fetch(
    `https://upload.twitter.com/1.1/media/upload.json?command=INIT&media_type=video%2Fmp4&total_bytes=${totalBytes}&media_category=tweet_video`,
    { method: 'POST', headers: { Authorization: authHeader } }
  )
  const initData = await initRes.json()
  if (!initData.media_id_string) {
    throw new Error(`INIT failed: ${JSON.stringify(initData)}`)
  }
  const mediaId = initData.media_id_string

  // APPEND chunks
  const bytes = new Uint8Array(videoBuffer)
  let segmentIndex = 0
  for (let offset = 0; offset < totalBytes; offset += CHUNK_SIZE) {
    const chunk = bytes.slice(offset, offset + CHUNK_SIZE)
    const form = new FormData()
    form.append('command', 'APPEND')
    form.append('media_id', mediaId)
    form.append('segment_index', String(segmentIndex))
    form.append('media', new Blob([chunk], { type: 'video/mp4' }))

    const appendRes = await fetch('https://upload.twitter.com/1.1/media/upload.json', {
      method: 'POST',
      headers: { Authorization: authHeader },
      body: form,
    })
    if (!appendRes.ok) {
      const err = await appendRes.text()
      throw new Error(`APPEND ${segmentIndex} failed: ${err}`)
    }
    segmentIndex++
  }

  // FINALIZE
  const finalizeRes = await fetch(
    `https://upload.twitter.com/1.1/media/upload.json?command=FINALIZE&media_id=${mediaId}`,
    { method: 'POST', headers: { Authorization: authHeader } }
  )
  const finalizeData = await finalizeRes.json()
  if (finalizeData.error) throw new Error(`FINALIZE failed: ${JSON.stringify(finalizeData)}`)

  // Poll STATUS if processing
  if (finalizeData.processing_info) {
    let state = finalizeData.processing_info.state
    let checkAfterSecs = finalizeData.processing_info.check_after_secs || 5

    while (state === 'pending' || state === 'in_progress') {
      await new Promise((r) => setTimeout(r, checkAfterSecs * 1000))
      const statusRes = await fetch(
        `https://upload.twitter.com/1.1/media/upload.json?command=STATUS&media_id=${mediaId}`,
        { headers: { Authorization: authHeader } }
      )
      const statusData = await statusRes.json()
      state = statusData.processing_info?.state
      checkAfterSecs = statusData.processing_info?.check_after_secs || 5
      if (state === 'failed') throw new Error(`Video processing failed: ${JSON.stringify(statusData)}`)
    }
  }

  return mediaId
}

export async function POST(request: Request) {
  try {
    const {
      xAccountId,
      caption,
      videoUrl,
      articleTitle,
      articleContent,
      contentType,
      draftId,
      productId,
      userId,
    } = await request.json()

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const { data: conn } = await supabase
      .from('social_connections')
      .select('access_token, page_name')
      .eq('page_id', xAccountId)
      .eq('platform', 'x')
      .single()

    if (!conn) {
      return NextResponse.json({ success: false, error: 'X-konto ikke funnet' }, { status: 404 })
    }

    // Build tweet text — for articles use the generated content, for video use caption
    let text: string
    if (contentType === 'article' && articleContent) {
      text = articleContent
    } else {
      text = caption || ''
    }
    if (text.length > MAX_TWEET_LENGTH) {
      text = text.slice(0, MAX_TWEET_LENGTH - 1) + '…'
    }

    const tweetBody: Record<string, any> = { text }

    // Upload video if present
    if (contentType === 'video' && videoUrl) {
      console.log('[publish/x] Uploading video:', videoUrl)
      const mediaId = await uploadVideoToX(videoUrl, conn.access_token)
      tweetBody.media = { media_ids: [mediaId] }
      console.log('[publish/x] Video uploaded, media_id:', mediaId)
    }

    console.log('[publish/x] Posting tweet for account:', xAccountId, 'token prefix:', conn.access_token.slice(0, 20))

    const tweetRes = await fetch('https://api.twitter.com/2/tweets', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${conn.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(tweetBody),
    })

    const tweetData = await tweetRes.json()
    console.log('[publish/x] Response status:', tweetRes.status, JSON.stringify(tweetData))

    if (!tweetData.data?.id) {
      const errMsg = tweetData.detail || tweetData.title || JSON.stringify(tweetData)
      console.error('[publish/x] Failed:', errMsg)
      return NextResponse.json({ success: false, error: errMsg })
    }

    const tweetId = tweetData.data.id

    await supabase.from('publications').insert({
      user_id: userId,
      product_id: productId || null,
      draft_id: draftId || null,
      platform: 'x',
      page_id: xAccountId,
      page_name: conn.page_name,
      post_id: tweetId,
      caption: text.slice(0, 500),
      status: 'published',
    })

    console.log('[publish/x] ✅ Published tweet:', tweetId)
    return NextResponse.json({ success: true, tweet_id: tweetId })
  } catch (err: any) {
    console.error('[publish/x] Error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
