import { NextResponse } from 'next/server'
import { getTenant } from '@/lib/tenantServer'
import { isTenantAdmin } from '@/lib/voiceBank'
import { admin, generateApiKey } from '@/lib/gateway'

// Admin av gateway-nøkler (én per kunde-organisasjon). Samme tilgang som resten
// av adminflatene: tenantens admins + leddene over. Nøkkelen vises i KLARTEKST
// kun ved opprettelse — deretter kun prefiks.

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

// Alle organisasjoner i tenantens subtre + deres nøkler
export async function GET(request: Request) {
  const g = await guard(request)
  if (g.fail) return g.fail
  const supabase = admin()

  // Tenantens eget nivå + direkte underledd (to-lags i v1)
  const { data: subtree } = await supabase
    .from('tenants').select('id').or(`id.eq.${g.tenant!.id},parent_tenant_id.eq.${g.tenant!.id}`)
  const tenantIds = (subtree || []).map((t) => t.id)

  const { data: orgs } = await supabase
    .from('organizations').select('id, name, tenant_id').in('tenant_id', tenantIds)
  const orgIds = (orgs || []).map((o) => o.id)

  const { data: keys } = orgIds.length
    ? await supabase.from('api_keys').select('id, key_prefix, organization_id, scopes, status, last_used_at, created_at').in('organization_id', orgIds)
    : { data: [] }

  return NextResponse.json({ organizations: orgs || [], keys: keys || [] })
}

// Opprett nøkkel for en organisasjon (i tenantens subtre)
export async function POST(request: Request) {
  const g = await guard(request)
  if (g.fail) return g.fail
  const { organizationId, scopes } = await request.json()
  if (!organizationId) return NextResponse.json({ error: 'Mangler organizationId' }, { status: 400 })

  const supabase = admin()
  // Verifiser at organisasjonen tilhører tenantens subtre
  const { data: org } = await supabase.from('organizations').select('id, tenant_id').eq('id', organizationId).single()
  if (!org) return NextResponse.json({ error: 'Ukjent organisasjon' }, { status: 404 })
  const { data: t } = await supabase.from('tenants').select('id, parent_tenant_id').eq('id', org.tenant_id).single()
  const inSubtree = org.tenant_id === g.tenant!.id || t?.parent_tenant_id === g.tenant!.id
  if (!inSubtree) return NextResponse.json({ error: 'Organisasjonen er ikke i ditt subtre' }, { status: 403 })

  const { key, hash, prefix } = generateApiKey()
  const { error } = await supabase.from('api_keys').insert({
    key_hash: hash,
    key_prefix: prefix,
    organization_id: organizationId,
    tenant_id: org.tenant_id,
    scopes: Array.isArray(scopes) && scopes.length ? scopes : ['speech', 'image'],
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  // Klartekst-nøkkelen returneres ÉN gang
  return NextResponse.json({ ok: true, key, prefix })
}

// Tilbakekall en nøkkel (umiddelbar avstenging)
export async function PATCH(request: Request) {
  const g = await guard(request)
  if (g.fail) return g.fail
  const { keyId, status } = await request.json()
  if (!keyId) return NextResponse.json({ error: 'Mangler keyId' }, { status: 400 })

  const supabase = admin()
  // Kun nøkler i tenantens subtre
  const { data: subtree } = await supabase
    .from('tenants').select('id').or(`id.eq.${g.tenant!.id},parent_tenant_id.eq.${g.tenant!.id}`)
  const tenantIds = (subtree || []).map((t) => t.id)
  const { data, error } = await supabase
    .from('api_keys')
    .update({ status: status === 'active' ? 'active' : 'revoked' })
    .eq('id', keyId)
    .in('tenant_id', tenantIds)
    .select('id')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data || data.length === 0) return NextResponse.json({ error: 'Nøkkelen finnes ikke i ditt subtre' }, { status: 404 })
  return NextResponse.json({ ok: true })
}
