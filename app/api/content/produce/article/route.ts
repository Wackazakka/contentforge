import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { v4 as uuidv4 } from 'uuid'

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY
const OPENAI_API_KEY = process.env.OPENAI_API_KEY
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL || 'https://pub-5dcdfe9305a740febc87568c9ccb40a6.r2.dev'

interface GenerateArticleRequest {
  productId: string
  campaignId: string
  topic: string
  platforms: string[]
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

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY || '',
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-3-5-sonnet-20241022',
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
    throw new Error(`Claude API error: ${response.statusText}`)
  }

  const data = await response.json()
  const content = data.content[0].text

  // Parse JSON from response
  const jsonMatch = content.match(/\{[\s\S]*\}/)
  if (!jsonMatch) {
    throw new Error('Could not parse article JSON from Claude')
  }

  return JSON.parse(jsonMatch[0])
}

// Generate image using DALL-E
async function generateImage(topic: string): Promise<string> {
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
    throw new Error(`DALL-E API error: ${response.statusText}`)
  }

  const data = await response.json()
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
    const { productId, campaignId, topic, platforms } = body

    if (!productId || !campaignId || !topic || !platforms || platforms.length === 0) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const supabase = createClient(SUPABASE_URL || '', SUPABASE_SERVICE_ROLE_KEY || '')
    const articles: ArticleResult[] = []

    // Generate article for each platform
    for (const platform of platforms) {
      try {
        console.log(`[article-produce] Generating ${platform} article for topic: ${topic}`)

        // Generate content
        const { title, content } = await generateArticleContent(topic, platform)

        // Generate image
        const imageUrl = await generateImage(topic)

        // Upload to R2
        const r2Url = await uploadImageToR2(imageUrl, campaignId, platform)

        // Create article ID
        const articleId = uuidv4()

        // Insert into database
        const { error: insertError } = await supabase.from('articles').insert({
          id: articleId,
          product_id: productId,
          campaign_id: campaignId,
          title,
          platform,
          content,
          image_urls: [r2Url],
        })

        if (insertError) {
          console.error(`[article-produce] Insert error for ${platform}:`, insertError)
        } else {
          articles.push({
            id: articleId,
            platform,
            title,
            content,
            image_url: r2Url,
          })
          console.log(`[article-produce] ${platform} article created: ${articleId}`)
        }
      } catch (error) {
        console.error(`[article-produce] Error generating ${platform} article:`, error)
        // Continue with next platform
      }
    }

    return NextResponse.json({
      success: true,
      articles,
      generated: articles.length,
      total: platforms.length,
    })
  } catch (error) {
    console.error('[article-produce] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to generate articles' },
      { status: 500 }
    )
  }
}
