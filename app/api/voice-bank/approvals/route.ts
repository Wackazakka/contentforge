import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getTenant } from '@/lib/tenantServer'
import { isTenantAdmin } from '@/lib/voiceBank'

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
  )
}

// Godkjenningskrav per (skuespiller × kunde): carte blanche ('auto') eller
// forhåndsgodkjenning ('review' m/frist i timer). Samme admin-vakt som banken.

async function guard(request: Request) {
  const tenant = await getTenant()
  if (tenant.id === 'root') return { fail: NextResponse.json({ error: 'Tenant-oppsett mangler' }, { status: 404 }) }
  let email: string | null = null
  const auth = request.headers.get('authorization')
  if (auth?.startsWith('Bearer ')) {
    const { data } = await admin().auth.getUser(auth.slice(7))
    email = data?.user?.email ?? null
  }
  if (!email) return { fail: NextResponse.json({ error: 'Ikke innlogget' }, { status: 401 }) }
  if (!(await isTenantAdmin(email, tenant.id))) return { fail: NextResponse.json({ error: 'Ingen admin-tilgang' }, { status: 403 }) }
  return { tenant }
}

// GET ?actorId= — kundene (organisasjoner i tenantens nett) + gjeldende modus
export async function GET(request: Request) {
  const g = await guard(request)
  if (g.fail) return g.fail
  const actorId = new URL(request.url).searchParams.get('actorId')
  if (!actorId) return NextResponse.json({ error: 'Mangler actorId' }, { status: 400 })

  const supabase = admin()
  const { data: actor } = await supabase
    .from('voice_actors').select('id').eq('id', actorId).eq('owner_tenant_id', g.tenant!.id).single()
  if (!actor) return NextResponse.json({ error: 'Skuespilleren finnes ikke i denne banken' }, { status: 404 })

  const { data: orgs } = await supabase
    .from('organizations').select('id, name').eq('tenant_id', g.tenant!.id).order('name')
  const { data: settings } = await supabase
    .from('actor_approval_settings').select('organization_id, mode, timeout_hours').eq('actor_id', actorId)

  const bySetting = new Map((settings || []).map((s) => [s.organization_id, s]))
  return NextResponse.json({
    customers: (orgs || []).map((o) => ({
      id: o.id,
      name: o.name,
      mode: bySetting.get(o.id)?.mode || 'auto',
      timeoutHours: Number(bySetting.get(o.id)?.timeout_hours) || 24,
    })),
  })
}

// PATCH { actorId, organizationId, mode, timeoutHours } — sett modus for én kunde
export async function PATCH(request: Request) {
  const g = await guard(request)
  if (g.fail) return g.fail
  const { actorId, organizationId, mode, timeoutHours } = await request.json()
  if (!actorId || !organizationId || !['auto', 'review'].includes(mode)) {
    return NextResponse.json({ error: 'Ugyldig forespørsel' }, { status: 400 })
  }
  const hours = Number(timeoutHours)
  if (mode === 'review' && !(hours >= 1 && hours <= 168)) {
    return NextResponse.json({ error: 'Fristen må være mellom 1 og 168 timer' }, { status: 400 })
  }

  const supabase = admin()
  // Skuespilleren må tilhøre tenanten; kunden må være i tenantens nett
  const { data: actor } = await supabase
    .from('voice_actors').select('id').eq('id', actorId).eq('owner_tenant_id', g.tenant!.id).single()
  if (!actor) return NextResponse.json({ error: 'Skuespilleren finnes ikke i denne banken' }, { status: 404 })
  const { data: org } = await supabase
    .from('organizations').select('id').eq('id', organizationId).eq('tenant_id', g.tenant!.id).single()
  if (!org) return NextResponse.json({ error: 'Kunden finnes ikke i dette kundenettet' }, { status: 404 })

  const { error } = await supabase.from('actor_approval_settings').upsert(
    { actor_id: actorId, organization_id: organizationId, mode, timeout_hours: mode === 'review' ? hours : 24 },
    { onConflict: 'actor_id,organization_id' }
  )
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
