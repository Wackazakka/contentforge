import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const MAX_TWEET_LENGTH = 280

export async function POST(request: Request) {
  try {
    const {
      xAccountId,
      caption,
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

    // Build tweet text — prepend title for articles, truncate to 280 chars
    let text = caption || ''
    if (contentType === 'article' && articleTitle && !text.startsWith(articleTitle)) {
      text = `${articleTitle}\n\n${text}`
    }
    if (text.length > MAX_TWEET_LENGTH) {
      text = text.slice(0, MAX_TWEET_LENGTH - 1) + '…'
    }

    console.log('[publish/x] Posting tweet for account:', xAccountId)

    const tweetRes = await fetch('https://api.twitter.com/2/tweets', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${conn.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ text }),
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
