import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import { getTenant } from '@/lib/tenantServer'
import { isTenantAdmin } from '@/lib/voiceBank'

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
  )
}

const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL || 'https://pub-5dcdfe9305a740febc87568c9ccb40a6.r2.dev'

// Last opp bilde/lydprøve til en skuespillers presentasjonsside.
// Samme tilgang som stemmebank-adminen: tenantens admins + leddene over.
export async function POST(request: Request) {
  try {
    const tenant = await getTenant()
    if (tenant.id === 'root') return NextResponse.json({ error: 'Tenant-oppsett mangler' }, { status: 404 })
    let email: string | null = null
    const auth = request.headers.get('authorization')
    if (auth?.startsWith('Bearer ')) {
      const { data } = await admin().auth.getUser(auth.slice(7))
      email = data?.user?.email ?? null
    }
    if (!email) return NextResponse.json({ error: 'Ikke innlogget' }, { status: 401 })
    if (!(await isTenantAdmin(email, tenant.id))) return NextResponse.json({ error: 'Ingen admin-tilgang' }, { status: 403 })

    const formData = await request.formData()
    const file = formData.get('file') as File
    const actorId = String(formData.get('actorId') || '')
    const kind = String(formData.get('kind') || '') // 'photo' | 'sample'
    if (!file || !actorId || !['photo', 'sample'].includes(kind)) {
      return NextResponse.json({ error: 'Mangler fil, actorId eller kind' }, { status: 400 })
    }
    if (file.size > 25 * 1024 * 1024) return NextResponse.json({ error: 'Maks 25 MB per fil' }, { status: 400 })

    // Skuespilleren må tilhøre gjeldende tenant
    const supabase = admin()
    const { data: actor } = await supabase
      .from('voice_actors')
      .select('id, photo_urls, sample_urls')
      .eq('id', actorId)
      .eq('owner_tenant_id', tenant.id)
      .single()
    if (!actor) return NextResponse.json({ error: 'Skuespilleren finnes ikke i denne banken' }, { status: 404 })

    const buffer = Buffer.from(await file.arrayBuffer())
    const ext = (file.name.split('.').pop() || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '')
    const key = `voice-actors/${actorId}/${kind}-${Date.now()}.${ext}`
    const r2 = new S3Client({
      region: 'auto',
      endpoint: process.env.R2_ENDPOINT!,
      credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID!, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY! },
    })
    await r2.send(new PutObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME || 'contentforge-assets',
      Key: key,
      Body: buffer,
      ContentType: file.type || undefined,
    }))
    const url = `${R2_PUBLIC_URL}/${key}`

    // Legg URL-en på riktig liste
    const field = kind === 'photo' ? 'photo_urls' : 'sample_urls'
    const list = Array.isArray((actor as any)[field]) ? (actor as any)[field] : []
    await supabase.from('voice_actors').update({ [field]: [...list, url].slice(0, 12) }).eq('id', actorId)

    return NextResponse.json({ ok: true, url })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
