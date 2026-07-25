import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import { createClient } from '@supabase/supabase-js'
import { randomUUID } from 'crypto'

async function addLogoOverlay(imageBuffer, logoUrl) {
  try {
    // Dynamic import so a missing/broken sharp doesn't crash the whole function
    const sharp = (await import('sharp')).default
    const logoRes = await fetch(logoUrl)
    if (!logoRes.ok) return imageBuffer
    const logoRaw = Buffer.from(await logoRes.arrayBuffer())
    const LOGO_MAX_WIDTH = 280, LOGO_MAX_HEIGHT = 120, PADDING = 16, MARGIN = 24, RADIUS = 14
    const logoResized = await sharp(logoRaw).resize(LOGO_MAX_WIDTH, LOGO_MAX_HEIGHT, { fit: 'inside', withoutEnlargement: true }).toBuffer()
    const { width: lw = LOGO_MAX_WIDTH, height: lh = LOGO_MAX_HEIGHT } = await sharp(logoResized).metadata()
    const bgW = lw + PADDING * 2, bgH = lh + PADDING * 2
    const bgSvg = Buffer.from(`<svg width="${bgW}" height="${bgH}" xmlns="http://www.w3.org/2000/svg"><rect width="${bgW}" height="${bgH}" rx="${RADIUS}" ry="${RADIUS}" fill="white" fill-opacity="0.88"/></svg>`)
    const badge = await sharp(bgSvg).composite([{ input: logoResized, left: PADDING, top: PADDING }]).png().toBuffer()
    const { width: imgW = 1024, height: imgH = 1024 } = await sharp(imageBuffer).metadata()
    return await sharp(imageBuffer).composite([{ input: badge, left: imgW - bgW - MARGIN, top: imgH - bgH - MARGIN }]).png().toBuffer()
  } catch (err) {
    console.error('[bg-image] Logo overlay failed (skipping):', err)
    return imageBuffer
  }
}

const STYLE_PROMPTS = {
  tech: 'Cutting-edge technology product scene, ultra-sharp macro details, dramatic directional lighting with deep contrasting shadows, floating holographic elements, premium industrial materials — brushed metal, matte glass, anodized surfaces — shot as if for a flagship product launch. Sophisticated and visually arresting. Subject: [TOPIC]. No text, letters, or typography.',
  cinematic: 'Cinematic wide-angle scene, dramatic natural or artificial lighting, rich color grading, strong visual narrative, high production value, feels like a movie still or premium documentary. Emotionally resonant. Subject: [TOPIC]. No text, letters, or typography.',
  warm: 'Warm lifestyle photograph style, soft natural light, organic textures, earthy tones with golden accents, shallow depth of field, inviting and human-centered composition, Instagram editorial aesthetic. Subject: [TOPIC]. No text, letters, or typography.',
  surreal: 'Sophisticated conceptual surrealism, dreamlike scene with unexpected juxtapositions, photorealistic rendering of impossible scenarios, thought-provoking and visually arresting, Dalí meets contemporary advertising. Subject: [TOPIC]. No text, letters, or typography.',
  manga: 'Dynamic manga-inspired digital illustration, bold clean outlines, dramatic foreshortening and perspective, high-contrast cel shading, expressive visual energy, cinematic panel composition, Studio Ghibli meets modern Japanese editorial design. Sophisticated, not childish. Subject: [TOPIC]. No text, letters, or typography.',
}

export default async function handler(req) {
  let body
  try {
    body = await req.json()
  } catch (e) {
    console.error('[bg-image] Invalid JSON body')
    return new Response('Bad request', { status: 400 })
  }
  const { articleId, topic, productId, logoUrl, imageStyle } = body
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
    // Retry OpenAI image generation up to 3× — a single transient hiccup should NOT leave
    // the article permanently without an image (root cause of "some have images, some don't").
    let b64 = null
    let lastErr = ''
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const openaiRes = await fetch('https://api.openai.com/v1/images/generations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${OPENAI_API_KEY}` },
          body: JSON.stringify({ model: 'gpt-image-1', prompt, n: 1, size: '1024x1024', quality: 'high' }),
        })
        if (!openaiRes.ok) {
          lastErr = `${openaiRes.status} ${(await openaiRes.text()).slice(0, 200)}`
          console.error(`[bg-image] OpenAI attempt ${attempt} failed:`, lastErr)
        } else {
          const imageData = await openaiRes.json()
          b64 = imageData.data?.[0]?.b64_json || null
          if (b64) break
          lastErr = 'No b64_json in response'
          console.error(`[bg-image] attempt ${attempt}: ${lastErr}`)
        }
      } catch (e) {
        lastErr = String(e?.message || e)
        console.error(`[bg-image] attempt ${attempt} threw:`, lastErr)
      }
      if (attempt < 3) await new Promise((r) => setTimeout(r, 2000 * attempt))
    }
    if (!b64) {
      console.error('[bg-image] All attempts failed:', lastErr)
      return new Response('OpenAI error after retries', { status: 500 })
    }

    let imageBuffer = Buffer.from(b64, 'base64')
    console.log(`[bg-image] Image received, size: ${imageBuffer.byteLength} bytes`)

    if (logoUrl) {
      console.log(`[bg-image] Compositing logo: ${logoUrl}`)
      imageBuffer = await addLogoOverlay(imageBuffer, logoUrl)
    }

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
