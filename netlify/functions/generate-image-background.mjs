import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import { createClient } from '@supabase/supabase-js'
import { randomUUID } from 'crypto'

// Logo-stripe i full bredde under bildet (Reforhandle-metoden, standard fra 19/8-2026):
// motivet beholdes urørt i 1024×1024, en ren hvit stripe på 256 px legges under, og
// logoen (innholds-beskåret, maks 940×204) sentreres i stripen. Resultat 1024×1280 = 4:5,
// som er idealformatet for både Facebook- og Instagram-feeden.
// Returnerer { buffer, ext, contentType } — faller tilbake til bildet uten stripe ved feil.
async function addLogoBand(imageBuffer, logoUrl) {
  const fallback = { buffer: imageBuffer, ext: 'png', contentType: 'image/png' }
  try {
    // Dynamic import so a missing/broken sharp doesn't crash the whole function
    const sharp = (await import('sharp')).default
    const logoRes = await fetch(logoUrl)
    if (!logoRes.ok) return fallback

    const logoRaw = Buffer.from(await logoRes.arrayBuffer())
    // trim() fjerner logofilas egen luft — uten dette kan en logo med innebygd
    // bakgrunn stikke opp av stripen (feilen fra første manuelle runde)
    const logoTrimmed = await sharp(logoRaw).trim().toBuffer()
    const meta = await sharp(logoTrimmed).metadata()
    const MAXW = 940, MAXH = 204, BAND = 256
    const scale = Math.min(MAXW / (meta.width || MAXW), MAXH / (meta.height || MAXH))
    const lw = Math.round((meta.width || MAXW) * scale)
    const lh = Math.round((meta.height || MAXH) * scale)
    const logoFlat = await sharp(logoTrimmed)
      .resize(lw, lh)
      .flatten({ background: '#ffffff' })
      .toBuffer()

    const base = await sharp(imageBuffer).resize(1024, 1024, { fit: 'cover' }).toBuffer()
    const buffer = await sharp(base)
      .extend({ bottom: BAND, background: '#ffffff' })
      .composite([{ input: logoFlat, left: Math.round((1024 - lw) / 2), top: 1024 + Math.round((BAND - lh) / 2) }])
      .jpeg({ quality: 90 })
      .toBuffer()
    return { buffer, ext: 'jpg', contentType: 'image/jpeg' }
  } catch (err) {
    console.error('[bg-image] Logo band failed (skipping):', err)
    return fallback
  }
}

// De tre øverste er «Reforhandle-metoden» (bevist 19/8-2026) og genereres via fal
// (FLUX 1.1 Pro / Recraft V3) med gpt-image-1 som reserve; resten er eldre stiler
// på OpenAI. Standard er 'magasin'.
const STYLE_PROMPTS = {
  magasin: 'Sophisticated contemporary editorial illustration, elegant flat shapes with subtle texture, refined palette with generous negative space, conceptual and stylish scene composition. Depict the subject as a SCENE with people, objects or environments — never as a poster, framed print, book cover, packaging or any other printed matter. Subject: [TOPIC]. Absolutely no words, no letters, no numbers, no typography of any kind anywhere in the image.',
  illustrasjon: 'Minimalist editorial illustration in deep navy blue ink on a cream background, delicate line detail, with a single warm accent color. Calm, hopeful, quietly conceptual mood with lots of open space. Subject: [TOPIC]. No text, letters, numbers or typography anywhere in the image.',
  foto: 'Warm, natural lifestyle photograph, candid editorial style, soft golden light, muted warm tones, shallow depth of field, authentic and human. Subject: [TOPIC]. No text, letters or numbers visible anywhere in the image.',
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
  const style = imageStyle && STYLE_PROMPTS[imageStyle] ? imageStyle : 'magasin'
  const prompt = STYLE_PROMPTS[style].replace('[TOPIC]', topic)
  // fal-modell per stil: Recraft er sterkest på magasin-illustrasjon, FLUX på resten
  const FAL_MODELS = {
    // FLUX som standard: Recraft er penest, men sniker gjentatte ganger inn tekst/plakater
    // og krever menneskelig QA per bilde — uegnet som ubevoktet default.
    magasin: ['fal-ai/flux-pro/v1.1', { image_size: 'square_hd', enable_safety_checker: true }],
    illustrasjon: ['fal-ai/flux-pro/v1.1', { image_size: 'square_hd', enable_safety_checker: true }],
    foto: ['fal-ai/flux-pro/v1.1', { image_size: 'square_hd', enable_safety_checker: true }],
  }

  console.log(`[bg-image] Starting for article ${articleId} (style=${style}): "${topic}"`)

  const OPENAI_API_KEY = process.env.OPENAI_API_KEY
  const R2_ENDPOINT = process.env.R2_ENDPOINT
  const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID
  const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY
  const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME || 'contentforge-assets'
  const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL || 'https://pub-5dcdfe9305a740febc87568c9ccb40a6.r2.dev'
  const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
  const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

  const FAL_API_KEY = process.env.FAL_API_KEY

  if (!OPENAI_API_KEY && !FAL_API_KEY) {
    console.error('[bg-image] Missing both FAL_API_KEY and OPENAI_API_KEY')
    return new Response('Missing image API keys', { status: 500 })
  }

  try {
    let imageBuffer = null

    // Primær: fal (FLUX/Recraft) for de nye stilene — billigere og bedre stil-treff
    if (FAL_API_KEY && FAL_MODELS[style]) {
      const [model, params] = FAL_MODELS[style]
      for (let attempt = 1; attempt <= 2 && !imageBuffer; attempt++) {
        try {
          const falRes = await fetch(`https://fal.run/${model}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Key ${FAL_API_KEY}` },
            body: JSON.stringify({ ...params, prompt }),
          })
          const falData = await falRes.json()
          const url = falData.images?.[0]?.url
          if (url) {
            const imgRes = await fetch(url)
            if (imgRes.ok) {
              imageBuffer = Buffer.from(await imgRes.arrayBuffer())
              console.log(`[bg-image] fal (${model}) generated image, ${imageBuffer.byteLength} bytes`)
            }
          } else {
            console.error(`[bg-image] fal attempt ${attempt} failed:`, JSON.stringify(falData).slice(0, 200))
          }
        } catch (e) {
          console.error(`[bg-image] fal attempt ${attempt} threw:`, e?.message || e)
        }
      }
      if (!imageBuffer) console.error('[bg-image] fal failed — falling back to OpenAI')
    }

    // Reserve (og eldre stiler): OpenAI gpt-image-1. Retry opp til 3× — en enkelt
    // transient feil skal IKKE etterlate artikkelen permanent uten bilde.
    let b64 = null
    let lastErr = ''
    for (let attempt = 1; attempt <= 3 && !imageBuffer && OPENAI_API_KEY; attempt++) {
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
    if (!imageBuffer && b64) {
      imageBuffer = Buffer.from(b64, 'base64')
      console.log(`[bg-image] OpenAI image received, size: ${imageBuffer.byteLength} bytes`)
    }
    if (!imageBuffer) {
      console.error('[bg-image] All attempts failed:', lastErr)
      return new Response('Image generation failed after retries', { status: 500 })
    }

    let ext = 'png'
    let contentType = 'image/png'
    if (logoUrl) {
      console.log(`[bg-image] Adding full-width logo band: ${logoUrl}`)
      const banded = await addLogoBand(imageBuffer, logoUrl)
      imageBuffer = banded.buffer
      ext = banded.ext
      contentType = banded.contentType
    }

    const s3 = new S3Client({
      region: 'auto',
      endpoint: R2_ENDPOINT,
      credentials: {
        accessKeyId: R2_ACCESS_KEY_ID || '',
        secretAccessKey: R2_SECRET_ACCESS_KEY || '',
      },
    })

    const key = `images/articles/${randomUUID()}.${ext}`
    await s3.send(new PutObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: key,
      Body: imageBuffer,
      ContentType: contentType,
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
