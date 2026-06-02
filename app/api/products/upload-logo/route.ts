import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const R2_ENDPOINT = process.env.R2_ENDPOINT
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME || 'contentforge-assets'
const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL || 'https://pub-5dcdfe9305a740febc87568c9ccb40a6.r2.dev'

export async function POST(request: Request) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File
    const productId = formData.get('productId') as string
    const logoType = (formData.get('logoType') as string) || 'default' // 'default' | 'article'
    const isArticleLogo = logoType === 'article'
    const field = isArticleLogo ? 'article_logo_url' : 'logo_url'

    if (!file || !productId) {
      return NextResponse.json({ error: 'Missing file or productId' }, { status: 400 })
    }

    console.log(`[upload-logo] Uploading ${field} for product ${productId}, size: ${file.size} bytes`)

    const buffer = Buffer.from(await file.arrayBuffer())
    const ext = file.name.split('.').pop()
    const key = `logos/${productId}/${isArticleLogo ? 'article-logo' : 'logo'}.${ext}`

    const r2 = new S3Client({
      region: 'auto',
      endpoint: R2_ENDPOINT!,
      credentials: {
        accessKeyId: R2_ACCESS_KEY_ID!,
        secretAccessKey: R2_SECRET_ACCESS_KEY!,
      },
    })

    await r2.send(
      new PutObjectCommand({
        Bucket: R2_BUCKET_NAME,
        Key: key,
        Body: buffer,
        ContentType: file.type,
      })
    )

    const url = `${R2_PUBLIC_URL}/${key}`
    console.log(`[upload-logo] Uploaded to R2: ${url}`)

    // Update product and product_profiles in Supabase
    const supabase = createClient(SUPABASE_URL || '', SUPABASE_SERVICE_ROLE_KEY || '')
    const { error } = await supabase.from('products').update({ [field]: url }).eq('id', productId)

    if (error) {
      console.error(`[upload-logo] Database update error:`, error)
      throw error
    }

    await supabase
      .from('product_profiles')
      .upsert({ product_id: productId, [field]: url }, { onConflict: 'product_id' })

    return NextResponse.json({ url })
  } catch (err: any) {
    console.error(`[upload-logo] Error:`, err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
