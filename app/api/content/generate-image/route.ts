import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import { createClient } from '@supabase/supabase-js'
import { compositeLogoOnImage } from '@/lib/image-logo'
import { getCharacter } from '@/lib/characters'

const OPENAI_API_KEY = process.env.OPENAI_API_KEY
const FAL_KEY = process.env.CONTENTFORGE_FAL_KEY
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
  logoUrl?: string
  articleIds?: string[]
  imageSize?: '1024x1024' | '1024x1536' | '1536x1024'
  imageStyle?: 'tech' | 'cinematic' | 'warm' | 'surreal' | 'manga'
  character?: string
  draftId?: string
}

// Anonyme drafts: tak på antall bildegenereringer (hindrer API-brenning før betaling)
const ANON_IMAGE_CAP = 24

const VIDEO_STYLE_PROMPTS: Record<string, string> = {
  tech:      'Cutting-edge technology product scene, ultra-sharp macro details, dramatic directional lighting with deep contrasting shadows, floating holographic elements, premium industrial materials — brushed metal, matte glass, anodized surfaces — shot as if for a flagship product launch. Sophisticated and visually arresting.',
  cinematic: 'Cinematic wide-angle scene, dramatic natural or artificial lighting, rich color grading, strong visual narrative, high production value, feels like a movie still or premium documentary. Emotionally resonant.',
  warm:      'Warm lifestyle photograph style, soft natural light, organic textures, earthy tones with golden accents, shallow depth of field, inviting and human-centered composition, Instagram editorial aesthetic.',
  surreal:   'Sophisticated conceptual surrealism, dreamlike scene with unexpected juxtapositions, photorealistic rendering of impossible scenarios, thought-provoking and visually arresting, Dalí meets contemporary advertising.',
  manga:     'Dynamic manga-inspired digital illustration, bold clean outlines, dramatic foreshortening and perspective, high-contrast cel shading, expressive visual energy, cinematic panel composition, Studio Ghibli meets modern Japanese editorial design. Sophisticated, not childish.',
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
      // 'low' (~10s) holder oss trygt under Netlifys ~26s synkron-grense — 'high'/'medium'
      // (~25-40s) timet ut CDN-funksjonen → HTML 502 («Unexpected token '<'»). Lav kvalitet
      // er greit for et segment som vises kort i en 9:16-video.
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

// Karakter-modus: generer segmentbildet med fal flux-lora (trent persona) i stedet
// for gpt-image — samme vert i alle segmenter. Trigger-ord + karakterblokk + scene.
// Slå opp karakter: innebygd (Adam/Lawrence) eller brukerens egen (user_characters).
async function resolveCharacter(characterId: string) {
  const builtin = getCharacter(characterId)
  if (builtin) {
    // Eksklusivitet håndheves server-side: begrenset karakter avvises på feil tenant
    if (builtin.restrictToTenantSlug) {
      const { getTenant } = await import('@/lib/tenantServer')
      const tenant = await getTenant()
      if (tenant.slug !== builtin.restrictToTenantSlug) return null
    }
    return builtin
  }
  const supabase = createClient(SUPABASE_URL || '', SUPABASE_SERVICE_ROLE_KEY || '')
  const { data } = await supabase.from('user_characters').select('*').eq('id', characterId).single()
  if (data && data.status === 'ready' && data.lora_url) {
    // Sikring (2026-07-29): karakteren må være tilgjengelig for HOST-tenanten —
    // enten eid i egen kjede, eller ansiktet på en tilgjengelig bankrad.
    // Defensivt: mangler owner-kolonnen (pre-migrasjon) regnes eierskapet som ukjent → tillat kjede-stien ikke; bank-stien sjekkes uansett.
    try {
      const { getTenant } = await import('@/lib/tenantServer')
      const { tenantChainUp, getAvailableFaceActors } = await import('@/lib/voiceBank')
      const tenant = await getTenant()
      const chain = tenant.id === 'root' ? [] : await tenantChainUp(tenant.id)
      const ownedInChain = data.owner_tenant_id ? chain.includes(data.owner_tenant_id) : false
      let viaBank = false
      if (!ownedInChain && tenant.id !== 'root') {
        const faces = await getAvailableFaceActors(tenant.id)
        viaBank = faces.some((f) => (f as { face_character_id?: string | null }).face_character_id === characterId)
      }
      // Rot-tenanten (inkl. dropletens server-til-server-render) beholder full tilgang
      if (tenant.id !== 'root' && !ownedInChain && !viaBank) return null
    } catch { /* sikringen skal aldri velte bildegenereringen for rot */ }
    return {
      id: data.id,
      name: data.name,
      trigger: data.trigger_word,
      loraUrl: data.lora_url,
      characterBlock: data.trigger_word + ', natural appearance, natural relaxed posture',
    }
  }
  return null
}

async function generateCharacterImageBuffer(
  topic: string,
  characterId: string,
  imageSize: string = '1024x1536'
): Promise<Buffer> {
  const ch = await resolveCharacter(characterId)
  if (!ch) throw new Error('Ukjent eller ikke-klar karakter: ' + characterId)
  if (!ch.loraUrl) throw new Error('LoRA-URL mangler for ' + ch.name + ' (sett env ' + ch.id.toUpperCase() + '_LORA_URL i Netlify)')
  if (!FAL_KEY) throw new Error('CONTENTFORGE_FAL_KEY mangler i Netlify env')

  const SIZE_MAP: Record<string, { width: number; height: number }> = {
    '1024x1024': { width: 1024, height: 1024 },
    '1024x1536': { width: 768, height: 1344 },
    '1536x1024': { width: 1344, height: 768 },
  }
  const image_size = SIZE_MAP[imageSize] || SIZE_MAP['1024x1536']

  const prompt =
    ch.trigger + '. Use the trained ' + ch.trigger + ' LoRA with maximum identity fidelity. ' +
    ch.characterBlock + '. Scene: ' + topic +
    '. Photorealistic, professional photography, cinematic lighting. No text, letters or typography in the image.'

  console.log('[generateImage] Karakter-modus (' + ch.name + ') via fal flux-lora')
  const auth = { Authorization: 'Key ' + FAL_KEY }
  const submitRes = await fetch('https://queue.fal.run/fal-ai/flux-lora', {
    method: 'POST',
    headers: { ...auth, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt,
      loras: [{ path: ch.loraUrl, scale: 1.0 }],
      image_size,
      num_images: 1,
      output_format: 'png',
    }),
  })
  const submit = await submitRes.json().catch(() => ({}))
  if (!submitRes.ok || !submit.request_id) {
    throw new Error('fal flux-lora submit feilet: ' + JSON.stringify(submit).slice(0, 300))
  }
  const statusUrl = submit.status_url || 'https://queue.fal.run/fal-ai/flux-lora/requests/' + submit.request_id + '/status'
  const resultUrl = submit.response_url || 'https://queue.fal.run/fal-ai/flux-lora/requests/' + submit.request_id

  // flux-lora er rask (~5-15s); kort poll for å holde oss under Netlifys ~26s-grense
  const deadline = Date.now() + 22_000
  let status = 'IN_QUEUE'
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 1500))
    const st = await fetch(statusUrl, { headers: auth }).then((r) => r.json()).catch(() => ({}))
    status = st.status || status
    if (status === 'COMPLETED') break
    if (status === 'FAILED' || status === 'ERROR') throw new Error('fal flux-lora ' + status)
  }
  if (status !== 'COMPLETED') throw new Error('fal flux-lora tidsavbrudd')

  const result = await fetch(resultUrl, { headers: auth }).then((r) => r.json())
  const url = result?.images?.[0]?.url || result?.data?.images?.[0]?.url
  if (!url) throw new Error('fal flux-lora: ingen bilde-URL')
  return Buffer.from(await (await fetch(url)).arrayBuffer())
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
    const { topic, productId, logoUrl, articleIds, imageSize = '1024x1024', imageStyle, character, draftId } = body

    if (!topic || !productId) {
      return NextResponse.json({ error: 'Missing topic or productId' }, { status: 400 })
    }

    if (!OPENAI_API_KEY && !character) {
      return NextResponse.json({ error: 'OPENAI_API_KEY not set' }, { status: 500 })
    }

    // Anon-caps: for drafts uten eier begrenses antall genereringer, og
    // karakter-modus (dyrere flux-lora) er forbeholdt registrerte.
    // KUN når billing er aktivert — i gratisfasen har alle drafts user_id NULL.
    if (draftId && process.env.BILLING_ENABLED === 'true') {
      const supabase = createClient(SUPABASE_URL || '', SUPABASE_SERVICE_ROLE_KEY || '')
      const { data: draft } = await supabase
        .from('production_drafts')
        .select('user_id, anon_image_count')
        .eq('id', draftId)
        .single()
      if (draft && !draft.user_id) {
        if (character) {
          return NextResponse.json({ error: 'Karakter-modus krever konto. Registrer deg (33 % rabatt) for å bruke egne karakterer.' }, { status: 403 })
        }
        if ((draft.anon_image_count || 0) >= ANON_IMAGE_CAP) {
          return NextResponse.json({ error: 'Grensen for bildegenerering uten konto er nådd. Registrer deg for å fortsette (33 % rabatt).' }, { status: 429 })
        }
        await supabase
          .from('production_drafts')
          .update({ anon_image_count: (draft.anon_image_count || 0) + 1 })
          .eq('id', draftId)
      }
    }

    console.log('[generateImage] ===== START:  + topic +  =====')

    let imageBuffer = character
      ? await generateCharacterImageBuffer(topic, character, imageSize)
      : await generateImageBuffer(topic, imageSize, imageStyle)

    // Composite product logo onto bottom-right if provided
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

    // Stemmebank: ansikts-royalty når bildet er laget med en registrert
    // rettighetshavers LoRA-ansikt. Uten dette kunne en kunde lage
    // artikkelbilder og annonsemateriell med en skuespillers ansikt uten at det
    // ble registrert noe sted — video-veien (start-production) og gateway-veien
    // (gateway/v1/image) logget allerede, denne ikke. viaBank-sjekken i
    // resolveCharacter avgjorde bare TILGANG, ikke oppgjør.
    // logFaceUsage returnerer stille hvis karakteren ikke tilhører en
    // skuespillerrad, så Norditechs egne figurer gir ingen rader.
    // NB: awaites bevisst — et uavventet løfte kan bli avlivet når svaret
    // returneres, og da forsvinner royalty-raden stille.
    if (character) {
      try {
        const { getProductTenant } = await import('@/lib/tenantBilling')
        const { logFaceUsage } = await import('@/lib/voiceBank')
        const pt = await getProductTenant(productId)
        if (pt.tenantId) {
          await logFaceUsage({
            characterId: character,
            usedByTenantId: pt.tenantId,
            organizationId: pt.organizationId,
            productId,
            draftId: draftId || null,
          })
        }
      } catch (royErr) {
        console.warn('[generateImage] ansikts-royalty feilet (ignoreres):', royErr)
      }
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

    // Server-side kost-akkumulering (atomisk RPC) — klientens addCost er kun visning
    if (draftId) {
      try {
        const supabase = createClient(SUPABASE_URL || '', SUPABASE_SERVICE_ROLE_KEY || '')
        const { COSTS_NOK } = await import('@/lib/costs')
        await supabase.rpc('add_draft_cost', {
          p_draft_id: draftId,
          p_amount: character ? COSTS_NOK.imageCharacter : COSTS_NOK.imageStandard,
        })
      } catch (costErr) {
        console.warn('[generateImage] add_draft_cost feilet:', costErr)
      }
      // Tenant-måling (white-label-faktura)
      const { logUsageEvent } = await import('@/lib/tenantBilling')
      const { COSTS_NOK: C2 } = await import('@/lib/costs')
      logUsageEvent({ productId, draftId, eventType: 'image', costNok: character ? C2.imageCharacter : C2.imageStandard, meta: { character: character || null } })
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
