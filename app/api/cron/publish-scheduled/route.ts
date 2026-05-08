import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const CRON_SECRET = process.env.CRON_SECRET

export async function POST(request: Request) {
  // Verify secret to prevent unauthorized triggering
  const auth = request.headers.get('authorization')
  if (CRON_SECRET && auth !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Fetch all due scheduled publications
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

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://contentforge-610.netlify.app'
  const results = []

  for (const post of due) {
    try {
      const { id, platform, content_type, page_id, caption, draft_id, job_id, user_id, production_id } = post

      // Build video URL from job_id if this is a video
      const videoUrl = job_id
        ? `${process.env.NEXT_PUBLIC_R2_URL || 'https://pub-' + process.env.CF_ACCOUNT_ID + '.r2.dev'}/videos/${job_id}/output.mp4`
        : null

      let publishResult: any = null

      if (content_type === 'video' && videoUrl) {
        const endpoint = platform === 'instagram'
          ? `${baseUrl}/api/publish/instagram`
          : `${baseUrl}/api/publish/facebook`

        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            pageIds: [page_id],
            videoUrl,
            caption: caption || '',
            draftId: draft_id,
            productId: production_id,
            userId: user_id,
            pages: {},
          }),
        })
        publishResult = await res.json()

      } else if (content_type === 'article' && draft_id) {
        // Fetch article content
        const { data: article } = await supabase
          .from('articles')
          .select('title, content')
          .eq('id', draft_id)
          .single()

        if (article) {
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
      }

      const success = publishResult?.success === true
      console.log(`[cron] Post ${id}: ${success ? 'published' : 'failed'}`, publishResult)

      // Delete from scheduled_publications regardless (avoid retry loops on permanent failures)
      await supabase.from('scheduled_publications').delete().eq('id', id)

      results.push({ id, success, result: publishResult })
    } catch (err) {
      console.error(`[cron] Error publishing post ${post.id}:`, err)
      results.push({ id: post.id, success: false, error: String(err) })
      // Still delete to avoid infinite retry on broken posts
      await supabase.from('scheduled_publications').delete().eq('id', post.id)
    }
  }

  return NextResponse.json({ published: results.filter((r) => r.success).length, results })
}
