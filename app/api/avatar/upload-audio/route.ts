import { NextRequest, NextResponse } from 'next/server'
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import { krevInnlogget, krevProdukteier } from '@/lib/routeAuth'

const R2_ENDPOINT = process.env.R2_ENDPOINT
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME || 'contentforge-assets'
const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL || 'https://pub-5dcdfe9305a740febc87568c9ccb40a6.r2.dev'

// Ferdige TTS-segmenter (preview-voice) er små; dette er sikkerhetsventilen
const MAX_SIZE = 25 * 1024 * 1024

export async function POST(request: NextRequest) {
  try {
    // Innlogging + eierskap (25.10.2026): før kunne hvem som helst legge lyd
    // i den offentlige bøtta. Tokenet sjekkes før kroppen leses.
    const bruker = await krevInnlogget(request)
    if (bruker instanceof NextResponse) return bruker

    const formData = await request.formData()
    const nei = await krevProdukteier(bruker.token, String(formData.get('productId') || ''))
    if (nei) return nei
    const file = formData.get('file')
    const jobId = String(formData.get('jobId') || '')
    const segmentIndex = Math.max(0, parseInt(String(formData.get('segmentIndex') ?? ''), 10) || 0)

    if (!file || !(file instanceof File) || !jobId) {
      return NextResponse.json({ error: 'Missing file or jobId' }, { status: 400 })
    }
    // jobId er en klientlaget UUID og havner i nøkkelen — ingen skråstreker
    if (!/^[A-Za-z0-9-]{8,64}$/.test(jobId)) {
      return NextResponse.json({ error: 'Ugyldig jobId' }, { status: 400 })
    }
    if (file.size > MAX_SIZE) return NextResponse.json({ error: 'Fila er for stor (maks 25 MB)' }, { status: 400 })

    const buffer = Buffer.from(await file.arrayBuffer())
    const key = `avatars/segments/${jobId}/seg_${segmentIndex}.mp3`

    const r2 = new S3Client({
      region: 'auto',
      endpoint: R2_ENDPOINT!,
      credentials: { accessKeyId: R2_ACCESS_KEY_ID!, secretAccessKey: R2_SECRET_ACCESS_KEY! },
    })

    await r2.send(new PutObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: key,
      Body: buffer,
      ContentType: 'audio/mpeg',
    }))

    return NextResponse.json({ url: `${R2_PUBLIC_URL}/${key}` })
  } catch (err: any) {
    console.error('[avatar/upload-audio] Error:', err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
