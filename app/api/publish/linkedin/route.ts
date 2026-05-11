import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(request: Request) {
  try {
    const {
      linkedinAccountId,
      caption,
      articleTitle,
      articleContent,
      contentType,
      videoUrl,
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
      .eq('page_id', linkedinAccountId)
      .eq('platform', 'linkedin')
      .single()

    if (!conn) {
      return NextResponse.json({ success: false, error: 'LinkedIn-konto ikke funnet' }, { status: 404 })
    }

    const authorUrn = `urn:li:person:${linkedinAccountId}`

    // For articles: prepend title to caption; for video: use caption as-is
    const text =
      contentType === 'article' && articleTitle
        ? `${articleTitle}\n\n${caption || articleContent?.slice(0, 2500) || ''}`
        : caption || ''

    const postBody: any = {
      author: authorUrn,
      lifecycleState: 'PUBLISHED',
      specificContent: {
        'com.linkedin.ugc.ShareContent': {
          shareCommentary: { text: text.slice(0, 3000) },
          shareMediaCategory: 'NONE',
        },
      },
      visibility: {
        'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC',
      },
    }

    // If video: attach as media (LinkedIn video share)
    if (contentType === 'video' && videoUrl) {
      postBody.specificContent['com.linkedin.ugc.ShareContent'].shareMediaCategory = 'VIDEO'
      postBody.specificContent['com.linkedin.ugc.ShareContent'].media = [
        {
          status: 'READY',
          media: videoUrl,
        },
      ]
    }

    console.log('[publish/linkedin] Posting as:', authorUrn)

    const postRes = await fetch('https://api.linkedin.com/v2/ugcPosts', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${conn.access_token}`,
        'Content-Type': 'application/json',
        'X-Restli-Protocol-Version': '2.0.0',
      },
      body: JSON.stringify(postBody),
    })

    const postData = await postRes.json()
    console.log('[publish/linkedin] Response status:', postRes.status, JSON.stringify(postData))

    if (postRes.status !== 201) {
      const errMsg = postData.message || JSON.stringify(postData)
      console.error('[publish/linkedin] Failed:', errMsg)
      return NextResponse.json({ success: false, error: errMsg })
    }

    const postId = postData.id

    await supabase.from('publications').insert({
      user_id: userId,
      product_id: productId || null,
      draft_id: draftId || null,
      platform: 'linkedin',
      page_id: linkedinAccountId,
      page_name: conn.page_name,
      post_id: postId,
      caption: text.slice(0, 500),
      status: 'published',
    })

    console.log('[publish/linkedin] ✅ Published:', postId)
    return NextResponse.json({ success: true, post_id: postId })
  } catch (err: any) {
    console.error('[publish/linkedin] Error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
