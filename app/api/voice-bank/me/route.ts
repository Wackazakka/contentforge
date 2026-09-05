import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getTenant } from '@/lib/tenantServer'
import { actorSettlement } from '@/lib/actorLedger'

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
  )
}

// Rettighetshaverens eget innsyn i hovedboken.
//
// Dette er den halvdelen som manglet. Forsiden lover «et menneske kan si ja
// uten å måtte stole på noen» — det krever at mennesket selv kan se hva
// stemmen er brukt til, hva det ga, og hva som er betalt. Uten denne ruten
// måtte de spørre oss og stole på tallet.
//
// Identitet: den innloggede brukerens e-post (fra verifisert JWT, aldri fra
// body/query) matches mot voice_actors.actor_email — det eneste
// identitetsfeltet en rettighetshaver har i systemet. Én person kan ha flere
// rader (én per forvaltningsavtale: stemme, ansikt, eller begge).
//
// Avgrensning: eiertenanten må være host-tenanten. Rettighetshaveren logger
// inn der avtalen deres ligger. Rot-hosten ser på tvers (for testing).
//
// Hva som IKKE sendes: kundepris og kundens navn. Rettighetshaveren har krav
// på å vite hva de selv får, når og for hva — ikke byråets margin eller
// byråets kundeliste. Det er byråets forhold (avtalens pkt. 6.1).

export async function GET(request: Request) {
  try {
    let email: string | null = null
    const auth = request.headers.get('authorization')
    if (auth?.startsWith('Bearer ')) {
      const { data } = await admin().auth.getUser(auth.slice(7))
      email = data?.user?.email ?? null
    }
    if (!email) return NextResponse.json({ error: 'Ikke innlogget' }, { status: 401 })

    const tenant = await getTenant()
    const supabase = admin()

    let q = supabase
      .from('voice_actors')
      .select('id, owner_tenant_id, name, elevenlabs_voice_id, face_character_id, is_active, is_exclusive, actor_rate_nok, rates, created_at')
      .ilike('actor_email', email)
    if (tenant.id !== 'root') q = q.eq('owner_tenant_id', tenant.id)
    const { data: rows } = await q.order('created_at', { ascending: true })
    const actors = rows || []

    if (actors.length === 0) {
      return NextResponse.json({ tenant: { name: tenant.app_name }, actors: [] })
    }

    // Byrånavn for «hvem brukte stemmen» — ett oppslag for alle hendelser.
    const tenantNames = new Map<string, string>()
    const nameOf = async (ids: string[]) => {
      const missing = ids.filter((id) => id && !tenantNames.has(id))
      if (missing.length === 0) return
      const { data: ts } = await supabase.from('tenants').select('id, app_name, name').in('id', missing)
      for (const t of ts || []) tenantNames.set(t.id, t.app_name || t.name || 'Ukjent')
    }

    const out = []
    for (const a of actors) {
      const [settlement, ev] = await Promise.all([
        actorSettlement(a.id),
        supabase
          .from('voice_usage_events')
          .select('id, used_by_tenant_id, actor_rate_nok, meta, asset_type, created_at')
          .eq('actor_id', a.id)
          .order('created_at', { ascending: false })
          .limit(200),
      ])
      const events = ev.data || []
      await nameOf([a.owner_tenant_id as string, ...events.map((e) => e.used_by_tenant_id as string)])

      // Kun rettighetshaverens egen side av taksten — aldri kundeprisen.
      const rates: Record<string, number> = {}
      const r = (a.rates || {}) as Record<string, { actor_rate_nok?: number }>
      for (const k of Object.keys(r)) if (r[k]?.actor_rate_nok != null) rates[k] = Number(r[k].actor_rate_nok)

      out.push({
        id: a.id,
        name: a.name,
        hasVoice: !!a.elevenlabs_voice_id,
        hasFace: !!a.face_character_id,
        isActive: !!a.is_active,
        isExclusive: a.is_exclusive !== false,
        defaultRateNok: Number(a.actor_rate_nok),
        rates,
        since: a.created_at,
        managedBy: tenantNames.get(a.owner_tenant_id as string) ?? tenant.app_name,
        uses: settlement.uses,
        earnedNok: settlement.earnedNok,
        paidNok: settlement.paidNok,
        dueNok: settlement.dueNok,
        payouts: settlement.payouts,
        events: events.map((e) => ({
          id: e.id,
          at: e.created_at,
          kind: (e.meta as { kind?: string } | null)?.kind || (e.asset_type === 'face' ? 'face' : 'ukjent'),
          assetType: e.asset_type || 'voice',
          usedBy: tenantNames.get(e.used_by_tenant_id as string) ?? 'Ukjent',
          toYouNok: Number(e.actor_rate_nok),
        })),
      })
    }

    return NextResponse.json({ tenant: { name: tenant.app_name }, actors: out })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Ukjent feil' }, { status: 500 })
  }
}
