import { NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL || 'https://pub-5dcdfe9305a740febc87568c9ccb40a6.r2.dev'

// Presigned PUT-URL så nettleseren kan laste zip-en rett til R2
// (Netlify-funksjoner har ~6MB body-grense — treningsbilder er større).
export async function GET() {
  try {
    const s3 = new S3Client({
      region: 'auto',
      endpoint: process.env.R2_ENDPOINT,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID || '',
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || '',
      },
    })
    const key = `characters/zips/${randomUUID()}.zip`
    const uploadUrl = await getSignedUrl(
      s3,
      new PutObjectCommand({
        Bucket: process.env.R2_BUCKET_NAME || 'contentforge-assets',
        Key: key,
        ContentType: 'application/zip',
      }),
      { expiresIn: 600 }
    )
    return NextResponse.json({ uploadUrl, publicUrl: `${R2_PUBLIC_URL}/${key}` })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
