import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import { createClient } from '@supabase/supabase-js'

const OPENAI_API_KEY = process.env.OPENAI_API_KEY
const R2_ENDPOINT = process.env.R2_ENDPOINT
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME || 'contentforge-assets'
const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL || 'https://pub-5dcdfe9305a740febc87568c9ccb40a6.r2.dev'
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

interface GenerateImageRequest {
  topic: string
  productId: string
}

// Generate image using DALL-E 3
async function generateImageWithDallE(topic: string): Promise<string> {
  console.log(`[generateImage] Calling DALL-E 3 for topic: "${topic}"`)
  console.log(`[generateImage] API key present: ${!!OPENAI_API_KEY}`)

  const response = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'dall-e-3',
      prompt: `Create a professional, visually appealing image for an article about: ${topic}. High quality, suitable for articles and social media. Clean, modern style.`,
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

  console.log(`[generateImage] Image generated: ${data.data[0].url.substring(0, 50)}...`)
  return data.data[0].url
}

// Download image from DALL-E URL and upload to R2
async function uploadImageToR2(imageUrl: string, fileName: string): Promise<string> {
  try {
    console.log(`[generateImage] Downloading image from DALL-E...`)
    const imageResponse = await fetch(imageUrl)
    if (!imageResponse.ok) {
      throw new Error(`Failed to download image: ${imageResponse.statusText}`)
    }

    const imageBuffer = await imageResponse.arrayBuffer()
    console.log(`[generateImage] Image downloaded, size: ${imageBuffer.byteLength} bytes`)

    // Check R2 configuration
    console.log(`[generateImage] R2 configuration check:`)
    console.log(`  - R2_ENDPOINT: ${R2_ENDPOINT ? '✓ set' : '✗ MISSING'}`)
    console.log(`  - R2_ACCESS_KEY_ID: ${R2_ACCESS_KEY_ID ? '✓ set' : '✗ MISSING'}`)
    console.log(`  - R2_SECRET_ACCESS_KEY: ${R2_SECRET_ACCESS_KEY ? '✓ set' : '✗ MISSING'}`)
    console.log(`  - R2_BUCKET_NAME: ${R2_BUCKET_NAME}`)
    console.log(`  - R2_PUBLIC_URL: ${R2_PUBLIC_URL}`)

    // Upload to R2
    console.log(`[generateImage] Starting R2 upload...`)
    const s3Client = new S3Client({
      region: 'auto',
      endpoint: R2_ENDPOINT,
      credentials: {
        accessKeyId: R2_ACCESS_KEY_ID || '',
        secretAccessKey: R2_SECRET_ACCESS_KEY || '',
      },
    })

    const key = `images/articles/${fileName}`
    const uploadCommand = new PutObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: key,
      Body: Buffer.from(imageBuffer),
      ContentType: 'image/png',
    })

    await s3Client.send(uploadCommand)
    console.log(`[generateImage] ✅ Uploaded to R2: ${key}`)

    const publicUrl = `${R2_PUBLIC_URL}/${key}`
    console.log(`[generateImage] Public URL: ${publicUrl}`)
    
    return publicUrl
  } catch (error) {
    console.error(`[generateImage] ❌ R2 upload FAILED:`, {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    })
    console.warn(`[generateImage] ⚠️  Falling back to DALL-E URL (image not cached in R2)`)
    // Return original DALL-E URL as fallback
    return imageUrl
  }
}

export async function POST(request: NextRequest) {
  try {
    const body: GenerateImageRequest = await request.json()
    const { topic, productId } = body

    if (!topic || !productId) {
      console.error('[generateImage] Validation failed: missing topic or productId')
      return NextResponse.json({ error: 'Missing topic or productId' }, { status: 400 })
    }

    console.log(`[generateImage] ========== START IMAGE GENERATION ==========`)
    console.log(`[generateImage] Topic: "${topic}"`)
    console.log(`[generateImage] Product ID: ${productId}`)

    // Generate image with DALL-E
    console.log(`[generateImage] Step 1: Calling DALL-E...`)
    const dallEUrl = await generateImageWithDallE(topic)
    console.log(`[generateImage] Step 1: ✅ DALL-E returned image`)

    // Upload to R2
    console.log(`[generateImage] Step 2: Uploading to R2...`)
    const fileName = `${randomUUID()}.png`
    const r2Url = await uploadImageToR2(dallEUrl, fileName)
    console.log(`[generateImage] Step 2: ✅ R2 upload complete`)

    // Insert into asset_banks
    console.log(`[generateImage] Step 3: Storing in asset_banks...`)
    try {
      const supabase = createClient(SUPABASE_URL || '', SUPABASE_SERVICE_ROLE_KEY || '')
      
      const { data, error: dbError } = await supabase
        .from('asset_banks')
        .insert({
          product_id: productId,
          bank_type: 'image',
          name: `Article image - ${topic.substring(0, 50)}`,
          asset_url: r2Url,
          asset_type: 'image',
        })
        .select()

      if (dbError) {
        console.error(`[generateImage] asset_banks insert error:`, dbError)
      } else {
        console.log(`[generateImage] ✅ Stored in asset_banks:`, data?.[0]?.id)
      }
    } catch (dbErr) {
      console.error(`[generateImage] asset_banks error:`, dbErr instanceof Error ? dbErr.message : String(dbErr))
      // Don't fail the entire operation if asset_banks insert fails
    }

    console.log(`[generateImage] ========== ✅ IMAGE GENERATION SUCCESS ==========`)
    console.log(`[generateImage] Final URL: ${r2Url}`)

    return NextResponse.json({
      success: true,
      imageUrl: r2Url,
    })
  } catch (error) {
    console.error('[generateImage] ========== ❌ IMAGE GENERATION FAILED ==========')
    console.error('[generateImage] Error details:', {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    })
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to generate image' },
      { status: 500 }
    )
  }
}
