import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(request: Request) {
  try {
    const { pageIds, articleContent, articleTitle, draftId, productId, userId, pages } = await request.json()

    if (!pageIds || !Array.isArray(pageIds) || pageIds.length === 0) {
      return NextResponse.json({ error: 'No page IDs provided' }, { status: 400 })
    }

    if (!articleContent || !articleTitle) {
      return NextResponse.json({ error: 'Missing articleContent or articleTitle' }, { status: 400 })
    }

    console.log('[publish/facebook-article] Publishing article to pages:', pageIds)
    console.log('[publish/facebook-article] Article title:', articleTitle)

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const results = []

    for (const pageId of pageIds) {
      try {
        console.log('[publish/facebook-article] Fetching access token for page:', pageId)

        // Hent page access token
        const { data: conn, error } = await supabase
          .from('social_connections')
          .select('access_token, page_name')
          .eq('page_id', pageId)
          .single()

        if (error || !conn) {
          console.error('[publish/facebook-article] Failed to fetch token for page:', pageId, error)
          results.push({ pageId, success: false, error: 'Token not found' })
          continue
        }

        console.log('[publish/facebook-article] Posting article to page:', pageId)

        // Post article to Facebook feed
        const postContent = `${articleTitle}\n\n${articleContent}`
        
        const res = await fetch(`https://graph.facebook.com/v19.0/${pageId}/feed`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: postContent,
            access_token: conn.access_token,
          }),
        })

        const data = await res.json()

        if (data.error) {
          console.error('[publish/facebook-article] Facebook error for page:', pageId, data.error)
          results.push({ pageId, success: false, error: data.error.message })
        } else {
          console.log('[publish/facebook-article] Successfully posted to page:', pageId)

          // Lagre i publications
          const pageName = pages?.[pageId] || conn.page_name
          await supabase.from('publications').insert({
            user_id: userId,
            product_id: productId,
            draft_id: draftId,
            platform: 'facebook',
            page_id: pageId,
            page_name: pageName,
            post_id: data.id,
            caption: articleTitle,
            video_url: null,
            content_type: 'article',
            status: 'published',
          })

          results.push({ pageId, success: true, post_id: data.id })
        }
      } catch (err) {
        console.error('[publish/facebook-article] Error posting to page:', pageId, err)
        results.push({ pageId, success: false, error: String(err) })
      }
    }

    const allSuccess = results.every((r) => r.success)
    console.log('[publish/facebook-article] Results:', results)

    return NextResponse.json({ success: allSuccess, results })
  } catch (err: any) {
    console.error('[publish/facebook-article] Error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
