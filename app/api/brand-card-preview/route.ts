import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createHash } from 'crypto'
import { S3Client, HeadObjectCommand } from '@aws-sdk/client-s3'

// Forhåndsvisning av merkekortet (Lars 3/8: «vis det der vi gir dem valget om
// å bruke dette som sluttplakat mot rabatt, slik at de ser hva det er snakk
// om»). Bildet tegnes av SAMME funksjon som filmen bruker — en HTML-etterligning
// ville før eller siden lovet noe annet enn det som faktisk kom.
//
// Kortet er deterministisk: samme merkevare gir samme bilde. Derfor caches det
// i R2 på en nøkkel utledet av innholdet, og dropleten kalles bare første gang.

const DROPLET = 'http://139.59.212.218:3002'
const BUCKET = process.env.R2_BUCKET_NAME || 'contentforge-assets'
const PUBLIC = process.env.R2_PUBLIC_URL || 'https://pub-5dcdfe9305a740febc87568c9ccb40a6.r2.dev'

// Lesbar tekstfarge paa en gitt bakgrunn. Foer ble den utledet av «finnes
// --paper?», som antok at enhver tenantfarge var lys — en moerk merkevare
// ville faatt moerk tekst paa moerkt kort (Lars 3/8, Isabels lilla/sorte
// uttrykk). Naa avgjoer selve lysstyrken.
function lesbarTekst(bg: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec((bg || '').trim())
  if (!m) return '#FFFFFF'
  const n = parseInt(m[1], 16)
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255]
  const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
  return lum > 0.55 ? '#14161B' : '#FFFFFF'
}

// Merkekortets tekst: «<Navn> VideoMaker» — men heter tenanten allerede
// «Isabel's VideoMaker», skal ordet ikke dubleres (Lars 3/8).
function merkekortTekst(navn: string): string {
  const n = (navn || '').trim()
  if (!n) return 'VideoMaker'
  return /videomaker/i.test(n) ? n : `${n} VideoMaker`
}

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
  )
}

async function finnesIR2(key: string): Promise<boolean> {
  try {
    const s3 = new S3Client({
      region: 'auto',
      endpoint: process.env.R2_ENDPOINT,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID || '',
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || '',
      },
    })
    await s3.send(new HeadObjectCommand({ Bucket: BUCKET, Key: key }))
    return true
  } catch {
    return false
  }
}

export async function GET(request: Request) {
  const url = new URL(request.url)
  const tenantId = url.searchParams.get('tenantId') || ''
  // Format: 9:16 er standard, men kortet skal kunne vises i alle tre
  const format = url.searchParams.get('format') || '9:16'
  const [w, h] = format === '1:1' ? [540, 540] : format === '16:9' ? [960, 540] : [540, 960]
  if (!tenantId || tenantId === 'root') return NextResponse.json({ url: null })

  try {
    const { data: tn } = await admin()
      .from('tenants')
      .select('app_name, logo_url, brand_card_url, colors')
      .eq('id', tenantId)
      .single()
    if (!tn) return NextResponse.json({ url: null })

    // Nøyaktig samme oppskrift som lib/production.ts bygger for filmen
    const colors = (tn.colors || {}) as Record<string, string>
    const cfg = {
      text: merkekortTekst(tn.app_name || ''),
      url: tn.brand_card_url || null,
      logoUrl: tn.logo_url || null,
      bgColor: colors['--brand-card-bg'] || colors['--paper'] || colors['--ink'] || '#14161B',
      textColor: lesbarTekst(colors['--brand-card-bg'] || colors['--paper'] || colors['--ink'] || '#14161B'),
    }

    const key = `brand-cards/${createHash('sha1')
      .update(JSON.stringify({ cfg, w, h }))
      .digest('hex')
      .slice(0, 16)}`
    if (await finnesIR2(`${key}.png`)) {
      return NextResponse.json({ url: `${PUBLIC}/${key}.png`, cached: true })
    }

    const res = await fetch(`${DROPLET}/jobs/brand-card`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cfg, width: w, height: h, key: key.replace('brand-cards/', '') }),
      signal: AbortSignal.timeout(30000),
    })
    const d = await res.json().catch(() => ({}))
    if (!res.ok || !d.url) return NextResponse.json({ url: null })
    return NextResponse.json({ url: d.url })
  } catch (err: any) {
    console.error('[brand-card-preview] feilet:', err?.message || err)
    // Forhåndsvisningen er pynt — den skal aldri velte redigereren
    return NextResponse.json({ url: null })
  }
}
