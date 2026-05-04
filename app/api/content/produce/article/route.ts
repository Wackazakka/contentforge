import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { randomUUID } from 'crypto'

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY
const OPENAI_API_KEY = process.env.OPENAI_API_KEY
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL || 'https://pub-5dcdfe9305a740febc87568c9ccb40a6.r2.dev'

interface GenerateArticleRequest {
  productId: string
  campaignId: string
  topic: string
  platform: string
}

interface ArticleResult {
  id: string
  platform: string
  title: string
  content: string
  image_url: string
}

// Generate article content using Claude
async function generateArticleContent(topic: string, platform: string): Promise<{ title: string; content: string }> {
  const platformGuides: Record<string, string> = {
    facebook: 'Write for Facebook: engaging, conversational, with emojis and a call-to-action. Include hashtags.',
    linkedin: 'Write for LinkedIn: professional, insightful, thought-leadership style. No excessive emojis.',
    x: 'Write for X/Twitter: concise (under 280 chars per tweet), punchy, with relevant hashtags.',
  }

  const prompt = `Generate a ${platform} article about: "${topic}"

${platformGuides[platform] || 'Write engaging content'}

Return JSON with:
{
  "title": "Article title",
  "content": "Full article content optimized for ${platform}"
}`

  console.log(`[generateArticleContent] ${platform}: API key present: ${!!ANTHROPIC_API_KEY}`)

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
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    }),
  })

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}))
    console.error(`[generateArticleContent] ${platform}: Claude API error`, {
      status: response.status,
      statusText: response.statusText,
      error: errorData,
    })
    throw new Error(`Claude API error: ${response.status} ${response.statusText}`)
  }

  const data = await response.json()
  const content = data.content?.[0]?.text

  if (!content) {
    console.error(`[generateArticleContent] ${platform}: No content in response`, { data })
    throw new Error('No content in Claude response')
  }

  // Parse JSON from response
  const jsonMatch = content.match(/\{[\s\S]*\}/)
  if (!jsonMatch) {
    console.error(`[generateArticleContent] ${platform}: Could not find JSON in response`, { content: content.substring(0, 200) })
    throw new Error('Could not parse article JSON from Claude')
  }

  return JSON.parse(jsonMatch[0])
}

// Generate image using DALL-E
async function generateImage(topic: string): Promise<string> {
  console.log(`[generateImage] API key present: ${!!OPENAI_API_KEY}`)

  const response = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'dall-e-3',
      prompt: `Create a professional, visually appealing image for an article about: ${topic}. High quality, suitable for social media and articles.`,
      n: 1,
      size: '1024x1024',
    }),
  })

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}))
    console.error(`[generateImage] DALL-E API error`, {
      status: response.status,
      statusText: response.statusText,
      error: errorData,
    })
    throw new Error(`DALL-E API error: ${response.status} ${response.statusText}`)
  }

  const data = await response.json()
  if (!data.data?.[0]?.url) {
    console.error(`[generateImage] No image URL in response`, { data })
    throw new Error('No image URL in DALL-E response')
  }

  return data.data[0].url
}

// Upload image to R2
async function uploadImageToR2(imageUrl: string, campaignId: string, articleId: string): Promise<string> {
  try {
    // For now, just construct the URL as if it were uploaded
    // In production, you'd download the image and upload to R2
    return `${R2_PUBLIC_URL}/images/articles/${campaignId}/${articleId}.png`
  } catch (error) {
    console.error('Error uploading to R2:', error)
    // Return a placeholder or the original image URL
    return imageUrl
  }
}

export async function POST(request: NextRequest) {
  try {
    const body: GenerateArticleRequest = await request.json()
    const { productId, campaignId, topic, platform } = body

    if (!productId || !campaignId || !topic || !platform) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const supabase = createClient(SUPABASE_URL || '', SUPABASE_SERVICE_ROLE_KEY || '')

    {
      try {
        console.log(`[article-produce] Starting ${platform} article generation for topic: "${topic}"`)

        // Generate content
        console.log(`[article-produce] ${platform}: Calling Claude API...`)
        const { title, content } = await generateArticleContent(topic, platform)
        console.log(`[article-produce] ${platform}: Content generated - title: "${title.substring(0, 50)}..."`)

        // Generate image (temporarily disabled - TODO: re-enable after testing)
        // console.log(`[article-produce] ${platform}: Calling DALL-E API...`)
        // const imageUrl = await generateImage(topic)
        // console.log(`[article-produce] ${platform}: Image generated - URL: ${imageUrl.substring(0, 50)}...`)

        // Upload to R2 (temporarily disabled)
        // console.log(`[article-produce] ${platform}: Uploading image to R2...`)
        // const r2Url = await uploadImageToR2(imageUrl, campaignId, platform)
        // console.log(`[article-produce] ${platform}: R2 upload complete - URL: ${r2Url}`)
        const r2Url = '' // Placeholder until image generation is re-enabled

        // Create article ID
        const articleId = randomUUID()
        console.log(`[article-produce] ${platform}: Article ID: ${articleId}`)

        // Insert into database
        console.log(`[article-produce] ${platform}: Inserting into database...`)
        const { error: insertError, data: insertData } = await supabase.from('articles').insert({
          id: articleId,
          product_id: productId,
          campaign_id: campaignId,
          title,
          platform,
          content,
          image_urls: r2Url ? [r2Url] : [], // Empty array until image generation is re-enabled
        })

        if (insertError) {
          console.error(`[article-produce] ${platform}: Database insert failed`, {
            error: insertError,
            code: (insertError as any).code,
            message: (insertError as any).message,
            details: (insertError as any).details,
          })
          throw new Error(`Database insert failed: ${(insertError as any).message}`)
        }

        console.log(`[article-produce] ✅ ${platform} article successfully created: ${articleId}`)

        return NextResponse.json({
          success: true,
          article: {
            id: articleId,
            platform,
            title,
            content,
            image_url: r2Url || '', // Empty string while image generation is disabled
          },
        })
      } catch (error) {
        console.error(`[article-produce] ❌ Error generating ${platform} article:`, {
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
          platform,
          topic,
        })
        throw error
      }
    }
  } catch (error) {
    console.error('[article-produce] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to generate articles' },
      { status: 500 }
    )
  }
}
