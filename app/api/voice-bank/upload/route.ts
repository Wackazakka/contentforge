import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getTenant } from '@/lib/tenantServer'
import { isTenantAdmin } from '@/lib/voiceBank'
import { lagreMedie, signerMedier, slettMedier, somListe } from '@/lib/actorMedia'

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
  )
}

// Last opp bilde/lydprøve til en skuespillers presentasjonsside.
// Samme tilgang som stemmebank-adminen: tenantens admins + leddene over.
// Fila går til den PRIVATE bøtta og raden får stien (lib/actorMedia) — ikke
// en offentlig R2-adresse som virker for alltid.
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

    const field = kind === 'photo' ? 'photo_urls' : 'sample_urls'
    const list = somListe((actor as Record<string, unknown>)[field])
    // Før: .slice(0, 12) kastet den NYE stille når lista var full — og fila
    // ble liggende uten at noe pekte på den.
    if (list.length >= 12) return NextResponse.json({ error: 'Maks 12 per liste — fjern en først' }, { status: 400 })

    const buffer = Buffer.from(await file.arrayBuffer())
    const ext = (file.name.split('.').pop() || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '')
    const sti = await lagreMedie(actorId, `${kind}-${Date.now()}.${ext}`, buffer, file.type || undefined)

    // Legg stien på riktig liste. Feiler det, skal fila ikke bli liggende.
    const { error: upErr } = await supabase.from('voice_actors').update({ [field]: [...list, sti] }).eq('id', actorId)
    if (upErr) {
      await slettMedier(actorId, [sti])
      return NextResponse.json({ error: upErr.message }, { status: 500 })
    }

    const url = (await signerMedier([{ actorId, verdier: [sti] }]))(actorId, sti)
    return NextResponse.json({ ok: true, path: sti, url })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
