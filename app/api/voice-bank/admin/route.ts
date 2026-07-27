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

// Stemmebank-admin for gjeldende tenant (host-basert). Tilgang: tenantens egne
// admins + admins i leddene over (admin_emails på tenants, sjekkes oppover).
// Viser tenantens EGNE skuespillere med full sats-info + royalty-loggen deres.
export async function GET(request: Request) {
  try {
    const tenant = await getTenant()
    if (tenant.id === 'root') {
      return NextResponse.json({ error: 'Tenant-oppsett mangler' }, { status: 404 })
    }

    // Hvem spør? E-post fra verifisert JWT — aldri fra klientdata
    let email: string | null = null
    const auth = request.headers.get('authorization')
    if (auth?.startsWith('Bearer ')) {
      const { data } = await admin().auth.getUser(auth.slice(7))
      email = data?.user?.email ?? null
    }
    if (!email) return NextResponse.json({ error: 'Ikke innlogget' }, { status: 401 })
    if (!(await isTenantAdmin(email, tenant.id))) {
      return NextResponse.json({ error: 'Ingen admin-tilgang' }, { status: 403 })
    }

    const supabase = admin()
    const { data: actors } = await supabase
      .from('voice_actors')
      .select('*')
      .eq('owner_tenant_id', tenant.id)
      .order('name')

    const actorIds = (actors || []).map((a) => a.id)
    let events: any[] = []
    if (actorIds.length > 0) {
      const { data: ev } = await supabase
        .from('voice_usage_events')
        .select('id, actor_id, used_by_tenant_id, actor_rate_nok, customer_price_nok, meta, created_at')
        .in('actor_id', actorIds)
        .order('created_at', { ascending: false })
        .limit(200)
      events = ev || []
    }

    // Månedstall per skuespiller (inneværende måned) — rabatt/raker beregnes
    // ved avregning, så dette er brutto løpende tall
    const monthStart = new Date()
    monthStart.setUTCDate(1)
    monthStart.setUTCHours(0, 0, 0, 0)
    const monthly = (actors || []).map((a) => {
      const mine = events.filter((e) => e.actor_id === a.id && new Date(e.created_at) >= monthStart)
      const toActor = mine.reduce((s, e) => s + Number(e.actor_rate_nok), 0)
      const fromCustomers = mine.reduce((s, e) => s + Number(e.customer_price_nok), 0)
      return { actor_id: a.id, uses: mine.length, to_actor_nok: toActor, from_customers_nok: fromCustomers, cut_nok: fromCustomers - toActor }
    })

    return NextResponse.json({
      tenant: { id: tenant.id, name: tenant.app_name },
      actors: actors || [],
      events,
      monthly,
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
