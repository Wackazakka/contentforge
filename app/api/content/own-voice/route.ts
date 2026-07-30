import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'

// «Les inn selv» (2026-07-30): artistens egen innspilte voiceover per segment.
// Fila lander i R2 og settes som segmentets voiceover_url — dropleten bruker
// den i stedet for å generere TTS (transkoder webm/mp4 → mp3 ved behov).

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const R2_ENDPOINT = process.env.R2_ENDPOINT
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME || 'contentforge-assets'
const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL || 'https://pub-5dcdfe9305a740febc87568c9ccb40a6.r2.dev'

const MAX_BYTES = 20 * 1024 * 1024
const EXT_BY_TYPE: Record<string, string> = {
  'audio/mpeg': 'mp3', 'audio/mp3': 'mp3', 'audio/webm': 'webm',
  'audio/mp4': 'm4a', 'audio/x-m4a': 'm4a', 'audio/wav': 'wav', 'audio/x-wav': 'wav',
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData()
    const file = formData.get('file')
    const draftId = String(formData.get('draftId') || '')
    const productId = String(formData.get('productId') || '')
    const segmentIndex = String(formData.get('segmentIndex') || '')
    if (!file || !(file instanceof File)) return NextResponse.json({ error: 'Ingen fil' }, { status: 400 })
    if (!draftId || !productId || segmentIndex === '') {
      return NextResponse.json({ error: 'draftId, productId og segmentIndex kreves' }, { status: 400 })
    }
    const baseType = (file.type || '').split(';')[0].trim()
    const ext = EXT_BY_TYPE[baseType]
    if (!ext) return NextResponse.json({ error: `Lydformatet «${baseType || 'ukjent'}» støttes ikke — bruk MP3, M4A, WAV eller nettleseropptak` }, { status: 400 })
    if (file.size > MAX_BYTES) return NextResponse.json({ error: 'Fila er for stor (maks 20 MB)' }, { status: 400 })

    // Eierskap: brukerens token mot RLS (products er kun synlig for eieren)
    const supabase = createClient(SUPABASE_URL || '', SUPABASE_SERVICE_ROLE_KEY || '')
    const auth = request.headers.get('authorization')
    if (!auth?.startsWith('Bearer ')) return NextResponse.json({ error: 'Ikke innlogget' }, { status: 401 })
    const token = auth.slice(7)
    const { data: u } = await supabase.auth.getUser(token)
    if (!u?.user?.id) return NextResponse.json({ error: 'Ikke innlogget' }, { status: 401 })
    const asUser = createClient(SUPABASE_URL || '', process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '', {
      global: { headers: { Authorization: `Bearer ${token}` } },
    })
    const { data: prod } = await asUser.from('products').select('id').eq('id', productId).maybeSingle()
    if (!prod) return NextResponse.json({ error: 'Ingen tilgang til dette produktet' }, { status: 403 })

    const idx = Math.max(0, parseInt(segmentIndex, 10) || 0)
    // Tidsstempel i nøkkelen: ny innspilling skal aldri caches som den gamle
    const key = `own-voice/${draftId}/seg_${idx}_${Date.now()}.${ext}`
    const buffer = Buffer.from(await file.arrayBuffer())
    const r2 = new S3Client({
      region: 'auto',
      endpoint: R2_ENDPOINT!,
      credentials: { accessKeyId: R2_ACCESS_KEY_ID!, secretAccessKey: R2_SECRET_ACCESS_KEY! },
    })
    await r2.send(new PutObjectCommand({ Bucket: R2_BUCKET_NAME, Key: key, Body: buffer, ContentType: baseType }))
    const url = `${R2_PUBLIC_URL}/${key}`
    console.log(`[own-voice] Uploaded ${key} (${file.size} bytes)`)
    return NextResponse.json({ url })
  } catch (err: any) {
    console.error('[own-voice] Error:', err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
