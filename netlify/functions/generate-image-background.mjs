import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import { createClient } from '@supabase/supabase-js'
import { randomUUID } from 'crypto'

export default async function handler(req) {
  const { articleId, topic, productId } = await req.json()

  console.log(`[bg-image] Starting for article ${articleId}: "${topic}"`)

  const OPENAI_API_KEY = process.env.OPENAI_API_KEY
  const R2_ENDPOINT = process.env.R2_ENDPOINT
  const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID
  const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY
  const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME || 'contentforge-assets'
  const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL || 'https://pub-5dcdfe9305a740febc87568c9ccb40a6.r2.dev'
  const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
  const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

  // 1. Generate image with OpenAI directly
  const openaiRes = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'gpt-image-2',
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
    console.error('[bg-image] OpenAI failed:', JSON.stringify(err))
    return new Response('OpenAI error', { status: 500 })
  }

  const imageData = await openaiRes.json()
  const b64 = imageData.data?.[0]?.b64_json
  if (!b64) {
    console.error('[bg-image] No b64_json in response')
    return new Response('No image data', { status: 500 })
  }

  const imageBuffer = Buffer.from(b64, 'base64')
  console.log(`[bg-image] Image received, size: ${imageBuffer.byteLength} bytes`)

  // 2. Upload to R2
  const s3 = new S3Client({
    region: 'auto',
    endpoint: R2_ENDPOINT,
    credentials: {
      accessKeyId: R2_ACCESS_KEY_ID || '',
      secretAccessKey: R2_SECRET_ACCESS_KEY || '',
    },
  })

  const key = `images/articles/${randomUUID()}.png`
  await s3.send(new PutObjectCommand({
    Bucket: R2_BUCKET_NAME,
    Key: key,
    Body: imageBuffer,
    ContentType: 'image/png',
  }))

  const imageUrl = `${R2_PUBLIC_URL}/${key}`
  console.log(`[bg-image] Uploaded to R2: ${imageUrl}`)

  // 3. Update article in Supabase
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
  const { error } = await supabase
    .from('articles')
    .update({ image_urls: [imageUrl] })
    .eq('id', articleId)

  if (error) {
    console.error('[bg-image] Supabase update failed:', JSON.stringify(error))
    return new Response('DB error', { status: 500 })
  }

  console.log(`[bg-image] Article ${articleId} updated with image`)

  // 4. Store in asset_banks (non-fatal)
  try {
    await supabase.from('asset_banks').insert({
      product_id: productId,
      bank_type: 'image',
      name: `Article image - ${topic.substring(0, 50)}`,
      asset_url: imageUrl,
      asset_type: 'image',
    })
  } catch (_) {}

  return new Response('OK', { status: 200 })
}

export const config = { path: '/api/bg/generate-image' }
