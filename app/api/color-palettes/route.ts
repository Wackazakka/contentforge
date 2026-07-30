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

// Lagrede fargepaletter, eid av tenanten som lagde dem. Brukes i Partnere-adminen
// til å gjenbruke en profil man har funnet fram til på flere partnere.
//
// Migrasjon: ~/Desktop/contentforge-fargepaletter.sql. Ruta er skrevet så den
// tåler at tabellen ikke finnes ennå — GET gir tom liste, skriving sier fra.
// Samme mønster som /bli-stemme før søknadstabellen fantes.

// Alle sekstenene fra COLOR_FIELDS. Ukjente nøkler forkastes ved lagring, så en
// palett aldri kan smugle inn vilkårlige CSS-variabler i <html>-style-attributtet.
const ALLOWED_KEYS = new Set([
  '--ember', '--ember-deep', '--ember-tint-bg', '--ember-tint-border', '--on-ember',
  '--paper', '--paper-raised', '--paper-sunken', '--band',
  '--ink', '--ink-soft', '--text-muted', '--text-faint',
  '--ds-border', '--ds-border-strong', '--ds-border-faint',
])
const HEX = /^#[0-9a-fA-F]{6}$/

function sanitize(input: unknown): Record<string, string> {
  const out: Record<string, string> = {}
  if (!input || typeof input !== 'object') return out
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (ALLOWED_KEYS.has(k) && typeof v === 'string' && HEX.test(v)) out[k] = v.toUpperCase()
  }
  return out
}

/** Mangler tabellen, er det ikke en feil — det betyr bare at migrasjonen ikke er kjørt. */
function tableMissing(error: { message?: string; code?: string } | null): boolean {
  if (!error) return false
  return error.code === '42P01' || /relation .*color_palettes.* does not exist/i.test(error.message || '')
}

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

export async function GET(request: Request) {
  const g = await guard(request)
  if (g.fail) return g.fail
  const { data, error } = await admin()
    .from('color_palettes')
    .select('id, name, colors, updated_at')
    .eq('owner_tenant_id', g.tenant!.id)
    .order('name')
  if (error) {
    if (tableMissing(error)) return NextResponse.json({ palettes: [], migrated: false })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ palettes: data || [], migrated: true })
}

export async function POST(request: Request) {
  const g = await guard(request)
  if (g.fail) return g.fail
  const body = await request.json().catch(() => ({}))
  const name = String(body.name || '').trim().slice(0, 60)
  if (!name) return NextResponse.json({ error: 'Paletten må ha et navn' }, { status: 400 })
  const colors = sanitize(body.colors)
  if (Object.keys(colors).length === 0) {
    return NextResponse.json({ error: 'Ingen gyldige farger å lagre' }, { status: 400 })
  }
  // Samme navn hos samme eier overskriver — unik-indeksen på (owner, lower(name))
  // gjør dette til en ekte upsert i stedet for en duplikatfeil.
  const { error } = await admin()
    .from('color_palettes')
    .upsert(
      { owner_tenant_id: g.tenant!.id, name, colors, updated_at: new Date().toISOString() },
      { onConflict: 'owner_tenant_id,name' }
    )
  if (error) {
    if (tableMissing(error)) {
      return NextResponse.json({ error: 'Paletter er ikke slått på ennå — migrasjonen mangler.' }, { status: 503 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}

export async function DELETE(request: Request) {
  const g = await guard(request)
  if (g.fail) return g.fail
  const id = new URL(request.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Mangler id' }, { status: 400 })
  // Scopet til eieren: du kan ikke slette en annen tenants palett ved å gjette id.
  const { error } = await admin()
    .from('color_palettes')
    .delete()
    .eq('id', id)
    .eq('owner_tenant_id', g.tenant!.id)
  if (error) {
    if (tableMissing(error)) return NextResponse.json({ ok: true })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
