import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import { randomUUID } from 'crypto'
import { getTenant } from '@/lib/tenantServer'

// «Bli en stemme i banken» — offentlig søknad med lydprøver i ETT multipart-kall
// (ingen foreldreløse opplastinger). Gate: tenantens accept_actor_applications.

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const R2_ENDPOINT = process.env.R2_ENDPOINT
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME || 'contentforge-assets'
const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL || 'https://pub-5dcdfe9305a740febc87568c9ccb40a6.r2.dev'

const MAX_BYTES = 10 * 1024 * 1024
// MIME → trygg filendelse (endelsen hentes ALDRI fra filnavnet)
const AUDIO_TYPES: Record<string, string> = {
  'audio/mpeg': 'mp3',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/x-m4a': 'm4a',
  'audio/mp4': 'm4a',
}

function admin() {
  return createClient(SUPABASE_URL || '', SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '')
}

export async function POST(request: Request) {
  try {
    const form = await request.formData()

    // Honeypot — bots fyller alt
    if (String(form.get('website') || '')) return NextResponse.json({ ok: true })

    const tenant = await getTenant()
    if (tenant.id === 'root' || tenant.accept_actor_applications !== true) {
      return NextResponse.json({ error: 'Denne banken tar ikke imot åpne søknader' }, { status: 403 })
    }

    const name = String(form.get('name') || '').trim()
    const email = String(form.get('email') || '').trim()
    if (!name || !email.includes('@')) {
      return NextResponse.json({ error: 'Navn og gyldig e-post må fylles ut' }, { status: 400 })
    }

    const offersVoice = String(form.get('offersVoice') || '1') === '1'
    const wantsFace = String(form.get('wantsFace') || '') === '1'
    if (!offersVoice && !wantsFace) {
      return NextResponse.json({ error: 'Velg minst ett aktivum: stemme eller ansikt' }, { status: 400 })
    }
    const samples = form.getAll('samples').filter((f): f is File => f instanceof File).slice(0, 2)
    if (offersVoice && samples.length === 0) return NextResponse.json({ error: 'Minst én lydprøve må lastes opp når du tilbyr stemmen' }, { status: 400 })
    for (const f of samples) {
      if (f.size > MAX_BYTES) return NextResponse.json({ error: 'Lydfil for stor (maks 10 MB)' }, { status: 413 })
      if (!AUDIO_TYPES[f.type]) return NextResponse.json({ error: 'Kun MP3, WAV eller M4A' }, { status: 415 })
    }

    const r2 = new S3Client({
      region: 'auto',
      endpoint: R2_ENDPOINT!,
      credentials: { accessKeyId: R2_ACCESS_KEY_ID!, secretAccessKey: R2_SECRET_ACCESS_KEY! },
    })
    const applicationId = randomUUID()
    const sampleUrls: string[] = []
    for (const f of samples) {
      const key = `voice-applications/${applicationId}/sample-${Date.now()}-${sampleUrls.length}.${AUDIO_TYPES[f.type]}`
      await r2.send(new PutObjectCommand({
        Bucket: R2_BUCKET_NAME,
        Key: key,
        Body: Buffer.from(await f.arrayBuffer()),
        ContentType: f.type,
      }))
      sampleUrls.push(`${R2_PUBLIC_URL}/${key}`)
    }

    const { error } = await admin().from('voice_actor_applications').insert({
      id: applicationId,
      tenant_id: tenant.id,
      name,
      email,
      phone: String(form.get('phone') || '').trim() || null,
      bio: String(form.get('bio') || '').slice(0, 2000) || null,
      sample_urls: sampleUrls,
      wants_face: wantsFace,
      offers_voice: offersVoice,
      consent_text: String(form.get('consentText') || '').slice(0, 2000) || null,
    })
    if (error) {
      console.error('[voice-apply] Insert-feil:', error.message)
      return NextResponse.json({ error: 'Kunne ikke lagre søknaden — prøv igjen' }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    console.error('[voice-apply] Feil:', err.message)
    return NextResponse.json({ error: 'Noe gikk galt — prøv igjen' }, { status: 500 })
  }
}
