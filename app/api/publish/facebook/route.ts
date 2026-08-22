import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

// pub-*.r2.dev er Cloudflares DEV-domene — ratebegrenset («development
// purposes only»). Facebooks henting av videoen derfra tok 2+ minutter og
// feilet når dagens kvote var brukt opp (22/8: to publiseringer stoppet).
// Løsning: gi Facebook en presignert S3-URL rett mot R2 i stedet — målt
// 0,6 s for samme fil. Kun intern omskriving; lagrede URL-er røres ikke.
const R2_DEV_HOST = 'pub-5dcdfe9305a740febc87568c9ccb40a6.r2.dev'

async function fbHentbarUrl(videoUrl: string): Promise<string> {
  try {
    const u = new URL(videoUrl)
    if (u.hostname !== R2_DEV_HOST) return videoUrl
    const { R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME } = process.env
    if (!R2_ENDPOINT || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET_NAME) return videoUrl
    const key = decodeURIComponent(u.pathname.replace(/^\//, ''))
    const r2 = new S3Client({
      region: 'auto',
      endpoint: R2_ENDPOINT,
      credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY },
    })
    const signed = await getSignedUrl(r2, new GetObjectCommand({ Bucket: R2_BUCKET_NAME, Key: key }), {
      expiresIn: 3600,
    })
    console.log('[publish/facebook] Omskrev dev-URL til presignert R2-URL for', key)
    return signed
  } catch (err) {
    console.error('[publish/facebook] Presign feilet, bruker original URL:', err)
    return videoUrl
  }
}

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

    // URL-en Facebook faktisk henter fila fra (presignert hvis dev-domene).
    // publications-raden beholder den varige originale URL-en.
    const fetchUrl = await fbHentbarUrl(videoUrl)

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const results = []

    for (const pageId of pageIds) {
      try {
        // Hent page access token. Flere brukere kan ha koblet SAMME side
        // (én rad per bruker) — .single() på page_id alene ga PGRST116
        // («3 rows») og dermed «Token not found» så fort side nummer to
        // ble koblet av noen andre. Scope til brukeren når vi har den,
        // og ta nyeste rad ellers.
        let connQuery = supabase
          .from('social_connections')
          .select('*')
          .eq('page_id', pageId)
          .eq('platform', 'facebook')
        if (userId) connQuery = connQuery.eq('user_id', userId)
        const { data: conn, error } = await connQuery
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()

        if (error || !conn) {
          console.error('[publish/facebook] Failed to fetch token for page:', pageId, error)
          results.push({ pageId, success: false, error: 'Token not found' })
          continue
        }

        let postId: string

        if (asReel) {
          console.log('[publish/facebook] Publishing as Reel to page:', pageId)
          postId = await publishFacebookReel(pageId, fetchUrl, captionText, conn.access_token)
        } else {
          console.log('[publish/facebook] Posting video to page:', pageId)
          const res = await fetch(`https://graph.facebook.com/v19.0/${pageId}/videos`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              file_url: fetchUrl,
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
