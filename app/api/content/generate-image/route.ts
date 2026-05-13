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


// Allow up to 60s for image generation (gpt-image-1 can be slow)
export const maxDuration = 60

interface GenerateImageRequest {
  topic: string
  productId: string
  articleIds?: string[]
}

// Generate image using gpt-image-1 (returns base64 directly)
async function generateImageBuffer(topic: string): Promise<Buffer> {
  console.log('[generateImage] Calling gpt-image-1 for topic:  + topic + ')
  console.log('[generateImage] API key present: ' + !!OPENAI_API_KEY)

  const response = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + (OPENAI_API_KEY || ''),
    },
    body: JSON.stringify({
      model: 'gpt-image-1',
      prompt: 'Create a professional, visually appealing image for an article about: ' + topic + '. High quality, suitable for articles and social media. Clean, modern style. No text, letters, words, or typography in the image.',
      n: 1,
      size: '1024x1024',
      quality: 'high',
    }),
  })

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}))
    console.error('[generateImage] OpenAI API error', {
      status: response.status,
      statusText: response.statusText,
      error: errorData,
    })
    throw new Error('OpenAI image API error: ' + response.status + ' ' + response.statusText + ' — ' + JSON.stringify(errorData))
  }

  const data = await response.json()
  const b64 = data.data?.[0]?.b64_json
  if (!b64) {
    console.error('[generateImage] No b64_json in response', { data })
    throw new Error('No image data in OpenAI response')
  }

  console.log('[generateImage] Image received as base64, decoding...')
  return Buffer.from(b64, 'base64')
}

// Upload image buffer to R2
async function uploadBufferToR2(imageBuffer: Buffer, fileName: string): Promise<string> {
  try {
    console.log('[generateImage] Image size: ' + imageBuffer.byteLength + ' bytes')
    console.log('[generateImage] R2 configuration check:')
    console.log('  - R2_ENDPOINT: ' + (R2_ENDPOINT ? '✓ set' : '✗ MISSING'))
    console.log('  - R2_ACCESS_KEY_ID: ' + (R2_ACCESS_KEY_ID ? '✓ set' : '✗ MISSING'))
    console.log('  - R2_SECRET_ACCESS_KEY: ' + (R2_SECRET_ACCESS_KEY ? '✓ set' : '✗ MISSING'))
    console.log('  - R2_BUCKET_NAME: ' + R2_BUCKET_NAME)
    console.log('  - R2_PUBLIC_URL: ' + R2_PUBLIC_URL)

    console.log('[generateImage] Starting R2 upload...')
    const s3Client = new S3Client({
      region: 'auto',
      endpoint: R2_ENDPOINT,
      credentials: {
        accessKeyId: R2_ACCESS_KEY_ID || '',
        secretAccessKey: R2_SECRET_ACCESS_KEY || '',
      },
    })

    const key = 'images/articles/' + fileName
    const uploadCommand = new PutObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: key,
      Body: imageBuffer,
      ContentType: 'image/png',
    })

    await s3Client.send(uploadCommand)
    console.log('[generateImage] ✅ Uploaded to R2: ' + key)

    const publicUrl = R2_PUBLIC_URL + '/' + key
    console.log('[generateImage] Public URL: ' + publicUrl)

    return publicUrl
  } catch (error) {
    console.error('[generateImage] ❌ R2 upload FAILED:', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    })
    console.warn('[generateImage] ⚠️  R2 upload failed, returning placeholder')
    throw error
  }
}

export async function POST(request: NextRequest) {
  try {
    const body: GenerateImageRequest = await request.json()
    const { topic, productId, articleIds } = body

    if (!topic || !productId) {
      console.error('[generateImage] Validation failed: missing topic or productId')
      return NextResponse.json({ error: 'Missing topic or productId' }, { status: 400 })
    }

    console.log('[generateImage] ========== START IMAGE GENERATION ==========')
    console.log('[generateImage] Topic:  + topic + ')
    console.log('[generateImage] Product ID: ' + productId)
    console.log('[generateImage] Environment variables:', {
      OPENAI_API_KEY_set: !!OPENAI_API_KEY,
      R2_ENDPOINT_set: !!R2_ENDPOINT,
      R2_BUCKET: R2_BUCKET_NAME,
    })

    if (!OPENAI_API_KEY) {
      const error = 'OPENAI_API_KEY is not set in environment variables on Netlify'
      console.error('[generateImage] FATAL ERROR: ' + error)
      return NextResponse.json({ error }, { status: 500 })
    }

    // Generate image with gpt-image-1
    console.log('[generateImage] Step 1: Calling gpt-image-1...')
    const imageBuffer = await generateImageBuffer(topic)
    console.log('[generateImage] Step 1: ✅ Image received as base64')

    // Upload to R2
    console.log('[generateImage] Step 2: Uploading to R2...')
    const fileName = randomUUID() + '.png'
    const r2Url = await uploadBufferToR2(imageBuffer, fileName)
    console.log('[generateImage] Step 2: ✅ R2 upload complete')

    // Insert into asset_banks
    console.log('[generateImage] Step 3: Storing in asset_banks...')
    try {
      const supabase = createClient(SUPABASE_URL || '', SUPABASE_SERVICE_ROLE_KEY || '')

      const { data, error: dbError } = await supabase
        .from('asset_banks')
        .insert({
          product_id: productId,
          bank_type: 'image',
          name: 'Article image - ' + topic.substring(0, 50),
          asset_url: r2Url,
          asset_type: 'image',
        })
        .select()

      if (dbError) {
        console.error('[generateImage] asset_banks insert error:', dbError)
      } else {
        console.log('[generateImage] ✅ Stored in asset_banks:', data?.[0]?.id)
      }
    } catch (dbErr) {
      console.error('[generateImage] asset_banks error:', dbErr instanceof Error ? dbErr.message : String(dbErr))
    }

    console.log('[generateImage] ========== ✅ IMAGE GENERATION SUCCESS ==========')
    console.log('[generateImage] Final URL: ' + r2Url)

    // Update articles with image URLs if articleIds provided
    if (articleIds && articleIds.length > 0) {
      console.log('[generateImage] Updating ' + articleIds.length + ' articles with image URL')
      const supabaseClient = createClient(SUPABASE_URL || '', SUPABASE_SERVICE_ROLE_KEY || '')

      for (const articleId of articleIds) {
        try {
          const { error: updateError } = await supabaseClient
            .from('articles')
            .update({ image_urls: [r2Url] })
            .eq('id', articleId)

          if (updateError) {
            console.error('[generateImage] Failed to update article ' + articleId + ':', updateError)
          } else {
            console.log('[generateImage] ✅ Article ' + articleId + ' updated with image')
          }
        } catch (err) {
          console.error('[generateImage] Error updating article ' + articleId + ':', err)
        }
      }
    }

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
