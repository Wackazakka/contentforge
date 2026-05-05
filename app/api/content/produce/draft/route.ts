import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { randomUUID } from 'crypto'
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY
const OPENAI_API_KEY = process.env.OPENAI_API_KEY
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const R2_ENDPOINT = process.env.R2_ENDPOINT
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME || 'contentforge-assets'
const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL || 'https://pub-5dcdfe9305a740febc87568c9ccb40a6.r2.dev'

interface DraftRequest {
  productId: string
  campaignId: string
  topic: string
  segmentCount?: number
}

interface Segment {
  index: number
  text: string
  voiceover: string
  image_url?: string
  approved: boolean
}

// Generate script using Claude
async function generateScript(topic: string, segmentCount: number): Promise<Segment[]> {
  console.log(`[generateDraft] Calling Claude to generate script with ${segmentCount} segments for topic: "${topic}"`)

  const prompt = `Generate a video script for a TikTok/Reels video about: "${topic}"

The script should have exactly ${segmentCount} segments.

For each segment, provide:
1. Text (what to display on screen, max 200 chars)
2. Voiceover (what to say, max 300 chars)

Write everything in Norwegian.

Return JSON with exactly this structure:
{
  "segments": [
    {
      "index": 0,
      "text": "Text for segment 1",
      "voiceover": "Voiceover for segment 1"
    },
    {
      "index": 1,
      "text": "Text for segment 2",
      "voiceover": "Voiceover for segment 2"
    }
    ... (${segmentCount} total segments)
  ]
}

Make each segment engaging and suitable for short-form video.`

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY || '',
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2048,
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
    console.error(`[generateDraft] Claude API error`, { status: response.status, error: errorData })
    throw new Error(`Claude API error: ${response.status}`)
  }

  const data = await response.json()
  const content = data.content?.[0]?.text

  if (!content) {
    throw new Error('No content in Claude response')
  }

  // Extract JSON from response
  const cleaned = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/)
  if (!jsonMatch) {
    throw new Error('No JSON found in Claude response')
  }

  const parsed = JSON.parse(jsonMatch[0])
  console.log(`[generateDraft] ✅ Generated ${parsed.segments?.length || 0} segments`)
  return parsed.segments || []
}

// Generate image using DALL-E
async function generateImage(text: string): Promise<string> {
  console.log(`[generateDraft] Calling DALL-E for image: "${text.substring(0, 50)}..."`)

  const response = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'dall-e-3',
      prompt: `Create a professional, engaging image for a video segment about: ${text}. High quality, bright colors, suitable for social media. Text-free.`,
      n: 1,
      size: '1024x1024',
    }),
  })

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}))
    console.error(`[generateDraft] DALL-E error`, { status: response.status, error: errorData })
    throw new Error(`DALL-E error: ${response.status}`)
  }

  const data = await response.json()
  const imageUrl = data.data?.[0]?.url

  if (!imageUrl) {
    throw new Error('No image URL in DALL-E response')
  }

  console.log(`[generateDraft] ✅ Image generated`)
  return imageUrl
}

// Upload image to R2
async function uploadImageToR2(imageUrl: string, fileName: string): Promise<string> {
  try {
    console.log(`[generateDraft] Downloading image from DALL-E...`)
    const imageResponse = await fetch(imageUrl)
    if (!imageResponse.ok) {
      throw new Error(`Failed to download image: ${imageResponse.statusText}`)
    }

    const imageBuffer = await imageResponse.arrayBuffer()
    console.log(`[generateDraft] Image downloaded, size: ${imageBuffer.byteLength} bytes`)

    const s3Client = new S3Client({
      region: 'auto',
      endpoint: R2_ENDPOINT,
      credentials: {
        accessKeyId: R2_ACCESS_KEY_ID || '',
        secretAccessKey: R2_SECRET_ACCESS_KEY || '',
      },
    })

    const key = `images/drafts/${fileName}`
    const uploadCommand = new PutObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: key,
      Body: Buffer.from(imageBuffer),
      ContentType: 'image/png',
    })

    await s3Client.send(uploadCommand)
    console.log(`[generateDraft] ✅ Uploaded to R2: ${key}`)

    const publicUrl = `${R2_PUBLIC_URL}/${key}`
    return publicUrl
  } catch (error) {
    console.error(`[generateDraft] R2 upload error:`, error)
    // Return DALL-E URL as fallback
    return imageUrl
  }
}

export async function POST(request: NextRequest) {
  try {
    const body: DraftRequest = await request.json()
    const { productId, campaignId, topic, segmentCount = 4 } = body

    if (!productId || !campaignId || !topic) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    console.log(`[generateDraft] ========== START DRAFT GENERATION ==========`)
    console.log(`[generateDraft] Product ID: ${productId}`)
    console.log(`[generateDraft] Campaign ID: ${campaignId}`)
    console.log(`[generateDraft] Topic: "${topic}"`)
    console.log(`[generateDraft] Segments: ${segmentCount}`)

    // Step 1: Generate script with Claude
    console.log(`[generateDraft] Step 1: Generating script...`)
    let segments = await generateScript(topic, segmentCount)
    console.log(`[generateDraft] Step 1: ✅ Script generated`)

    // Step 2: Generate images for each segment
    console.log(`[generateDraft] Step 2: Generating images for ${segments.length} segments...`)
    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i]
      try {
        console.log(`[generateDraft] Segment ${i + 1}/${segments.length}...`)
        const dallEUrl = await generateImage(segment.text)
        const fileName = `${randomUUID()}.png`
        const r2Url = await uploadImageToR2(dallEUrl, fileName)
        segment.image_url = r2Url
        console.log(`[generateDraft] ✅ Segment ${i + 1} complete`)
      } catch (imgError) {
        console.error(`[generateDraft] Image generation failed for segment ${i}:`, imgError)
        segment.image_url = '' // Empty fallback
      }
    }
    console.log(`[generateDraft] Step 2: ✅ All images generated`)

    // Step 3: Save to production_drafts table
    console.log(`[generateDraft] Step 3: Saving draft to database...`)
    const supabase = createClient(SUPABASE_URL || '', SUPABASE_SERVICE_ROLE_KEY || '')

    const { data: draftData, error: draftError } = await supabase
      .from('production_drafts')
      .insert({
        product_id: productId,
        campaign_id: campaignId,
        status: 'draft',
        segments: segments,
      })
      .select('id')
      .single()

    if (draftError) {
      console.error(`[generateDraft] Database error:`, draftError)
      throw new Error(`Failed to save draft: ${draftError.message}`)
    }

    const draftId = draftData.id
    console.log(`[generateDraft] ✅ Draft saved with ID: ${draftId}`)

    console.log(`[generateDraft] ========== ✅ DRAFT GENERATION SUCCESS ==========`)

    return NextResponse.json({
      success: true,
      draftId,
    })
  } catch (error) {
    console.error('[generateDraft] ========== ❌ DRAFT GENERATION FAILED ==========')
    console.error('[generateDraft] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to generate draft' },
      { status: 500 }
    )
  }
}
