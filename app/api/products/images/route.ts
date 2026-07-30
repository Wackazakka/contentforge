import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { S3Client, PutObjectCommand, ListObjectsV2Command, DeleteObjectCommand } from '@aws-sdk/client-s3'

// Bildebibliotek per produkt (artist-vertikalen, 2026-07-30): pressebilder og
// utgivelses-artwork lastes opp én gang og gjenbrukes som segmentbilder i
// produksjonene. Lars' premiss: for artister duger KUN egne bilder og eget
// artwork — AI-genererte «generiske band» er feil band.

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const R2_ENDPOINT = process.env.R2_ENDPOINT
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME || 'contentforge-assets'
const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL || 'https://pub-5dcdfe9305a740febc87568c9ccb40a6.r2.dev'

const MAX_BYTES = 8 * 1024 * 1024 // pressebilder er større enn logoer
const ALLOWED = /^image\/(png|jpeg|webp)$/

function r2Client() {
  return new S3Client({
    region: 'auto',
    endpoint: R2_ENDPOINT!,
    credentials: { accessKeyId: R2_ACCESS_KEY_ID!, secretAccessKey: R2_SECRET_ACCESS_KEY! },
  })
}

// Auth + eierskap: samme mønster som upload-logo — brukerens token mot RLS
// (products-select er eier-av-org, så raden er kun synlig for eieren).
async function assertOwnership(request: Request, productId: string): Promise<boolean> {
  const supabase = createClient(SUPABASE_URL || '', SUPABASE_SERVICE_ROLE_KEY || '')
  const auth = request.headers.get('authorization')
  if (!auth?.startsWith('Bearer ')) return false
  const token = auth.slice(7)
  const { data: u } = await supabase.auth.getUser(token)
  if (!u?.user?.id) return false
  const asUser = createClient(SUPABASE_URL || '', process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '', {
    global: { headers: { Authorization: `Bearer ${token}` } },
  })
  const { data: prod } = await asUser.from('products').select('id').eq('id', productId).maybeSingle()
  return !!prod
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url)
    const productId = url.searchParams.get('productId') || ''
    if (!productId) return NextResponse.json({ error: 'productId mangler' }, { status: 400 })
    if (!(await assertOwnership(request, productId))) {
      return NextResponse.json({ error: 'Ingen tilgang til dette produktet' }, { status: 403 })
    }
    const res = await r2Client().send(
      new ListObjectsV2Command({ Bucket: R2_BUCKET_NAME, Prefix: `artist-images/${productId}/`, MaxKeys: 200 })
    )
    const images = (res.Contents || [])
      .sort((a, b) => (b.LastModified?.getTime() || 0) - (a.LastModified?.getTime() || 0))
      .map((o) => ({
        url: `${R2_PUBLIC_URL}/${o.Key}`,
        name: (o.Key || '').split('/').pop() || '',
      }))
    return NextResponse.json({ images })
  } catch (err: any) {
    console.error('[products/images] List error:', err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function DELETE(request: Request) {
  try {
    const url = new URL(request.url)
    const productId = url.searchParams.get('productId') || ''
    const name = url.searchParams.get('name') || ''
    if (!productId || !name) return NextResponse.json({ error: 'productId og name kreves' }, { status: 400 })
    // Nøkkelen bygges ALLTID fra productId + filnavn uten sti — kan aldri
    // peke utenfor produktets egen mappe.
    if (name.includes('/') || name.includes('..')) {
      return NextResponse.json({ error: 'Ugyldig filnavn' }, { status: 400 })
    }
    if (!(await assertOwnership(request, productId))) {
      return NextResponse.json({ error: 'Ingen tilgang til dette produktet' }, { status: 403 })
    }
    const key = `artist-images/${productId}/${name}`
    await r2Client().send(new DeleteObjectCommand({ Bucket: R2_BUCKET_NAME, Key: key }))
    console.log(`[products/images] Deleted ${key}`)
    return NextResponse.json({ success: true })
  } catch (err: any) {
    console.error('[products/images] Delete error:', err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData()
    const file = formData.get('file')
    const productId = String(formData.get('productId') || '')
    if (!file || !(file instanceof File)) return NextResponse.json({ error: 'Ingen fil' }, { status: 400 })
    if (!productId) return NextResponse.json({ error: 'productId mangler' }, { status: 400 })
    if (!ALLOWED.test(file.type)) return NextResponse.json({ error: 'Kun PNG, JPG eller WebP' }, { status: 400 })
    if (file.size > MAX_BYTES) return NextResponse.json({ error: 'Filen er for stor (maks 8 MB)' }, { status: 400 })
    if (!(await assertOwnership(request, productId))) {
      return NextResponse.json({ error: 'Ingen tilgang til dette produktet' }, { status: 403 })
    }

    const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg'
    const base = (file.name.replace(/\.[^.]+$/, '') || 'bilde')
      .toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').slice(0, 60)
    const key = `artist-images/${productId}/${Date.now()}-${base}.${ext}`
    const buffer = Buffer.from(await file.arrayBuffer())
    await r2Client().send(
      new PutObjectCommand({ Bucket: R2_BUCKET_NAME, Key: key, Body: buffer, ContentType: file.type })
    )
    const url = `${R2_PUBLIC_URL}/${key}`
    console.log(`[products/images] Uploaded ${key} (${file.size} bytes)`)
    return NextResponse.json({ url, name: key.split('/').pop() })
  } catch (err: any) {
    console.error('[products/images] Upload error:', err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
