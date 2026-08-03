import { NextResponse } from 'next/server'
import { S3Client, ListObjectsV2Command, DeleteObjectCommand } from '@aws-sdk/client-s3'
import { createClient } from '@supabase/supabase-js'

// Artistens stemmebibliotek (Lars 3/8). Speiler klippbiblioteket: hver
// innlesning er lagret for godt, men lå under utkastet og var derfor
// uoppdagelig så snart segmentet fikk en nyere URL. Nye opptak legges under
// artist-voices/<productId>/ og overlever produksjonen.
//
// Filnavnet BÆRER stemme-ID-en: <voiceId>__scene<n>__<tidsstempel>.mp3.
// Det er nødvendig fordi produksjonen nekter å bruke et opptak den ikke vet
// hvilken stemme som lagde (stempelet voice_used, innført 31/7 etter at gammel
// Adam-lyd overlevde et stemmebytte). Uten stemmen i navnet kunne biblioteket
// bare tilby lyd som senere ble stille forkastet.

const BUCKET = process.env.R2_BUCKET_NAME || 'contentforge-assets'
// R2_PUBLIC_URL finnes på dropleten, men ikke i Netlify-miljøet — samme
// fallback som klipp- og avatar-rutene.
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

// Eierskap: brukeren må eie produktet. Leses med brukerens eget token, så RLS
// avgjør — samme mønster som bilde- og klippbiblioteket.
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

// <voiceId>__scene<n>__<ts>.mp3 → { voiceId, scene }. Eldre eller uventede
// navn gir tomt felt, og vises da som «ukjent stemme» i stedet for å forsvinne.
function tydFilnavn(navn: string): { voiceId: string; scene: number | null } {
  const m = navn.match(/^([A-Za-z0-9]+)__scene(\d+)__/)
  if (!m) return { voiceId: '', scene: null }
  return { voiceId: m[1], scene: Number(m[2]) }
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
      Prefix: `artist-voices/${productId}/`,
    }))
    const opptak = (res.Contents || [])
      .filter((o) => (o.Key || '').endsWith('.mp3'))
      .sort((a, b) => (b.LastModified?.getTime() || 0) - (a.LastModified?.getTime() || 0))
      .map((o) => {
        const name = (o.Key || '').split('/').pop() || ''
        const { voiceId, scene } = tydFilnavn(name)
        return {
          name,
          url: `${PUBLIC}/${o.Key}`,
          voiceId,
          scene,
          size: Number(o.Size || 0),
          laget: o.LastModified?.toISOString() || null,
        }
      })
    return NextResponse.json({ opptak })
  } catch (err: any) {
    console.error('[products/voices] listing feilet:', err?.message || err)
    return NextResponse.json({ opptak: [] })
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
    await r2().send(new DeleteObjectCommand({ Bucket: BUCKET, Key: `artist-voices/${productId}/${name}` }))
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Sletting feilet' }, { status: 500 })
  }
}
