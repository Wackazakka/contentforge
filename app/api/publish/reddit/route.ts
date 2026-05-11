import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(request: Request) {
  try {
    const {
      redditAccountId,
      subreddit,
      caption,
      articleTitle,
      articleContent,
      contentType,
      draftId,
      productId,
      userId,
    } = await request.json()

    if (!subreddit) {
      return NextResponse.json({ success: false, error: 'Subreddit mangler' }, { status: 400 })
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const { data: conn } = await supabase
      .from('social_connections')
      .select('access_token, page_name')
      .eq('page_id', redditAccountId)
      .eq('platform', 'reddit')
      .single()

    if (!conn) {
      return NextResponse.json({ success: false, error: 'Reddit-konto ikke funnet' }, { status: 404 })
    }

    const title = articleTitle || caption?.slice(0, 300) || 'CenterForge post'
    const text = contentType === 'article'
      ? `${caption ? caption + '\n\n' : ''}${articleContent || ''}`
      : caption || ''

    console.log('[publish/reddit] Posting to r/', subreddit)

    const submitRes = await fetch('https://oauth.reddit.com/api/submit', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${conn.access_token}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'CenterForge/1.0',
      },
      body: new URLSearchParams({
        api_type: 'json',
        kind: 'self',
        sr: subreddit.replace(/^r\//, ''),
        title: title.slice(0, 300),
        text: text.slice(0, 40000),
      }).toString(),
    })

    const submitData = await submitRes.json()
    console.log('[publish/reddit] Response:', JSON.stringify(submitData))

    const errors = submitData.json?.errors
    if (errors && errors.length > 0) {
      const errMsg = errors.map((e: string[]) => e[1]).join(', ')
      console.error('[publish/reddit] Errors:', errMsg)
      return NextResponse.json({ success: false, error: errMsg })
    }

    const postUrl = submitData.json?.data?.url
    const postId = submitData.json?.data?.id

    if (!postId) {
      return NextResponse.json({ success: false, error: 'Ingen post-ID returnert fra Reddit' })
    }

    await supabase.from('publications').insert({
      user_id: userId,
      product_id: productId || null,
      draft_id: draftId || null,
      platform: 'reddit',
      page_id: redditAccountId,
      page_name: `r/${subreddit.replace(/^r\//, '')}`,
      post_id: postId,
      caption: title.slice(0, 500),
      video_url: postUrl || null,
      status: 'published',
    })

    console.log('[publish/reddit] ✅ Published:', postUrl)
    return NextResponse.json({ success: true, post_id: postId, url: postUrl })
  } catch (err: any) {
    console.error('[publish/reddit] Error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
