import { NextRequest, NextResponse, after } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { randomUUID } from 'crypto'
import { checkAndDeductCredits } from '@/lib/credits'

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://contentforge-610.netlify.app'

// Validate UUID format
const isValidUuid = (str: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str)

// Article generation only needs Claude time (~5-10s)
export const maxDuration = 30

interface GenerateArticleRequest {
  productId: string
  campaignId: string
  topic: string
  platform: string
}

// Generate article content using Claude
async function generateArticleContent(
  topic: string,
  platform: string
): Promise<{ title: string; content: string }> {
  const platformGuides: Record<string, string> = {
    facebook:
      'Write for Facebook: engaging, conversational, with emojis and a call-to-action. Include hashtags.',
    linkedin:
      'Write for LinkedIn: professional, insightful, thought-leadership style. No excessive emojis. START WITH A STRONG OPENING SENTENCE that grabs attention - do not begin mid-sentence. Make the first sentence compelling and complete.',
    x: 'Write for X/Twitter: concise (under 280 chars per tweet), punchy, with relevant hashtags.',
  }

  const prompt = `Generate a ${platform} article about: "${topic}"

Write in the same language as the topic above. If the topic is in English, write in English. If it is in Norwegian, write in Norwegian. Match the language naturally.

${platformGuides[platform] || 'Write engaging content'}

Return JSON with:
{
  "title": "Article title",
  "content": "Full article content optimized for ${platform}"
}`

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY || '',
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    }),
  })

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}))
    throw new Error(`Claude API error: ${response.status} ${response.statusText} — ${JSON.stringify(errorData)}`)
  }

  const data = await response.json()
  const text = data.content?.[0]?.text
  if (!text) throw new Error('No content in Claude response')

  const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error('No JSON found in Claude response')

  return JSON.parse(jsonMatch[0])
}

export async function POST(request: NextRequest) {
  try {
    const body: GenerateArticleRequest & { userId?: string } = await request.json()
    const { productId, campaignId, topic, platform, userId } = body

    if (!productId || !campaignId || !topic || !platform) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    if (userId) {
      const credit = await checkAndDeductCredits(
        userId,
        'article_generation',
        `Artikkel — ${platform}: ${topic.slice(0, 50)}`
      )
      if (!credit.ok) {
        return NextResponse.json({ error: credit.error }, { status: 402 })
      }
    }

    const supabase = createClient(SUPABASE_URL || '', SUPABASE_SERVICE_ROLE_KEY || '')

    console.log(`[article-produce] Starting ${platform} article for: "${topic}"`)

    // Step 1: Generate article content with Claude (~5-10s)
    const { title, content } = await generateArticleContent(topic, platform)
    console.log(`[article-produce] ✅ Content ready: "${title.substring(0, 60)}..."`)

    // Step 2: Save article immediately (no image yet)
    const articleId = randomUUID()
    const { error: insertError } = await supabase.from('articles').insert({
      id: articleId,
      product_id: productId,
      campaign_id: isValidUuid(campaignId) ? campaignId : null,
      title,
      platform,
      content,
      image_urls: [],
    })

    if (insertError) {
      console.error(`[article-produce] DB insert failed`, insertError)
      throw new Error(`Database insert failed: ${(insertError as any).message}`)
    }

    console.log(`[article-produce] ✅ Article saved: ${articleId}`)

    // Step 3: Schedule image generation AFTER response is sent (bypasses CDN timeout)
    after(async () => {
      console.log(`[article-produce] [after] Generating image for article ${articleId}`)
      try {
        const imageRes = await fetch(`${SITE_URL}/api/content/generate-image`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ topic: title, productId }),
        })

        if (!imageRes.ok) {
          const err = await imageRes.json().catch(() => ({}))
          console.error(`[article-produce] [after] generate-image failed:`, err)
          return
        }

        const { imageUrl } = await imageRes.json()
        if (!imageUrl) {
          console.error(`[article-produce] [after] No imageUrl in response`)
          return
        }

        const supabaseAfter = createClient(SUPABASE_URL || '', SUPABASE_SERVICE_ROLE_KEY || '')
        const { error: updateError } = await supabaseAfter
          .from('articles')
          .update({ image_urls: [imageUrl] })
          .eq('id', articleId)

        if (updateError) {
          console.error(`[article-produce] [after] DB update failed:`, updateError)
        } else {
          console.log(`[article-produce] [after] ✅ Image set for article ${articleId}: ${imageUrl.substring(0, 60)}`)
        }
      } catch (err) {
        console.error(`[article-produce] [after] Unexpected error:`, err)
      }
    })

    // Step 4: Return article immediately — image will appear asynchronously
    return NextResponse.json({
      success: true,
      article: {
        id: articleId,
        platform,
        title,
        content,
        image_url: '',
      },
    })
  } catch (error) {
    console.error('[article-produce] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to generate article' },
      { status: 500 }
    )
  }
}
