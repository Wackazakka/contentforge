import { NextResponse } from 'next/server'
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import { authenticateKey, resolveAsset, hasBalance, customerPriceFor, generateFaceImage, admin } from '@/lib/gateway'
import { ratesForKind } from '@/lib/voiceBank'

const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL || 'https://pub-5dcdfe9305a740febc87568c9ccb40a6.r2.dev'

// POST /api/gateway/v1/image  { assetId, prompt, imageSize? }
// Genererer et bilde fra en skuespillers ansikt (Flux LoRA). LoRA-vektene
// forlater aldri serveren; kunden får bildet, ikke modellen. Logges i samme
// royalty-hovedbok (asset_type='face') og trekker forskuddssaldoen.
export async function POST(request: Request) {
  try {
    const auth = await authenticateKey(request)
    if (!auth) return NextResponse.json({ error: 'Ugyldig eller manglende API-nøkkel' }, { status: 401 })
    if (!auth.scopes.includes('image')) {
      return NextResponse.json({ error: 'Nøkkelen har ikke tilgang til bilde', code: 'SCOPE_DENIED' }, { status: 403 })
    }

    const { assetId, prompt, imageSize } = await request.json()
    if (!assetId || !prompt || typeof prompt !== 'string') {
      return NextResponse.json({ error: 'Mangler assetId eller prompt' }, { status: 400 })
    }
    if (prompt.length > 2000) {
      return NextResponse.json({ error: 'Prompten er for lang (maks 2000 tegn)' }, { status: 400 })
    }

    const actor = await resolveAsset(auth, assetId)
    if (!actor) return NextResponse.json({ error: 'Ukjent asset, eller ikke tilgjengelig for denne kontoen' }, { status: 404 })
    if (!actor.face_character_id) {
      return NextResponse.json({ error: 'Denne skuespilleren har ikke lisensiert ansikt', code: 'NO_FACE' }, { status: 400 })
    }

    if (!(await hasBalance(auth.organizationId))) {
      return NextResponse.json({ error: 'Kontoen er tom. Kjøp mer kreditt for å fortsette.', code: 'ORG_BALANCE_EMPTY' }, { status: 402 })
    }

    // Generer bildet med VÅR fal-nøkkel + den ekte LoRA-stien (aldri utlevert)
    let png: Buffer
    try {
      png = await generateFaceImage(actor.face_character_id, prompt, imageSize || '1024x1536')
    } catch (genErr: any) {
      console.error('[gateway/image] fal-feil:', genErr.message)
      return NextResponse.json({ error: 'Bildegenerering feilet' }, { status: 502 })
    }

    // Last opp til R2
    const r2 = new S3Client({
      region: 'auto',
      endpoint: process.env.R2_ENDPOINT!,
      credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID!, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY! },
    })
    const key = `gateway/${auth.organizationId}/image-${actor.id}-${Date.now()}.png`
    await r2.send(new PutObjectCommand({ Bucket: process.env.R2_BUCKET_NAME || 'contentforge-assets', Key: key, Body: png, ContentType: 'image/png' }))
    const url = `${R2_PUBLIC_URL}/${key}`

    // Royalty-hendelse (frosne face-satser, merket gateway-bruk)
    const { rate, price } = ratesForKind(actor, 'face')
    await admin().from('voice_usage_events').insert({
      actor_id: actor.id,
      used_by_tenant_id: auth.tenantId,
      actor_rate_nok: rate,
      customer_price_nok: price,
      asset_type: 'face',
      meta: { kind: 'face', source: 'gateway', organization_id: auth.organizationId },
    })

    // Meter kundens forbruk (trekker forskuddssaldoen)
    const customerPrice = await customerPriceFor(auth, actor, 'face')
    await admin().from('usage_events').insert({
      tenant_id: auth.tenantId,
      organization_id: auth.organizationId,
      event_type: 'gateway_image',
      cost_nok: price,
      customer_cost_nok: customerPrice,
      meta: { source: 'gateway', asset_id: actor.id },
    })

    return NextResponse.json({ url, charged_nok: customerPrice })
  } catch (err: any) {
    console.error('[gateway/image] Feil:', err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
