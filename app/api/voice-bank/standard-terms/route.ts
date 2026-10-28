import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getTenant } from '@/lib/tenantServer'
import { isTenantAdmin } from '@/lib/voiceBank'
import { lesVilkaar, aktoerHinder, STANDARD_FORSLAG } from '@/lib/standardLisens'
import { hentVilkaar, lagreVilkaar, standardTilbud } from '@/lib/standardLisensServer'

// Standardlisensens vilkår på skuespillerkortet (128) — der adminen (byrået på
// rettighetshaverens vegne) setter dem.
//
//   GET ?actorId=   vilkårene (eller forslaget), et prøvetilbud og om
//                   skuespilleren i det hele tatt kan ha standardlisens
//   PUT { actorId, enabled, assets, media, territories, maxTermMonths }
//
// Rettighetshaveren ser de samme vilkårene på /min-stemme og kan slå dem av
// selv (standard-terms/me). Hver endring lagrer hvem.

function db() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || '', process.env.SUPABASE_SERVICE_ROLE_KEY || '')
}

async function vakt(request: Request) {
  const tenant = await getTenant()
  if (tenant.id === 'root') return { fail: NextResponse.json({ error: 'Tenant-oppsett mangler' }, { status: 404 }) }
  const auth = request.headers.get('authorization')
  const email = auth?.startsWith('Bearer ') ? (await db().auth.getUser(auth.slice(7))).data?.user?.email ?? null : null
  if (!email) return { fail: NextResponse.json({ error: 'Ikke innlogget' }, { status: 401 }) }
  if (!(await isTenantAdmin(email, tenant.id))) return { fail: NextResponse.json({ error: 'Ingen admin-tilgang' }, { status: 403 }) }
  return { tenant, email }
}

type Aktoer = { id: string; owner_tenant_id: string; tier: string | null; is_active: boolean; is_demo: boolean | null; intake_status: string | null }

async function egen(tenantId: string, actorId: unknown): Promise<Aktoer | null> {
  if (typeof actorId !== 'string' || !actorId) return null
  const { data } = await db().from('voice_actors')
    .select('id, owner_tenant_id, tier, is_active, is_demo, intake_status')
    .eq('id', actorId).eq('owner_tenant_id', tenantId).maybeSingle()
  return (data as Aktoer | null) ?? null
}

async function kort(a: Aktoer) {
  const lagret = await hentVilkaar(a.id)
  const v = lagret ?? STANDARD_FORSLAG
  // Et prøvetilbud på det vanligste: nett, Norge, 3 måneder, det minste aktivumet som er valgt.
  const proeve = v.enabled ? await standardTilbud(a.id, {
    kind: 'campaign', asset: v.assets[0] ?? 'voice', mediaClass: v.media.includes('online') ? 'online' : (v.media[0] ?? 'online'),
    territory: v.territories[0] ?? 'no', termMonths: 3, exclusivity: 'none',
  }) : null
  return {
    saved: !!lagret,
    terms: v,
    blocker: aktoerHinder({ tier: a.tier, isActive: !!a.is_active, isDemo: a.is_demo === true, intakeStatus: a.intake_status }),
    example: proeve?.available ? { priceNok: proeve.priceNok } : null,
  }
}

export async function GET(request: Request) {
  const v = await vakt(request)
  if (v.fail) return v.fail
  const a = await egen(v.tenant!.id, new URL(request.url).searchParams.get('actorId'))
  if (!a) return NextResponse.json({ error: 'Skuespilleren finnes ikke i denne banken' }, { status: 404 })
  const { error } = await db().from('standard_licence_terms').select('actor_id', { head: true, count: 'exact' }).limit(1)
  if (error) return NextResponse.json({ enabled: false, notEnabled: true })
  return NextResponse.json(await kort(a))
}

export async function PUT(request: Request) {
  try {
    const v = await vakt(request)
    if (v.fail) return v.fail
    const b = await request.json().catch(() => ({}))
    const a = await egen(v.tenant!.id, b.actorId)
    if (!a) return NextResponse.json({ error: 'Skuespilleren finnes ikke i denne banken' }, { status: 404 })
    const vilkaar = lesVilkaar(b)
    if (vilkaar.enabled) {
      const hinder = aktoerHinder({ tier: a.tier, isActive: !!a.is_active, isDemo: a.is_demo === true, intakeStatus: a.intake_status })
      if (hinder) return NextResponse.json({ error: hinder }, { status: 409 })
      if (!vilkaar.assets.length || !vilkaar.media.length || !vilkaar.territories.length) {
        return NextResponse.json({ error: 'Velg minst ett av hvert: hva, medium og område.' }, { status: 400 })
      }
    }
    await lagreVilkaar(a.id, a.owner_tenant_id, vilkaar, v.email!)
    return NextResponse.json(await kort(a))
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Ukjent feil' }, { status: 500 })
  }
}
