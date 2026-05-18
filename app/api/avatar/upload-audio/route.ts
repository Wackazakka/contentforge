import { NextRequest, NextResponse } from 'next/server'
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'

const R2_ENDPOINT = process.env.R2_ENDPOINT
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME || 'contentforge-assets'
const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL || 'https://pub-5dcdfe9305a740febc87568c9ccb40a6.r2.dev'

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File
    const jobId = formData.get('jobId') as string
    const segmentIndex = formData.get('segmentIndex') as string

    if (!file || !jobId) {
      return NextResponse.json({ error: 'Missing file or jobId' }, { status: 400 })
    }

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
