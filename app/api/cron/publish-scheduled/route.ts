import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

async function runCron() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: due, error } = await supabase
    .from('scheduled_publications')
    .select('*')
    .lte('scheduled_at', new Date().toISOString())

  if (error) {
    console.error('[cron] Failed to fetch scheduled publications:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (!due || due.length === 0) {
    return NextResponse.json({ published: 0 })
  }

  console.log(`[cron] Found ${due.length} post(s) due for publishing`)

  const baseUrl = 'https://contentforge-610.netlify.app'
  const results = []

  for (const post of due) {
    const { id, platform, content_type, page_id, caption, draft_id, job_id, user_id, production_id } = post

    // Guard: skip posts with missing critical data
    if (!page_id) {
      console.error(`[cron] Post ${id}: missing page_id, skipping`)
      await supabase.from('scheduled_publications').delete().eq('id', id)
      results.push({ id, success: false, error: 'missing page_id' })
      continue
    }
    if (!caption) {
      console.error(`[cron] Post ${id}: missing caption, skipping`)
      await supabase.from('scheduled_publications').delete().eq('id', id)
      results.push({ id, success: false, error: 'missing caption' })
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
        } else {
          const endpoint = platform === 'instagram'
            ? `${baseUrl}/api/publish/instagram`
            : `${baseUrl}/api/publish/facebook`

          const res = await fetch(endpoint, {
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
  return NextResponse.json({ published: publishedCount, results })
}

export async function POST() { return runCron() }
export async function GET() { return runCron() }
