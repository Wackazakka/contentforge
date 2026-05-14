import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(request: Request) {
  try {
    const { pageIds, articleContent, articleTitle, articleId, draftId, productId, userId, pages } = await request.json()

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

    // Fetch article image, fall back to product logo
    let imageUrl: string | undefined = undefined
    if (articleId) {
      console.log('[publish/facebook-article] Fetching article image_urls for:', articleId)
      const { data: article, error: articleError } = await supabase
        .from('articles')
        .select('image_urls')
        .eq('id', articleId)
        .single()

      if (articleError) {
        console.warn('[publish/facebook-article] Failed to fetch article image_urls:', articleError)
      } else if (article?.image_urls && article.image_urls.length > 0) {
        imageUrl = article.image_urls[0] as string
        console.log('[publish/facebook-article] Article has image:', imageUrl.substring(0, 50) + '...')
      } else {
        console.log('[publish/facebook-article] Article has no image, checking product logo...')
      }
    }

    // Fall back to product logo if no article image
    if (!imageUrl && productId) {
      const { data: profile } = await supabase
        .from('product_profiles')
        .select('logo_url')
        .eq('product_id', productId)
        .maybeSingle()
      if (profile?.logo_url) {
        imageUrl = profile.logo_url
        console.log('[publish/facebook-article] Using product logo as image')
      }
    }

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

        // Replace internal CTA marker with a visual text separator for Facebook
        const cleanedContent = articleContent.replace('\n\n---CTA---\n', '\n\n― ― ―\n\n')
        const postContent = `${articleTitle}\n\n${cleanedContent}`
        let postRes, postData, postId

        if (imageUrl) {
          // Post with image using /{page_id}/photos endpoint
          console.log('[publish/facebook-article] Posting with image to page:', pageId)
          postRes = await fetch(`https://graph.facebook.com/v19.0/${pageId}/photos`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              url: imageUrl,
              caption: postContent,
              access_token: conn.access_token,
            }),
          })
          postData = await postRes.json()
          postId = postData.id
        } else {
          // Post as text only using /{page_id}/feed endpoint
          console.log('[publish/facebook-article] Posting as text post to page:', pageId)
          postRes = await fetch(`https://graph.facebook.com/v19.0/${pageId}/feed`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              message: postContent,
              access_token: conn.access_token,
            }),
          })
          postData = await postRes.json()
          postId = postData.id
        }

        if (postData.error) {
          console.error('[publish/facebook-article] Facebook error for page:', pageId, postData.error)
          results.push({ pageId, success: false, error: postData.error.message })
        } else {
          console.log('[publish/facebook-article] Successfully posted to page:', pageId, 'post_id:', postId)

          // Lagre i publications
          const pageName = pages?.[pageId] || conn.page_name
          console.log('[publish/facebook-article] Saving to publications table for page:', pageId)
          const { error: publishError } = await supabase.from('publications').insert({
            user_id: userId,
            product_id: productId,
            draft_id: null, // Articles don't have a draft_id (unlike videos)
            platform: 'facebook',
            page_id: pageId,
            page_name: pageName,
            post_id: postId || '',
            caption: articleTitle,
            video_url: imageUrl ? imageUrl : null,
            content_type: 'article',
            status: 'published',
          })

          if (publishError) {
            console.error('[publish/facebook-article] Failed to save publication for page:', pageId, publishError)
            results.push({ pageId, success: false, error: `Published but failed to record: ${publishError.message}` })
          } else {
            console.log('[publish/facebook-article] ✅ Publication saved for page:', pageId)
            results.push({ pageId, success: true, post_id: postId })
          }
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
