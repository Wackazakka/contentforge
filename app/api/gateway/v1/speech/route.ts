import { NextResponse } from 'next/server'
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import { authenticateKey, resolveAsset, hasBalance, customerPriceFor, admin } from '@/lib/gateway'
import { ratesForKind } from '@/lib/voiceBank'
import {
  isVoiceWithdrawn,
  deactivateWithdrawnActor,
  VOICE_WITHDRAWN,
  VOICE_WITHDRAWN_MESSAGE,
} from '@/lib/elevenlabsErrors'

const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL || 'https://pub-5dcdfe9305a740febc87568c9ccb40a6.r2.dev'

// POST /api/gateway/v1/speech  { assetId, text, format? }
// Genererer tale fra en skuespillerstemme. Kunden ser aldri ElevenLabs-ID-en;
// vår nøkkel brukes server-side, og bruken logges i royalty-hovedboken.
export async function POST(request: Request) {
  try {
    const auth = await authenticateKey(request)
    if (!auth) return NextResponse.json({ error: 'Ugyldig eller manglende API-nøkkel' }, { status: 401 })
    if (!auth.scopes.includes('speech')) {
      return NextResponse.json({ error: 'Nøkkelen har ikke tilgang til tale', code: 'SCOPE_DENIED' }, { status: 403 })
    }

    const { assetId, text, format } = await request.json()
    if (!assetId || !text || typeof text !== 'string') {
      return NextResponse.json({ error: 'Mangler assetId eller text' }, { status: 400 })
    }
    if (text.length > 5000) {
      return NextResponse.json({ error: 'Teksten er for lang (maks 5000 tegn per kall)' }, { status: 400 })
    }

    const actor = await resolveAsset(auth, assetId)
    if (!actor) return NextResponse.json({ error: 'Ukjent asset, eller ikke tilgjengelig for denne kontoen' }, { status: 404 })
    // Speilbildet av NO_FACE-guarden i /image: raden må faktisk ha en stemme
    if (!actor.elevenlabs_voice_id) {
      return NextResponse.json({ error: 'Denne skuespilleren har ikke lisensiert stemme', code: 'NO_VOICE' }, { status: 400 })
    }

    if (!(await hasBalance(auth.organizationId))) {
      return NextResponse.json({ error: 'Kontoen er tom. Kjøp mer kreditt for å fortsette.', code: 'ORG_BALANCE_EMPTY' }, { status: 402 })
    }

    // Generer tale med VÅR ElevenLabs-nøkkel + den ekte voice-ID-en
    const elevenRes = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${actor.elevenlabs_voice_id}`, {
      method: 'POST',
      headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY!, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text,
        model_id: 'eleven_turbo_v2_5',
        language_code: 'no',
        voice_settings: { stability: 0.5, similarity_boost: 0.75 },
      }),
    })
    if (!elevenRes.ok) {
      const detail = await elevenRes.text()
      // Skuespilleren kan ha trukket tilbake stemmen sin — en normal hendelse, ikke
      // en driftsfeil. Da skal kunden få klar beskjed, og stemmen ut av banken.
      if (isVoiceWithdrawn(elevenRes.status, detail)) {
        console.warn('[gateway/speech] stemme tilbaketrukket av eier:', actor.elevenlabs_voice_id)
        await deactivateWithdrawnActor(admin(), { actorId: actor.id })
        return NextResponse.json(
          { error: VOICE_WITHDRAWN_MESSAGE, code: VOICE_WITHDRAWN },
          { status: 409 }
        )
      }
      console.error('[gateway/speech] ElevenLabs-feil:', detail)
      return NextResponse.json({ error: 'Talegenerering feilet' }, { status: 502 })
    }
    const audio = Buffer.from(await elevenRes.arrayBuffer())

    // Last opp til R2
    const r2 = new S3Client({
      region: 'auto',
      endpoint: process.env.R2_ENDPOINT!,
      credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID!, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY! },
    })
    const key = `gateway/${auth.organizationId}/speech-${actor.id}-${Date.now()}.mp3`
    await r2.send(new PutObjectCommand({ Bucket: process.env.R2_BUCKET_NAME || 'contentforge-assets', Key: key, Body: audio, ContentType: 'audio/mpeg' }))
    const url = `${R2_PUBLIC_URL}/${key}`
    const { rate, price } = ratesForKind(actor, 'speech')

    // Krever skuespilleren å godkjenne bruk for denne kunden? Da holdes leveringen
    // tilbake, skuespilleren varsles, og innholdet frigis ved godkjenning/frist.
    const { getApprovalMode, createPendingApproval } = await import('@/lib/approvals')
    const approval = await getApprovalMode(actor.id, auth.organizationId)
    if (approval.mode === 'review') {
      const pending = await createPendingApproval({
        actorId: actor.id, organizationId: auth.organizationId, tenantId: auth.tenantId,
        assetType: 'voice', kind: 'speech', contentUrl: url, detail: text,
        actorRateNok: rate, customerPriceNok: price, timeoutHours: approval.timeoutHours,
      })
      if (!pending) return NextResponse.json({ error: 'Kunne ikke opprette godkjenning' }, { status: 500 })
      return NextResponse.json({ status: 'pending_approval', reviewId: pending.id, expiresAt: pending.expiresAt })
    }

    // Royalty-hendelse i samme hovedbok (frosne satser, merket som gateway-bruk)
    await admin().from('voice_usage_events').insert({
      actor_id: actor.id,
      used_by_tenant_id: auth.tenantId,
      actor_rate_nok: rate,
      customer_price_nok: price,
      asset_type: 'voice',
      meta: { kind: 'speech', source: 'gateway', organization_id: auth.organizationId, chars: text.length },
    })

    // Meter kundens forbruk (trekker forskuddssaldoen) — separat fra royalty-loggen,
    // akkurat som editoren logger både usage_events og voice_usage_events
    const customerPrice = await customerPriceFor(auth, actor, 'speech')
    await admin().from('usage_events').insert({
      tenant_id: auth.tenantId,
      organization_id: auth.organizationId,
      event_type: 'gateway_speech',
      cost_nok: price,                 // partner-basis (bankens kundepris)
      customer_cost_nok: customerPrice, // sluttkundens pris (hele kjeden) → trekkes fra saldo
      meta: { source: 'gateway', asset_id: actor.id, chars: text.length },
    })

    return NextResponse.json({ url, format: format || 'mp3', charged_nok: customerPrice })
  } catch (err: any) {
    console.error('[gateway/speech] Feil:', err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
