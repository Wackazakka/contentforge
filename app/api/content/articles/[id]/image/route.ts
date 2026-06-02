import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

export const maxDuration = 30

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()

    const supabase = createClient(SUPABASE_URL || '', SUPABASE_SERVICE_ROLE_KEY || '')

    // Path 1: regenerate via background function
    if (body.regenerate) {
      const { imageStyle, topic, productId, logoUrl } = body
      if (!topic || !productId) {
        return NextResponse.json(
          { error: 'Missing topic or productId for regenerate' },
          { status: 400 }
        )
      }

      const SITE_URL =
        process.env.NEXT_PUBLIC_SITE_URL || 'https://contentforge-610.netlify.app'

      // Fire-and-forget — DO NOT await. A Netlify Background Function holds the
      // connection until the (slow, high-quality) image is done, which exceeds
      // this route's maxDuration and makes it time out / error. The working
      // produce/article route also fires without awaiting.
      console.log(`[article-image-patch] Triggering bg function for article ${id} (style=${imageStyle || 'tech'})`)
      fetch(SITE_URL + '/.netlify/functions/generate-image-background', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          articleId: id,
          topic,
          productId,
          logoUrl: logoUrl || null,
          imageStyle: imageStyle || 'tech',
        }),
      }).catch((e) => console.error('[article-image-patch] bg trigger fetch failed:', e))

      return NextResponse.json({
        success: true,
        message: 'Generating new image...',
      })
    }

    // Path 2: direct swap to an existing imageUrl
    if (body.imageUrl && typeof body.imageUrl === 'string') {
      const { error } = await supabase
        .from('articles')
        .update({ image_urls: [body.imageUrl] })
        .eq('id', id)

      if (error) {
        console.error('[article-image-patch] Supabase update failed:', error)
        return NextResponse.json(
          { error: 'Failed to update article' },
          { status: 500 }
        )
      }

      return NextResponse.json({ success: true, imageUrl: body.imageUrl })
    }

    return NextResponse.json(
      { error: 'Body must contain either { regenerate: true, ... } or { imageUrl }' },
      { status: 400 }
    )
  } catch (error) {
    console.error('[article-image-patch] Error:', error)
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : 'Failed to update article image',
      },
      { status: 500 }
    )
  }
}
