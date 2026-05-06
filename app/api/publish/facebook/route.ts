import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(request: Request) {
  try {
    const { pageIds, videoUrl, caption } = await request.json()

    if (!pageIds || !Array.isArray(pageIds) || pageIds.length === 0) {
      return NextResponse.json({ error: 'No page IDs provided' }, { status: 400 })
    }

    if (!videoUrl || !caption) {
      return NextResponse.json({ error: 'Missing videoUrl or caption' }, { status: 400 })
    }

    console.log('[publish/facebook] videoUrl:', videoUrl)
    console.log('[publish/facebook] Publishing to pages:', pageIds)

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const results = []

    for (const pageId of pageIds) {
      try {
        console.log('[publish/facebook] Fetching access token for page:', pageId)

        // Hent page access token
        const { data: conn, error } = await supabase
          .from('social_connections')
          .select('access_token')
          .eq('page_id', pageId)
          .single()

        if (error || !conn) {
          console.error('[publish/facebook] Failed to fetch token for page:', pageId, error)
          results.push({ pageId, success: false, error: 'Token not found' })
          continue
        }

        console.log('[publish/facebook] Posting video to page:', pageId)

        // Post video til Facebook
        const res = await fetch(`https://graph.facebook.com/v19.0/${pageId}/videos`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            file_url: videoUrl,
            description: caption,
            access_token: conn.access_token,
          }),
        })

        const data = await res.json()

        if (data.error) {
          console.error('[publish/facebook] Facebook error for page:', pageId, data.error)
          results.push({ pageId, success: false, error: data.error.message })
        } else {
          console.log('[publish/facebook] Successfully posted to page:', pageId)
          results.push({ pageId, success: true, post_id: data.id })
        }
      } catch (err) {
        console.error('[publish/facebook] Error posting to page:', pageId, err)
        results.push({ pageId, success: false, error: String(err) })
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
