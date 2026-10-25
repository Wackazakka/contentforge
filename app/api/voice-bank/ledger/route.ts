import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getTenant } from '@/lib/tenantServer'
import { isTenantAdmin } from '@/lib/voiceBank'

// Hovedbokens kontroll (118) — går hele hash-kjeden og regner hvert
// fingeravtrykk på nytt. Svarer med antall rader, brudd og rotverdien
// (siste fingeravtrykk), som er det som skal deponeres hos en tredjepart.
//
// 🔑 BARE FOR TWINLEDGERS EGEN ADMIN. Kjeden går på tvers av alle bankene;
// et byrå på eget domene skal ikke se hvor stor hele hovedboken er.

function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || '', process.env.SUPABASE_SERVICE_ROLE_KEY || '')
}

export async function GET(request: Request) {
  const tenant = await getTenant()
  if (tenant.slug !== 'twinledger') return NextResponse.json({ error: 'Ikke tilgjengelig her' }, { status: 404 })
  const auth = request.headers.get('authorization')
  const email = auth?.startsWith('Bearer ') ? (await admin().auth.getUser(auth.slice(7))).data?.user?.email ?? null : null
  if (!email) return NextResponse.json({ error: 'Ikke innlogget' }, { status: 401 })
  if (!(await isTenantAdmin(email, tenant.id))) return NextResponse.json({ error: 'Ingen admin-tilgang' }, { status: 403 })

  const { data, error } = await admin().rpc('kontroller_hovedboken')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const r = (Array.isArray(data) ? data[0] : data) as { rader: number; uten_kjede: number; brudd: number; foerste_brudd: number | null; rotverdi: string | null } | null
  if (!r) return NextResponse.json({ error: 'Tomt svar' }, { status: 500 })
  return NextResponse.json({
    rows: Number(r.rader),
    unchained: Number(r.uten_kjede),
    breaks: Number(r.brudd),
    firstBreak: r.foerste_brudd != null ? Number(r.foerste_brudd) : null,
    root: r.rotverdi,
    intact: Number(r.brudd) === 0 && Number(r.uten_kjede) === 0,
    checkedAt: new Date().toISOString(),
  })
}
