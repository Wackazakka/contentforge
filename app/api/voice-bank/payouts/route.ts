import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getTenant } from '@/lib/tenantServer'
import { isTenantAdmin } from '@/lib/voiceBank'
import { actorSettlement, kr } from '@/lib/actorLedger'

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
  )
}

// Utbetalinger til rettighetshaver — den andre halvdelen av hovedboken.
//
// voice_usage_events sier hva som er OPPTJENT. actor_payouts sier hva som er
// BETALT. Differansen er «til gode», og uten dette viste avregningen samme
// beløp om igjen måned etter måned.
//
// Hvem betaler: den som har avtalen med rettighetshaveren (avtalens pkt. 7) —
// altså eiertenanten. Derfor host-tenant + admin-sjekk, ikke rot-admin slik
// partner_payouts har. Skuespilleren må være tenantens egen.

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
  return { tenant, email }
}

async function ownActor(tenantId: string, actorId: string) {
  const { data } = await admin()
    .from('voice_actors').select('id').eq('id', actorId).eq('owner_tenant_id', tenantId).single()
  return data
}

export async function GET(request: Request) {
  const g = await guard(request)
  if (g.fail) return g.fail
  const actorId = new URL(request.url).searchParams.get('actorId')
  if (!actorId) return NextResponse.json({ error: 'Mangler actorId' }, { status: 400 })
  if (!(await ownActor(g.tenant!.id, actorId))) {
    return NextResponse.json({ error: 'Skuespilleren finnes ikke i denne banken' }, { status: 404 })
  }
  return NextResponse.json(await actorSettlement(actorId))
}

export async function POST(request: Request) {
  const g = await guard(request)
  if (g.fail) return g.fail
  const body = await request.json().catch(() => ({}))
  const { actorId, periodeFra, periodeTil, amountNok, note } = body || {}

  if (!actorId) return NextResponse.json({ error: 'Mangler actorId' }, { status: 400 })
  const datoOk = (s: unknown) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s)
  if (!datoOk(periodeFra) || !datoOk(periodeTil)) {
    return NextResponse.json({ error: 'Periode må være to datoer (ÅÅÅÅ-MM-DD)' }, { status: 400 })
  }
  if (periodeTil < periodeFra) return NextResponse.json({ error: 'Perioden slutter før den begynner' }, { status: 400 })
  const amount = Number(amountNok)
  if (!Number.isFinite(amount) || amount < 0) return NextResponse.json({ error: 'Ugyldig beløp' }, { status: 400 })
  if (!(await ownActor(g.tenant!.id, actorId))) {
    return NextResponse.json({ error: 'Skuespilleren finnes ikke i denne banken' }, { status: 404 })
  }

  const { error } = await admin().from('actor_payouts').insert({
    actor_id: actorId,
    tenant_id: g.tenant!.id,
    periode_fra: periodeFra,
    periode_til: periodeTil,
    amount_nok: kr(amount),
    note: note ? String(note).slice(0, 300) : null,
    created_by: g.email,
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
