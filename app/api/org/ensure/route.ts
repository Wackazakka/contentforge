import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getTenant } from '@/lib/tenantServer'

// Selvreparasjon av arbeidsområde, serverside (2026-10-26). Dashbordet prøver
// først å opprette organisasjonen med brukerens egen nøkkel; blir den stoppet
// av RLS (Lars så «Kontoen din hører ikke til dette domenet» på standardropert),
// kaller det hit. Vi verifiserer sesjonen, og oppretter/finner organisasjonen
// på DENNE tenanten med service-nøkkelen. Samme felter som dashbordets insert.

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

export async function POST(request: Request) {
  const auth = request.headers.get('authorization')
  if (!auth?.startsWith('Bearer ')) return NextResponse.json({ error: 'Ikke innlogget' }, { status: 401 })
  if (!SERVICE_KEY) return NextResponse.json({ error: 'Ikke konfigurert' }, { status: 503 })

  const sb = createClient(SUPABASE_URL, SERVICE_KEY)
  const { data: u } = await sb.auth.getUser(auth.slice(7))
  const user = u?.user
  if (!user?.id) return NextResponse.json({ error: 'Ikke innlogget' }, { status: 401 })

  const tenant = await getTenant()
  const tenantFilter = /^[0-9a-f-]{36}$/i.test(tenant.id) ? tenant.id : null

  // Finnes alt? (eier på denne tenanten)
  let q = sb.from('organizations').select('id, name').eq('owner_id', user.id)
  q = tenantFilter ? q.eq('tenant_id', tenantFilter) : q.is('tenant_id', null)
  const { data: existing } = await q.order('created_at', { ascending: true }).limit(1)
  if (existing?.[0]) return NextResponse.json({ organization: existing[0], created: false })

  const fullName = (user.user_metadata as { full_name?: string } | null)?.full_name || user.email?.split('@')[0] || 'Min'
  const slug =
    (user.email?.split('@')[0] || 'org').toLowerCase().replace(/[^a-z0-9]/g, '-') +
    '-' + user.id.substring(0, 8) +
    (tenant.slug !== 'centerforge' ? '-' + tenant.slug : '')
  const { data: org, error } = await sb
    .from('organizations')
    .insert({
      name: fullName,
      owner_id: user.id,
      slug,
      description: 'Default organization for ' + fullName,
      ...(tenantFilter ? { tenant_id: tenantFilter } : {}),
    })
    .select('id, name')
    .single()
  if (error || !org) {
    console.error('[org/ensure] insert feilet:', error?.message)
    return NextResponse.json({ error: 'Kunne ikke opprette arbeidsområdet: ' + (error?.message || 'ukjent') }, { status: 500 })
  }
  return NextResponse.json({ organization: org, created: true })
}
