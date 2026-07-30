import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

/**
 * Mottar ElevenLabs' webhooks om tilbaketrekking av delte stemmer.
 *
 * HVORFOR: proff-klonene i banken ligger på SKUESPILLERENS egen ElevenLabs-konto
 * og deles til oss — den eneste lovlige modellen. Skuespilleren kan slå delingen av
 * når som helst, og ved privat deling finnes ingen oppsigelsestid. Uten denne
 * webhooken ville vi først oppdaget det når en kundes produksjon feilet.
 *
 * Hendelser (fra ElevenLabs' dokumentasjon):
 *   voice_removal_notice            — stemmen er planlagt fjernet (oppsigelsestid løper)
 *   voice_removal_notice_withdrawn  — planen er trukket; stemmen blir
 *   voice_removed                   — stemmen er fjernet og kan ikke lenger brukes
 *
 * Registreres på elevenlabs.io/app/settings/webhooks med URL:
 *   https://<domene>/api/webhooks/elevenlabs?token=<ELEVENLABS_WEBHOOK_TOKEN>
 *
 * ⚠️ AUTENTISERING: ElevenLabs signerer med HMAC i `elevenlabs-signature`, men det
 * eksakte formatet er kun dokumentert gjennom deres SDK (`webhooks.constructEvent`),
 * som ikke er installert her. Vi gjetter ikke på et signaturformat — en feilgjettet
 * verifisering er verre enn ingen, fordi den ser trygg ut. Inntil SDK-en tas inn
 * autentiserer vi derfor på et hemmelig token i URL-en (capability-URL). Det er
 * svakere enn HMAC (URL-er kan havne i logger), så tokenet bør roteres ved mistanke.
 */

// Route Handlers caches ikke POST (Next 16) — ingen ekstra config nødvendig.

function db() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
  )
}

type WebhookEvent = {
  type?: string
  event_timestamp?: number | string
  data?: Record<string, unknown>
}

/** Plukker ut voice-id-en uansett hvilket felt de bruker. */
function voiceIdFrom(data: Record<string, unknown> | undefined): string | null {
  if (!data) return null
  for (const k of ['voice_id', 'voiceId', 'original_voice_id']) {
    const v = data[k]
    if (typeof v === 'string' && v.length > 0) return v
  }
  return null
}

async function varsleAdmin(subject: string, html: string): Promise<void> {
  const til = (process.env.ADMIN_EMAILS || '')
    .split(',').map((s) => s.trim()).filter(Boolean)
  if (!til.length || !process.env.RESEND_API_KEY) {
    console.warn('[webhooks/elevenlabs] ingen ADMIN_EMAILS/RESEND_API_KEY — varsel ikke sendt')
    return
  }
  try {
    const { Resend } = await import('resend')
    await new Resend(process.env.RESEND_API_KEY).emails.send({
      from: 'VoiceBank <hello@centerforge.app>',
      to: til,
      subject,
      html: `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:560px;padding:24px;color:#1C1A16">${html}</div>`,
    })
  } catch (e) {
    console.error('[webhooks/elevenlabs] varsel feilet:', e)
  }
}

export async function POST(request: Request) {
  // 1. Autentisering
  const forventet = process.env.ELEVENLABS_WEBHOOK_TOKEN
  if (!forventet) {
    console.error('[webhooks/elevenlabs] ELEVENLABS_WEBHOOK_TOKEN er ikke satt — avviser alt')
    return NextResponse.json({ error: 'Webhook not configured' }, { status: 503 })
  }
  if (new URL(request.url).searchParams.get('token') !== forventet) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
  }

  // 2. Les og tolk. Alt fra her returnerer 200 så lenge vi forstod meldingen —
  //    ElevenLabs auto-deaktiverer webhooks som gjentatte ganger svarer feil.
  let event: WebhookEvent
  try {
    event = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const type = String(event.type || '')
  const voiceId = voiceIdFrom(event.data)
  console.log('[webhooks/elevenlabs] mottok', type, voiceId ?? '(ingen voice_id)')

  if (!voiceId) {
    // Andre hendelsestyper (f.eks. post_call_transcription) angår ikke oss.
    return NextResponse.json({ received: true, ignored: type }, { status: 200 })
  }

  // Hvilken skuespiller er dette? Kan være flere rader (samme person hos to agenter).
  const { data: actors } = await db()
    .from('voice_actors')
    .select('id, name, owner_tenant_id, is_active')
    .eq('elevenlabs_voice_id', voiceId)

  if (!actors?.length) {
    console.warn('[webhooks/elevenlabs] ukjent voice_id i banken:', voiceId)
    return NextResponse.json({ received: true, unknown_voice: true }, { status: 200 })
  }
  const navn = actors.map((a) => a.name).join(', ')

  switch (type) {
    case 'voice_removed': {
      // Stemmen er borte. Idempotent: å sette is_active=false på nytt er ufarlig.
      await db().from('voice_actors').update({ is_active: false }).eq('elevenlabs_voice_id', voiceId)
      await varsleAdmin(
        `Stemme fjernet: ${navn}`,
        `<h2>Stemmen er trukket tilbake</h2>
         <p><strong>${navn}</strong> har fjernet stemmen sin hos ElevenLabs. Den er nå
         satt inaktiv i banken og kan ikke lenger brukes i produksjoner.</p>
         <p>Kunder med pågående kampanjer på denne stemmen bør kontaktes.</p>
         <p style="color:#6B6358;font-size:13px">voice_id: ${voiceId}</p>`
      )
      return NextResponse.json({ received: true, deactivated: true }, { status: 200 })
    }

    case 'voice_removal_notice': {
      // Oppsigelsestid løper — stemmen VIRKER fortsatt. Ikke deaktiver.
      const naar = event.data?.disable_at_unix
      const dato = typeof naar === 'number' ? new Date(naar * 1000).toLocaleDateString('nb-NO') : 'ukjent dato'
      await varsleAdmin(
        `Varsel: ${navn} trekker stemmen sin ${dato}`,
        `<h2>Stemme planlagt fjernet</h2>
         <p><strong>${navn}</strong> har varslet at stemmen fjernes <strong>${dato}</strong>.
         Den virker som normalt til da.</p>
         <p>Bruk tiden til å flytte kunder over til en annen stemme.</p>
         <p style="color:#6B6358;font-size:13px">voice_id: ${voiceId}</p>`
      )
      return NextResponse.json({ received: true, notice: true }, { status: 200 })
    }

    case 'voice_removal_notice_withdrawn': {
      await varsleAdmin(
        `Avblåst: ${navn} beholder stemmen`,
        `<h2>Tilbaketrekkingen er avblåst</h2>
         <p><strong>${navn}</strong> har trukket varselet. Stemmen blir i banken.</p>
         <p style="color:#6B6358;font-size:13px">voice_id: ${voiceId}</p>`
      )
      return NextResponse.json({ received: true, withdrawn: true }, { status: 200 })
    }

    default:
      return NextResponse.json({ received: true, ignored: type }, { status: 200 })
  }
}
