import { NextResponse } from 'next/server'
import { S3Client, ListObjectsV2Command } from '@aws-sdk/client-s3'
import { createClient } from '@supabase/supabase-js'

// Lagringsgrense per artist (Lars 1/8). Lagring koster nesten ingenting
// reelt (R2: ~15 øre per GB/mnd), så dette er IKKE en inntektskilde — det er
// et vern mot at noen bruker oss som gratis skylagring. Romslig nok til at
// ingen ekte artist merker den: 2 GB ≈ 40 videoklipp eller hundrevis av bilder.
const GRENSE_BYTES = 2 * 1024 * 1024 * 1024
const DROPLET = 'http://139.59.212.218:3002'

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

async function sumPrefix(prefix: string): Promise<number> {
  try {
    let total = 0
    let token: string | undefined
    do {
      const res = await r2().send(new ListObjectsV2Command({
        Bucket: process.env.R2_BUCKET_NAME || 'contentforge-assets',
        Prefix: prefix,
        ContinuationToken: token,
      }))
      for (const o of res.Contents || []) total += Number(o.Size || 0)
      token = res.IsTruncated ? res.NextContinuationToken : undefined
    } while (token)
    return total
  } catch {
    return 0
  }
}

export async function GET(request: Request) {
  try {
    const productId = new URL(request.url).searchParams.get('productId')
    if (!productId) return NextResponse.json({ error: 'productId kreves' }, { status: 400 })

    const auth = request.headers.get('authorization') || ''
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : null
    if (!token) return NextResponse.json({ error: 'Ikke innlogget' }, { status: 401 })
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL || '',
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
    )
    const { data: bruker } = await supabase.auth.getUser(token)
    if (!bruker?.user) return NextResponse.json({ error: 'Ikke innlogget' }, { status: 401 })

    // Alt artisten selv har lastet opp eller fått generert, per kategori
    const [bilder, egenStemme, video] = await Promise.all([
      sumPrefix(`artist-images/${productId}/`),
      sumPrefix(`own-voice/`),
      sumPrefix(`segment-videos/${productId}/`),
    ])

    // Egne låter ligger på dropleten, ikke i R2
    let musikk = 0
    try {
      const res = await fetch(`${DROPLET}/music/list`, { signal: AbortSignal.timeout(5000) })
      if (res.ok) {
        const d = await res.json()
        for (const f of d.files || []) {
          if ((f.folder || '').includes(productId)) musikk += Number(f.size || 0)
        }
      }
    } catch { /* dropleten svarer ikke → tell 0 */ }

    const brukte = bilder + egenStemme + video + musikk
    const mb = (b: number) => Math.round(b / 1024 / 1024)
    return NextResponse.json({
      brukteBytes: brukte,
      grenseBytes: GRENSE_BYTES,
      brukteMB: mb(brukte),
      grenseMB: mb(GRENSE_BYTES),
      prosent: Math.min(100, Math.round((brukte / GRENSE_BYTES) * 100)),
      fordeling: { bilderMB: mb(bilder), videoMB: mb(video), musikkMB: mb(musikk), stemmeMB: mb(egenStemme) },
    })
  } catch (err: any) {
    console.error('[storage-usage] feilet:', err?.message || err)
    return NextResponse.json({ error: 'Kunne ikke måle lagringen' }, { status: 500 })
  }
}
