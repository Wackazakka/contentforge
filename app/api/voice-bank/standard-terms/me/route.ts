import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getTenant } from '@/lib/tenantServer'
import { likeSafe } from '@/lib/epost'
import { STANDARD_FORSLAG, aktoerHinder, sammendrag } from '@/lib/standardLisens'
import { hentVilkaar, lagreVilkaar } from '@/lib/standardLisensServer'

// Rettighetshaverens egen bryter for standardlisensen (128), på /min-stemme.
//
//   GET   ?actorId=               vilkårene slik de står
//   PATCH { actorId, enabled }    av eller på
//
// 🔑 HUN KAN ALLTID SLÅ DEN AV. Lisenser som alt er gitt, gjelder ut perioden;
// det som stopper, er nye. Slår hun den på uten at noen har satt vilkår,
// gjelder forslaget (nett og intern bruk, Norge og Norden, opptil 12 måneder).

function db() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || '', process.env.SUPABASE_SERVICE_ROLE_KEY || '')
}

type Aktoer = { id: string; owner_tenant_id: string; tier: string | null; is_active: boolean; is_demo: boolean | null; intake_status: string | null }

async function hentEgen(request: Request, actorId: unknown): Promise<{ a: Aktoer; epost: string } | NextResponse> {
  const auth = request.headers.get('authorization')
  if (!auth?.startsWith('Bearer ')) return NextResponse.json({ error: 'Ikke innlogget' }, { status: 401 })
  const { data: u } = await db().auth.getUser(auth.slice(7))
  const epost = u?.user?.email
  if (!epost) return NextResponse.json({ error: 'Ikke innlogget' }, { status: 401 })
  if (typeof actorId !== 'string' || !actorId) return NextResponse.json({ error: 'Mangler profil' }, { status: 400 })
  const tenant = await getTenant()
  const { data } = await db().from('voice_actors')
    .select('id, owner_tenant_id, tier, is_active, is_demo, intake_status')
    .eq('id', actorId).ilike('actor_email', likeSafe(epost)).eq('owner_tenant_id', tenant.id).maybeSingle()
  if (!data) return NextResponse.json({ error: 'Fant ikke profilen din' }, { status: 404 })
  return { a: data as Aktoer, epost }
}

async function svar(a: Aktoer) {
  const v = await hentVilkaar(a.id)
  return {
    enabled: !!v?.enabled,
    terms: sammendrag(v ?? STANDARD_FORSLAG),
    blocker: aktoerHinder({ tier: a.tier, isActive: !!a.is_active, isDemo: a.is_demo === true, intakeStatus: a.intake_status }),
  }
}

export async function GET(request: Request) {
  const g = await hentEgen(request, new URL(request.url).searchParams.get('actorId'))
  if (g instanceof NextResponse) return g
  const { error } = await db().from('standard_licence_terms').select('actor_id', { head: true, count: 'exact' }).limit(1)
  if (error) return NextResponse.json({ notEnabled: true })
  return NextResponse.json(await svar(g.a))
}

export async function PATCH(request: Request) {
  try {
    const b = await request.json().catch(() => ({}))
    const g = await hentEgen(request, b.actorId)
    if (g instanceof NextResponse) return g
    if (typeof b.enabled !== 'boolean') return NextResponse.json({ error: 'Mangler av/på' }, { status: 400 })
    if (b.enabled) {
      const hinder = aktoerHinder({ tier: g.a.tier, isActive: !!g.a.is_active, isDemo: g.a.is_demo === true, intakeStatus: g.a.intake_status })
      if (hinder) return NextResponse.json({ error: hinder }, { status: 409 })
    }
    const v = (await hentVilkaar(g.a.id)) ?? STANDARD_FORSLAG
    await lagreVilkaar(g.a.id, g.a.owner_tenant_id, { ...v, enabled: b.enabled }, g.epost)
    return NextResponse.json(await svar(g.a))
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Ukjent feil' }, { status: 500 })
  }
}
