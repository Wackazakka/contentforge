import { NextResponse } from 'next/server'
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import { randomBytes } from 'crypto'

const R2_ENDPOINT = process.env.R2_ENDPOINT
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME || 'contentforge-assets'
const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL || 'https://pub-5dcdfe9305a740febc87568c9ccb40a6.r2.dev'

const ALLOWED_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
const MAX_SIZE = 8 * 1024 * 1024

export async function POST(request: Request) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File

    if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    if (!ALLOWED_TYPES.includes(file.type)) return NextResponse.json({ error: 'Kun JPG, PNG og WebP støttes' }, { status: 400 })
    if (file.size > MAX_SIZE) return NextResponse.json({ error: 'Maks filstørrelse er 8 MB' }, { status: 400 })

    const buffer = Buffer.from(await file.arrayBuffer())
    const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg'
    const id = randomBytes(8).toString('hex')
    const key = `avatars/images/${id}.${ext}`

    const r2 = new S3Client({
      region: 'auto',
      endpoint: R2_ENDPOINT!,
      credentials: { accessKeyId: R2_ACCESS_KEY_ID!, secretAccessKey: R2_SECRET_ACCESS_KEY! },
    })

    await r2.send(new PutObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: key,
      Body: buffer,
      ContentType: file.type,
    }))

    const url = `${R2_PUBLIC_URL}/${key}`
    return NextResponse.json({ url })
  } catch (err: any) {
    console.error('[avatar/upload-image]', err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
