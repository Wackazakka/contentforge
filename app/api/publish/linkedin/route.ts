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

    const isOrg = /^\d+$/.test(linkedinAccountId)
    const authorUrn = isOrg
      ? `urn:li:organization:${linkedinAccountId}`
      : `urn:li:person:${linkedinAccountId}`

    // For articles: prepend title to caption; for video: use caption as-is
    const text =
      contentType === 'article' && articleTitle
        ? `${articleTitle}\n\n${caption || articleContent?.slice(0, 2500) || ''}`
        : caption || ''

    let assetUrn: string | null = null

    if (contentType === 'video' && videoUrl) {
      // Step 1: Register upload with LinkedIn
      const registerRes = await fetch('https://api.linkedin.com/v2/assets?action=registerUpload', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${conn.access_token}`,
          'Content-Type': 'application/json',
          'X-Restli-Protocol-Version': '2.0.0',
        },
        body: JSON.stringify({
          registerUploadRequest: {
            recipes: ['urn:li:digitalmediaRecipe:feedshare-video'],
            owner: authorUrn,
            serviceRelationships: [{ relationshipType: 'OWNER', identifier: 'urn:li:userGeneratedContent' }],
          },
        }),
      })
      const registerData = await registerRes.json()
      console.log('[publish/linkedin] Register upload response:', JSON.stringify(registerData))

      const uploadUrl = registerData.value?.uploadMechanism?.['com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest']?.uploadUrl
      assetUrn = registerData.value?.asset

      if (!uploadUrl || !assetUrn) {
        return NextResponse.json({ success: false, error: 'LinkedIn video registration failed: ' + JSON.stringify(registerData) })
      }

      // Step 2: Download video from R2 and upload to LinkedIn
      const videoRes = await fetch(videoUrl)
      if (!videoRes.ok) {
        return NextResponse.json({ success: false, error: `Failed to fetch video from R2: ${videoRes.status}` })
      }
      const videoBuffer = await videoRes.arrayBuffer()

      const uploadRes = await fetch(uploadUrl, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${conn.access_token}`,
          'Content-Type': 'application/octet-stream',
        },
        body: videoBuffer,
      })
      console.log('[publish/linkedin] Video upload status:', uploadRes.status)
      if (!uploadRes.ok) {
        const errText = await uploadRes.text()
        return NextResponse.json({ success: false, error: `LinkedIn video upload failed: ${uploadRes.status} ${errText}` })
      }
    }

    const postBody: any = {
      author: authorUrn,
      lifecycleState: 'PUBLISHED',
      specificContent: {
        'com.linkedin.ugc.ShareContent': {
          shareCommentary: { text: text.slice(0, 3000) },
          shareMediaCategory: assetUrn ? 'VIDEO' : 'NONE',
          ...(assetUrn && { media: [{ status: 'READY', media: assetUrn }] }),
        },
      },
      visibility: {
        'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC',
      },
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
