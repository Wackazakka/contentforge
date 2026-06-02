import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import { createClient } from '@supabase/supabase-js'
import { getProductLogoUrl, compositeLogoOnImage } from '@/lib/image-logo'

const OPENAI_API_KEY = process.env.OPENAI_API_KEY
const R2_ENDPOINT = process.env.R2_ENDPOINT
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME || 'contentforge-assets'
const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL || 'https://pub-5dcdfe9305a740febc87568c9ccb40a6.r2.dev'
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

// maxDuration gives headroom for image generation (~25s med medium quality)
export const maxDuration = 120

interface GenerateImageRequest {
  topic: string
  productId: string
  articleIds?: string[]
  imageSize?: '1024x1024' | '1024x1536' | '1536x1024'
  imageStyle?: 'tech' | 'editorial' | 'warm' | 'minimal' | 'painterly'
}

const VIDEO_STYLE_PROMPTS: Record<string, string> = {
  tech:      'Premium 3D-rendered CGI scene, sleek metallic surfaces, dramatic studio lighting, deep shadows, photorealistic render.',
  editorial: 'Bold editorial photography, high-contrast composition, strong graphic lines, magazine cover quality, professional lighting.',
  warm:      'Warm golden-hour lifestyle photography, natural light, soft bokeh, inviting and human atmosphere, candid feel.',
  minimal:   'Clean minimalist scene, large negative space, muted Scandinavian palette, simple shapes, calm and airy mood.',
  painterly: 'Expressive painterly digital illustration, rich visible brushstrokes, vivid saturated colors, artistic cinematic mood.',
}

async function generateImageBuffer(topic: string, imageSize: string = '1024x1024', imageStyle?: string): Promise<Buffer> {
  console.log('[generateImage] Calling gpt-image-1 (low quality) for:  + topic + ')

  const response = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + (OPENAI_API_KEY || ''),
    },
    body: JSON.stringify({
      model: 'gpt-image-1',
      prompt: (() => {
        const styleGuide = (imageStyle && VIDEO_STYLE_PROMPTS[imageStyle])
          ? VIDEO_STYLE_PROMPTS[imageStyle]
          : 'Bold editorial photography, high-contrast composition, magazine cover quality, professional lighting.'
        return styleGuide + ' Visual scene representing: ' + topic + '. No text, letters, words, or typography in the image.'
      })(),
      n: 1,
      size: imageSize,
      quality: 'low',
    }),
  })

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}))
    throw new Error(
      'OpenAI image API error: ' +
        response.status +
        ' ' +
        response.statusText +
        ' — ' +
        JSON.stringify(errorData)
    )
  }

  const data = await response.json()
  const b64 = data.data?.[0]?.b64_json
  if (!b64) throw new Error('No image data in OpenAI response')

  return Buffer.from(b64, 'base64')
}

async function uploadBufferToR2(imageBuffer: Buffer, fileName: string): Promise<string> {
  console.log('[generateImage] Uploading to R2 (' + imageBuffer.byteLength + ' bytes)...')

  const s3Client = new S3Client({
    region: 'auto',
    endpoint: R2_ENDPOINT,
    credentials: {
      accessKeyId: R2_ACCESS_KEY_ID || '',
      secretAccessKey: R2_SECRET_ACCESS_KEY || '',
    },
  })

  const key = 'images/articles/' + fileName
  await s3Client.send(
    new PutObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: key,
      Body: imageBuffer,
      ContentType: 'image/png',
    })
  )

  const publicUrl = R2_PUBLIC_URL + '/' + key
  console.log('[generateImage] ✅ Uploaded: ' + publicUrl)
  return publicUrl
}

export async function POST(request: NextRequest) {
  try {
    const body: GenerateImageRequest = await request.json()
    const { topic, productId, articleIds, imageSize = '1024x1024', imageStyle } = body

    if (!topic || !productId) {
      return NextResponse.json({ error: 'Missing topic or productId' }, { status: 400 })
    }

    if (!OPENAI_API_KEY) {
      return NextResponse.json({ error: 'OPENAI_API_KEY not set' }, { status: 500 })
    }

    console.log('[generateImage] ===== START:  + topic +  =====')

    let imageBuffer = await generateImageBuffer(topic, imageSize, imageStyle)

    // Composite product logo onto bottom-right if available
    const logoUrl = await getProductLogoUrl(productId)
    if (logoUrl) {
      console.log('[generateImage] Compositing logo:', logoUrl)
      imageBuffer = await compositeLogoOnImage(imageBuffer, logoUrl)
    }

    const fileName = randomUUID() + '.png'
    const r2Url = await uploadBufferToR2(imageBuffer, fileName)

    // Store in asset_banks
    try {
      const supabase = createClient(SUPABASE_URL || '', SUPABASE_SERVICE_ROLE_KEY || '')
      await supabase.from('asset_banks').insert({
        product_id: productId,
        bank_type: 'image',
        name: 'Article image - ' + topic.substring(0, 50),
        asset_url: r2Url,
        asset_type: 'image',
      })
    } catch (dbErr) {
      console.error('[generateImage] asset_banks insert failed:', dbErr)
    }

    // Update any provided articleIds
    if (articleIds && articleIds.length > 0) {
      const supabase = createClient(SUPABASE_URL || '', SUPABASE_SERVICE_ROLE_KEY || '')
      for (const articleId of articleIds) {
        await supabase
          .from('articles')
          .update({ image_urls: [r2Url] })
          .eq('id', articleId)
      }
    }

    console.log('[generateImage] ===== DONE: ' + r2Url + ' =====')
    return NextResponse.json({ success: true, imageUrl: r2Url })
  } catch (error) {
    console.error('[generateImage] FAILED:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to generate image' },
      { status: 500 }
    )
  }
}
