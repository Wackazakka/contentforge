import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { finishPendingPublications } from '@/lib/instagramPublish'

async function runCron(request?: NextRequest) {
  // Allow internal Netlify scheduler (no secret) or requests with the correct secret
  const secret = process.env.CRON_SECRET
  if (secret && request) {
    const provided =
      request.headers.get('x-cron-secret') ||
      new URL(request.url).searchParams.get('secret')
    if (provided !== secret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Instagram-rader som staar som 'processing' (containeren er opprettet,
  // mediet prosesseres hos Meta) fullfoeres her -- ogsaa de der brukeren
  // lukket fanen foer klienten rakk aa polle ferdig. Sjekkes foer de
  // planlagte postene, saa ingen rad blir hengende til neste kjoering.
  let finished: Awaited<ReturnType<typeof finishPendingPublications>> = []
  try {
    finished = await finishPendingPublications(supabase, {})
    if (finished.length) console.log('[cron] pending instagram publications:', JSON.stringify(finished))
  } catch (err) {
    console.error('[cron] Could not finish pending publications:', err)
  }

  const { data: due, error } = await supabase
    .from('scheduled_publications')
    .select('*')
    .lte('scheduled_at', new Date().toISOString())

  if (error) {
    console.error('[cron] Failed to fetch scheduled publications:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (!due || due.length === 0) {
    return NextResponse.json({ published: 0, finished })
  }

  console.log(`[cron] Found ${due.length} post(s) due for publishing`)

  const baseUrl = 'https://contentforge-610.netlify.app'
  const results = []

  for (const post of due) {
    const { id, platform, content_type, page_id, caption, draft_id, job_id, user_id, production_id, as_reel } = post

    // Guard: skip posts with missing critical data
    if (!page_id) {
      console.error(`[cron] Post ${id}: missing page_id, skipping`)
      await supabase.from('scheduled_publications').delete().eq('id', id)
      results.push({ id, success: false, error: 'missing page_id' })
      continue
    }
    // Instagram: publish-ruta oppretter containeren og logger en
    // 'processing'-rad i publications; finishPendingPublications (oeverst i
    // hver kjoering) publiserer naar Meta er ferdig. Den planlagte raden er
    // dermed gjort med en gang containeren finnes.
    if (platform === 'instagram' && (content_type === 'video' || content_type === 'article')) {
      const videoUrl = content_type === 'video' && job_id ? `${process.env.NEXT_PUBLIC_R2_URL}/videos/${job_id}/output.mp4` : null
      let imageUrl: string | null = null
      let igCaption = caption

      if (content_type === 'video' && !videoUrl) {
        console.error(`[cron] Post ${id}: instagram video has no job_id`)
        await supabase.from('scheduled_publications').delete().eq('id', id)
        results.push({ id, success: false, error: 'missing job_id' })
        continue
      }

      if (content_type === 'article') {
        const { data: article } = await supabase
          .from('articles')
          .select('title, content, image_urls')
          .eq('id', draft_id)
          .single()
        if (!article || !article.image_urls?.length) {
          console.error(`[cron] Post ${id}: instagram article missing or has no image`)
          await supabase.from('scheduled_publications').delete().eq('id', id)
          results.push({ id, success: false, error: 'article missing or has no image' })
          continue
        }
        imageUrl = article.image_urls[0] as string
        // IG-caption: tittel + tekst; CTA-markøren fjernes og lenker kortes til
        // domenet — URL-er er ikke klikkbare i Instagram-captions uansett.
        igCaption = `${article.title}\n\n${(article.content as string)
          .replace('\n\n---CTA---\n', '\n\n')
          .replace(/https?:\/\/([^/\s?]+)[^\s]*/g, '$1')}`
      }

      try {
        console.log(`[cron] Instagram post ${id}: creating container`)
        const startRes = await fetch(`${baseUrl}/api/publish/instagram`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pageIds: [page_id], videoUrl, imageUrl, caption: igCaption, contentType: content_type, draftId: draft_id, productId: production_id, userId: user_id }),
        })
        const startData = await startRes.json()
        const jobInfo = startData.results?.[0]
        if (!jobInfo?.publicationId) {
          const err = jobInfo?.error || startData.error || 'Failed to create container'
          console.error(`[cron] Instagram post ${id}: container creation failed:`, err)
          await supabase.from('scheduled_publications').delete().eq('id', id)
          results.push({ id, success: false, error: err })
          continue
        }
        // Raden i publications baerer tilstanden videre; den planlagte er ferdig.
        await supabase.from('scheduled_publications').delete().eq('id', id)
        console.log(`[cron] Instagram post ${id}: container ${jobInfo.containerId} created, publication ${jobInfo.publicationId} pending`)
        results.push({ id, success: false, pending: true, publicationId: jobInfo.publicationId })
      } catch (err) {
        console.error(`[cron] Instagram post ${id} error:`, err)
        results.push({ id, success: false, error: String(err) })
      }
      continue
    }

    try {
      const videoUrl = job_id
        ? `${process.env.NEXT_PUBLIC_R2_URL}/videos/${job_id}/output.mp4`
        : null

      let publishResult: any = null

      if (content_type === 'video') {
        if (!videoUrl) {
          console.error(`[cron] Post ${id}: video post has no job_id`)
          results.push({ id, success: false, error: 'video post missing job_id' })
          await supabase.from('scheduled_publications').delete().eq('id', id)
          continue
        }

        if (platform === 'tiktok') {
          const res = await fetch(`${baseUrl}/api/publish/tiktok`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              tiktokAccountId: page_id,
              videoUrl,
              caption,
              draftId: draft_id,
              productId: production_id,
              userId: user_id,
            }),
          })
          publishResult = await res.json()
        } else if (platform === 'linkedin') {
          const res = await fetch(`${baseUrl}/api/publish/linkedin`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              linkedinAccountId: page_id,
              contentType: 'video',
              videoUrl,
              caption,
              draftId: draft_id,
              productId: production_id,
              userId: user_id,
            }),
          })
          publishResult = await res.json()
        } else if (platform === 'youtube') {
          const res = await fetch(`${baseUrl}/api/publish/youtube`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              youtubeChannelId: page_id,
              videoUrl,
              caption,
              draftId: draft_id,
              productId: production_id,
              userId: user_id,
            }),
          })
          publishResult = await res.json()
        } else if (platform === 'x') {
          const res = await fetch(`${baseUrl}/api/publish/x`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              xAccountId: page_id,
              caption,
              contentType: 'video',
              draftId: draft_id,
              productId: production_id,
              userId: user_id,
            }),
          })
          publishResult = await res.json()
        } else {
          const res = await fetch(`${baseUrl}/api/publish/facebook`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              pageIds: [page_id],
              videoUrl,
              caption,
              draftId: draft_id,
              productId: production_id,
              userId: user_id,
              pages: {},
              asReel: as_reel ?? false,
            }),
          })
          publishResult = await res.json()
        }

      } else if (content_type === 'article') {
        if (!draft_id) {
          console.error(`[cron] Post ${id}: article post has no draft_id`)
          results.push({ id, success: false, error: 'article post missing draft_id' })
          await supabase.from('scheduled_publications').delete().eq('id', id)
          continue
        }

        const { data: article } = await supabase
          .from('articles')
          .select('title, content')
          .eq('id', draft_id)
          .single()

        if (!article) {
          console.error(`[cron] Post ${id}: article ${draft_id} not found`)
          results.push({ id, success: false, error: 'article not found' })
          await supabase.from('scheduled_publications').delete().eq('id', id)
          continue
        }

        if (platform === 'linkedin') {
          const res = await fetch(`${baseUrl}/api/publish/linkedin`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              linkedinAccountId: page_id,
              contentType: 'article',
              articleTitle: article.title,
              articleContent: article.content,
              caption,
              draftId: draft_id,
              productId: production_id,
              userId: user_id,
            }),
          })
          publishResult = await res.json()
        } else if (platform === 'x') {
          const res = await fetch(`${baseUrl}/api/publish/x`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              xAccountId: page_id,
              caption,
              articleTitle: article.title,
              articleContent: article.content,
              contentType: 'article',
              draftId: draft_id,
              productId: production_id,
              userId: user_id,
            }),
          })
          publishResult = await res.json()
        } else {
          const res = await fetch(`${baseUrl}/api/publish/facebook-article`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              pageIds: [page_id],
              articleTitle: article.title,
              articleContent: article.content,
              articleId: draft_id,
              productId: production_id,
              userId: user_id,
              pages: {},
            }),
          })
          publishResult = await res.json()
        }
      } else {
        console.error(`[cron] Post ${id}: unknown content_type "${content_type}"`)
        results.push({ id, success: false, error: `unknown content_type: ${content_type}` })
        await supabase.from('scheduled_publications').delete().eq('id', id)
        continue
      }

      const success = publishResult?.success === true
      if (!success) {
        console.error(`[cron] Post ${id} FAILED:`, JSON.stringify(publishResult))
      } else {
        console.log(`[cron] Post ${id}: published successfully`)
      }

      await supabase.from('scheduled_publications').delete().eq('id', id)
      results.push({ id, success, result: publishResult })

    } catch (err) {
      console.error(`[cron] Error publishing post ${post.id}:`, err)
      results.push({ id: post.id, success: false, error: String(err) })
      await supabase.from('scheduled_publications').delete().eq('id', post.id)
    }
  }

  const publishedCount = results.filter((r) => r.success).length
  console.log(`[cron] Done: ${publishedCount}/${results.length} published`)
  return NextResponse.json({ published: publishedCount, results, finished })
}

export async function POST(request: NextRequest) { return runCron(request) }
export async function GET(request: NextRequest) { return runCron(request) }
