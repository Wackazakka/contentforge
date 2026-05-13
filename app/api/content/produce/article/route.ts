import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import { randomUUID } from 'crypto'
import { checkAndDeductCredits } from '@/lib/credits'

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY
const OPENAI_API_KEY = process.env.OPENAI_API_KEY
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const R2_ENDPOINT = process.env.R2_ENDPOINT
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME || 'contentforge-assets'
const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL || 'https://pub-5dcdfe9305a740febc87568c9ccb40a6.r2.dev'

const isValidUuid = (str: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str)

// Only needs Claude time (~10s)
export const maxDuration = 60

interface GenerateArticleRequest {
  productId: string
  campaignId: string
  topic: string
  platform: string
  imageStyle?: string
}

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

IMPORTANT: If you are uncertain about specific facts (dates, names, numbers, historical events, etc.), acknowledge that uncertainty clearly in the text rather than stating them as definite facts. It is better to say "it is believed that..." or "according to some sources..." than to invent specifics. Never guess at facts you are not sure about.

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
    const err = await response.json().catch(() => ({}))
    throw new Error(`Claude API error: ${response.status} — ${JSON.stringify(err)}`)
  }

  const data = await response.json()
  const text = data.content?.[0]?.text
  if (!text) throw new Error('No content in Claude response')

  const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error('No JSON found in Claude response')

  return JSON.parse(jsonMatch[0])
}

// Called directly (no CDN), so high quality is fine — takes 30-45s
async function generateAndSaveImage(articleId: string, topic: string, productId: string): Promise<void> {
  console.log(`[article-produce] [after] Generating image for: "${topic}"`)

  // 1. Call OpenAI directly
  const openaiRes = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'gpt-image-1',
      prompt:
        `Create a clean editorial illustration for an article about: ${topic}. ` +
        'Style: modern digital illustration with bold colors and clean lines. ' +
        'Conceptual and metaphorical — avoid photorealism. ' +
        'Think magazine cover art or editorial infographic style. ' +
        'No text, letters, words, or typography in the image.',
      n: 1,
      size: '1024x1024',
      quality: 'high',
    }),
  })

  if (!openaiRes.ok) {
    const err = await openaiRes.json().catch(() => ({}))
    throw new Error(`OpenAI error: ${openaiRes.status} — ${JSON.stringify(err)}`)
  }

  const imageData = await openaiRes.json()
  const b64 = imageData.data?.[0]?.b64_json
  if (!b64) throw new Error('No b64_json in OpenAI response')

  const imageBuffer = Buffer.from(b64, 'base64')
  console.log(`[article-produce] [after] Image received (${(imageBuffer.byteLength / 1024).toFixed(0)}KB)`)

  // 2. Upload to R2 directly
  const s3 = new S3Client({
    region: 'auto',
    endpoint: R2_ENDPOINT,
    credentials: {
      accessKeyId: R2_ACCESS_KEY_ID || '',
      secretAccessKey: R2_SECRET_ACCESS_KEY || '',
    },
  })

  const fileName = `${randomUUID()}.png`
  const key = `images/articles/${fileName}`
  await s3.send(new PutObjectCommand({
    Bucket: R2_BUCKET_NAME,
    Key: key,
    Body: imageBuffer,
    ContentType: 'image/png',
  }))

  const imageUrl = `${R2_PUBLIC_URL}/${key}`
  console.log(`[article-produce] [after] Uploaded to R2: ${imageUrl.substring(0, 60)}`)

  // 3. Update article in Supabase
  const supabase = createClient(SUPABASE_URL || '', SUPABASE_SERVICE_ROLE_KEY || '')

  const { error } = await supabase
    .from('articles')
    .update({ image_urls: [imageUrl] })
    .eq('id', articleId)

  if (error) {
    console.error(`[article-produce] [after] Supabase update failed:`, error)
  } else {
    console.log(`[article-produce] [after] ✅ Article ${articleId} updated with image`)
  }

  // 4. Also store in asset_banks
  try {
    await supabase.from('asset_banks').insert({
      product_id: productId,
      bank_type: 'image',
      name: `Article image - ${topic.substring(0, 50)}`,
      asset_url: imageUrl,
      asset_type: 'image',
    })
  } catch (_) {} // non-fatal
}

export async function POST(request: NextRequest) {
  try {
    const body: GenerateArticleRequest & { userId?: string } = await request.json()
    const { productId, campaignId, topic, platform, userId, imageStyle } = body

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

    // Generate article content with Claude (~10s)
    const { title, content } = await generateArticleContent(topic, platform)
    console.log(`[article-produce] ✅ Content ready: "${title.substring(0, 60)}"`)

    // Save article immediately with no image
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
      throw new Error(`Database insert failed: ${(insertError as any).message}`)
    }

    console.log(`[article-produce] ✅ Article saved: ${articleId}`)

    // Trigger Netlify Background Function — returns 202 immediately, no CDN timeout
    const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://contentforge-610.netlify.app'
    fetch(SITE_URL + '/.netlify/functions/generate-image-background', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ articleId, topic: title, productId, imageStyle: imageStyle || 'tech' }),
    }).catch(() => {})

    // Return article immediately — image arrives in DB within ~40s
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
