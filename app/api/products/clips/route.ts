import { NextResponse } from 'next/server'
import { S3Client, ListObjectsV2Command, DeleteObjectCommand } from '@aws-sdk/client-s3'
import { createClient } from '@supabase/supabase-js'

// Artistens klippbibliotek (Lars 2/8: «klippene tilhører artisten … burde
// være mulig å legge i en katalog som inneholder alt materiale for kun
// artisten»). Alle genererte bevegelsesklipp havner under
// artist-clips/<productId>/ og er dermed gjenfinnbare uansett hva som skjer
// med klipp-fingeravtrykkene — det var nettopp det som gjorde eldre klipp
// utilgjengelige i dag.

const BUCKET = process.env.R2_BUCKET_NAME || 'contentforge-assets'
// R2_PUBLIC_URL finnes paa dropleten, men IKKE i Netlify-miljoeet — uten
// fallback ble klipp-URL-ene relative og videoene lastet aldri (Lars 2/8).
// Samme fallback som avatar-rutene bruker.
const PUBLIC = process.env.R2_PUBLIC_URL || 'https://pub-5dcdfe9305a740febc87568c9ccb40a6.r2.dev'

function r2() {
  return new S3Client({
    region: 'auto',
    endpoint: process.env.R2_ENDPOINT,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID || '',
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || '',
    },
  })
}

// Eierskap: brukeren må eie produktet. Leses med brukerens eget token, så
// RLS avgjør — samme mønster som bildebiblioteket.
async function eierProduktet(token: string, productId: string): Promise<boolean> {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL || '',
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
      { global: { headers: { Authorization: `Bearer ${token}` } } }
    )
    const { data } = await supabase.from('products').select('id').eq('id', productId).single()
    return !!data
  } catch {
    return false
  }
}

export async function GET(request: Request) {
  const url = new URL(request.url)
  const productId = url.searchParams.get('productId') || ''
  if (!productId) return NextResponse.json({ error: 'productId kreves' }, { status: 400 })
  const auth = request.headers.get('authorization') || ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  if (!token || !(await eierProduktet(token, productId))) {
    return NextResponse.json({ error: 'Ingen tilgang' }, { status: 403 })
  }
  try {
    const res = await r2().send(new ListObjectsV2Command({
      Bucket: BUCKET,
      Prefix: `artist-clips/${productId}/`,
    }))
    const clips = (res.Contents || [])
      .filter((o) => (o.Key || '').endsWith('.mp4'))
      .sort((a, b) => (b.LastModified?.getTime() || 0) - (a.LastModified?.getTime() || 0))
      .map((o) => ({
        name: (o.Key || '').split('/').pop() || '',
        url: `${PUBLIC}/${o.Key}`,
        size: Number(o.Size || 0),
        laget: o.LastModified?.toISOString() || null,
      }))
    return NextResponse.json({ clips })
  } catch (err: any) {
    console.error('[products/clips] listing feilet:', err?.message || err)
    return NextResponse.json({ clips: [] })
  }
}

export async function DELETE(request: Request) {
  const url = new URL(request.url)
  const productId = url.searchParams.get('productId') || ''
  const name = url.searchParams.get('name') || ''
  if (!productId || !name) return NextResponse.json({ error: 'productId og name kreves' }, { status: 400 })
  // Nøkkelen bygges ALLTID av productId + rent filnavn — kan aldri peke
  // utenfor artistens egen mappe
  if (name.includes('/') || name.includes('..')) {
    return NextResponse.json({ error: 'Ugyldig filnavn' }, { status: 400 })
  }
  const auth = request.headers.get('authorization') || ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  if (!token || !(await eierProduktet(token, productId))) {
    return NextResponse.json({ error: 'Ingen tilgang' }, { status: 403 })
  }
  try {
    await r2().send(new DeleteObjectCommand({ Bucket: BUCKET, Key: `artist-clips/${productId}/${name}` }))
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: 'Sletting feilet' }, { status: 500 })
  }
}
