import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import { createClient } from '@supabase/supabase-js'
import { randomUUID } from 'crypto'

const STYLE_PROMPTS = {
  tech: 'Premium 3D-rendered CGI visualization, photorealistic glass and chrome materials, holographic data overlays, iridescent neon accents in cyan and electric blue, dark deep blue-black background, volumetric god rays, ultra-sharp render, Wired magazine / Apple keynote / Nvidia GTC aesthetic. Subject: [TOPIC]. No text, letters, or typography.',
  editorial: 'Bold editorial illustration, flat design with strong geometric shapes, saturated complementary colors, confident graphic composition, New Yorker / Vox / Bloomberg Businessweek magazine cover style. Conceptual and metaphorical. Subject: [TOPIC]. No text, letters, or typography.',
  warm: 'Warm lifestyle photograph style, soft natural light, organic textures, earthy tones with golden accents, shallow depth of field, inviting and human-centered composition, Instagram editorial aesthetic. Subject: [TOPIC]. No text, letters, or typography.',
  minimal: 'Clean minimalist infographic illustration, white or very light grey background, simple geometric icons, limited muted palette (2-3 colors), generous whitespace, McKinsey / LinkedIn / corporate report aesthetic. Subject: [TOPIC]. No text, letters, or typography.',
  painterly: 'Expressive painterly illustration, visible brushstrokes, rich saturated pigments, impressionistic light, artistic book cover or editorial painting style. Emotive and textural. Subject: [TOPIC]. No text, letters, or typography.',
}

export default async function handler(req) {
  let body
  try {
    body = await req.json()
  } catch (e) {
    console.error('[bg-image] Invalid JSON body')
    return new Response('Bad request', { status: 400 })
  }
  const { articleId, topic, productId, imageStyle } = body
  const style = imageStyle && STYLE_PROMPTS[imageStyle] ? imageStyle : 'tech'
  const prompt = STYLE_PROMPTS[style].replace('[TOPIC]', topic)

  console.log(`[bg-image] Starting for article ${articleId} (style=${style}): "${topic}"`)

  const OPENAI_API_KEY = process.env.OPENAI_API_KEY
  const R2_ENDPOINT = process.env.R2_ENDPOINT
  const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID
  const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY
  const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME || 'contentforge-assets'
  const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL || 'https://pub-5dcdfe9305a740febc87568c9ccb40a6.r2.dev'
  const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
  const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!OPENAI_API_KEY) {
    console.error('[bg-image] Missing OPENAI_API_KEY')
    return new Response('Missing OPENAI_API_KEY', { status: 500 })
  }

  try {
    const openaiRes = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-image-1',
        prompt,
        n: 1,
        size: '1024x1024',
        quality: 'high',
      }),
    })

    if (!openaiRes.ok) {
      const errText = await openaiRes.text()
      console.error('[bg-image] OpenAI failed:', openaiRes.status, errText)
      return new Response('OpenAI error', { status: 500 })
    }

    const imageData = await openaiRes.json()
    const b64 = imageData.data?.[0]?.b64_json
    if (!b64) {
      console.error('[bg-image] No b64_json in response:', JSON.stringify(imageData).substring(0, 500))
      return new Response('No image data', { status: 500 })
    }

    const imageBuffer = Buffer.from(b64, 'base64')
    console.log(`[bg-image] Image received, size: ${imageBuffer.byteLength} bytes`)

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
  } catch (err) {
    console.error('[bg-image] Uncaught error:', err?.message || err, err?.stack)
    return new Response('Error', { status: 500 })
  }
}

export const config = { background: true }
