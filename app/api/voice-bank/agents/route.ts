import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getTenant, getTenantCanonicalOrigin } from '@/lib/tenantServer'
import { isTenantAdmin } from '@/lib/voiceBank'
import { nyNoekkel } from '@/lib/byraa'
import { byraaLenke } from '@/lib/identitet'

// Byråene (097) og påmeldingslenkene deres (116) — der adminen forvalter dem.
//
// Tabellen fantes fra 22.09, men ingenting kunne lage en rad. Her: liste,
// nytt byrå, ny lenke (den gamle slutter å virke), av og på.
//
// 🔑 ET BYRÅ SOM SLÅS AV, SLUTTER Å GÅ GOD FOR NYE. De som alt kom gjennom
// lenken, beholder bekreftelsen — den ble gitt da byrået var aktivt. Skal en
// bestemt person ut, er det «Ikke vår klient» i e-posten til byrået.

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
  return { tenant }
}

type Rad = {
  id: string; name: string; contact_email: string | null; org_nr: string | null
  default_commission_pct: number | null; note: string | null; is_active: boolean
  enroll_token: string | null; created_at: string
}

async function liste(tenantId: string, origin: string) {
  const { data } = await db().from('talent_agents')
    .select('id, name, contact_email, org_nr, default_commission_pct, note, is_active, enroll_token, created_at')
    .eq('tenant_id', tenantId).order('created_at', { ascending: true })
  const rader = (data || []) as Rad[]
  const ider = rader.map((r) => r.id)
  const antall = new Map<string, number>()
  if (ider.length) {
    const { data: as } = await db().from('voice_actors').select('talent_agent_id').in('talent_agent_id', ider)
    for (const a of as || []) antall.set(a.talent_agent_id as string, (antall.get(a.talent_agent_id as string) || 0) + 1)
  }
  return rader.map((r) => ({
    id: r.id, name: r.name, contactEmail: r.contact_email, orgNr: r.org_nr,
    defaultCommissionPct: r.default_commission_pct != null ? Number(r.default_commission_pct) : null,
    note: r.note, isActive: r.is_active, createdAt: r.created_at,
    // Lenken vises bare for et aktivt byrå: en avslått lenke skal ikke kopieres.
    link: r.is_active && r.enroll_token ? byraaLenke(origin, r.enroll_token) : null,
    actors: antall.get(r.id) || 0,
  }))
}

function lesFelter(b: Record<string, unknown>): { felter: Record<string, unknown>; feil?: string } {
  const felter: Record<string, unknown> = {}
  if (b.name !== undefined) {
    const n = String(b.name || '').trim()
    if (!n) return { felter, feil: 'Byrået må ha et navn' }
    felter.name = n.slice(0, 120)
  }
  if (b.contactEmail !== undefined) {
    const e = String(b.contactEmail || '').trim().toLowerCase()
    if (e && !e.includes('@')) return { felter, feil: 'Ugyldig e-post' }
    felter.contact_email = e || null
  }
  if (b.orgNr !== undefined) felter.org_nr = String(b.orgNr || '').replace(/\s/g, '').slice(0, 20) || null
  if (b.defaultCommissionPct !== undefined) {
    const raa = String(b.defaultCommissionPct ?? '').trim().replace(',', '.')
    if (!raa) felter.default_commission_pct = null
    else {
      const v = Number(raa)
      if (!Number.isFinite(v) || v < 0 || v > 100) return { felter, feil: 'Provisjonen må være mellom 0 og 100 %' }
      felter.default_commission_pct = v
    }
  }
  if (b.note !== undefined) felter.note = String(b.note || '').slice(0, 1000) || null
  return { felter }
}

export async function GET(request: Request) {
  const v = await vakt(request)
  if (v.fail) return v.fail
  return NextResponse.json({ agents: await liste(v.tenant!.id, await getTenantCanonicalOrigin(v.tenant!)) })
}

/** Nytt byrå — med lenke fra start. */
export async function POST(request: Request) {
  try {
    const v = await vakt(request)
    if (v.fail) return v.fail
    const b = await request.json()
    const { felter, feil } = lesFelter({ ...b, name: b.name ?? '' })
    if (feil) return NextResponse.json({ error: feil }, { status: 400 })
    if (!felter.contact_email) {
      // Uten e-post får byrået aldri vite hvem som brukte lenken — og da er
      // «byrået går god for» bare et ord.
      return NextResponse.json({ error: 'Byrået trenger en e-postadresse: den får beskjed hver gang noen bruker lenken' }, { status: 400 })
    }
    const { error } = await db().from('talent_agents').insert({ ...felter, tenant_id: v.tenant!.id, enroll_token: nyNoekkel() })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ agents: await liste(v.tenant!.id, await getTenantCanonicalOrigin(v.tenant!)) })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Ukjent feil' }, { status: 500 })
  }
}

/**
 * Endre et byrå:
 *   { id, action: 'rotate' }      ny lenke, den gamle slutter å virke
 *   { id, isActive: boolean }     av eller på
 *   { id, name?, contactEmail?, orgNr?, defaultCommissionPct?, note? }
 */
export async function PATCH(request: Request) {
  try {
    const v = await vakt(request)
    if (v.fail) return v.fail
    const b = await request.json()
    const id = String(b.id || '')
    const { felter, feil } = lesFelter(b)
    if (feil) return NextResponse.json({ error: feil }, { status: 400 })
    if (b.action === 'rotate') felter.enroll_token = nyNoekkel()
    if (typeof b.isActive === 'boolean') felter.is_active = b.isActive
    if (felter.contact_email === null) {
      return NextResponse.json({ error: 'Byrået trenger en e-postadresse: den får beskjed hver gang noen bruker lenken' }, { status: 400 })
    }
    if (Object.keys(felter).length === 0) return NextResponse.json({ error: 'Ingenting å endre' }, { status: 400 })
    const { data, error } = await db().from('talent_agents').update(felter)
      .eq('id', id).eq('tenant_id', v.tenant!.id).select('id')
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!data?.length) return NextResponse.json({ error: 'Fant ikke byrået i denne banken' }, { status: 404 })
    return NextResponse.json({ agents: await liste(v.tenant!.id, await getTenantCanonicalOrigin(v.tenant!)) })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Ukjent feil' }, { status: 500 })
  }
}
