import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getTenant } from '@/lib/tenantServer'
import { actorSettlement } from '@/lib/actorLedger'
import { PREVIEW_ROYALTY_PER_1000 } from '@/lib/voiceBank'

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
    let userId: string | null = null
    const auth = request.headers.get('authorization')
    if (auth?.startsWith('Bearer ')) {
      const { data } = await admin().auth.getUser(auth.slice(7))
      email = data?.user?.email ?? null
      userId = data?.user?.id ?? null
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

    // Er rettighetshaveren OGSÅ kunde her? Innlogging oppretter alltid en
    // organisasjon, så «har organisasjon» beviser ingenting. Kunde = har
    // produsert noe eller kjøpt kreditt på dette domenet. En ren
    // rettighetshaver skal ikke se produksjonsflatene (Lars 16/9).
    let isCustomer = false
    if (userId) {
      try {
        let oq = supabase.from('organizations').select('id').eq('owner_id', userId)
        if (tenant.id !== 'root') oq = oq.eq('tenant_id', tenant.id)
        const { data: orgs } = await oq
        const orgIds = (orgs || []).map((o) => o.id as string)
        if (orgIds.length > 0) {
          const [{ count: prod }, { count: tops }] = await Promise.all([
            supabase.from('products').select('id', { count: 'exact', head: true }).in('organization_id', orgIds),
            supabase.from('org_topups').select('id', { count: 'exact', head: true }).in('organization_id', orgIds),
          ])
          isCustomer = (prod ?? 0) > 0 || (tops ?? 0) > 0
        }
      } catch { /* uvisst → behandles som kunde, som før */ isCustomer = true }
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

      // Lisensene rettighetshaveren er bundet av. Hen får se OMFANGET — man kan
      // ikke ha samtykket til en film uten å vite hvilken — og sin egen side av
      // pengene, inkludert fradrag som tas AV honoraret (agent/manager). Ikke
      // kundeprisen og ikke kundens navn: byråets forhold, som ellers i
      // /min-stemme.
      const { data: lics } = await supabase
        .from('licences')
        .select('id, kind, asset_type, status, media_class, territory, term_start, term_end, exclusivity, work_title, production_tier, role_scope, fee_actor_nok, created_at')
        .eq('actor_id', a.id)
        .in('status', ['quote', 'active', 'expired'])
        .order('created_at', { ascending: false })
      const licIds = (lics || []).map((l) => l.id as string)
      const [{ data: splits }, { data: steps }] = await Promise.all([
        licIds.length
          ? supabase.from('licence_splits').select('licence_id, party_type, party_label, basis, pct, amount_nok').in('licence_id', licIds)
          : Promise.resolve({ data: [] as Array<Record<string, unknown>> }),
        licIds.length
          ? supabase.from('licence_steps').select('licence_id, trigger_kind, label, status, actor_nok').in('licence_id', licIds)
          : Promise.resolve({ data: [] as Array<Record<string, unknown>> }),
      ])

      // Kun rettighetshaverens egen side av taksten — aldri kundeprisen.
      const rates: Record<string, number> = {}
      const r = (a.rates || {}) as Record<string, { actor_rate_nok?: number }>
      for (const k of Object.keys(r)) if (k !== 'preview' && r[k]?.actor_rate_nok != null) rates[k] = Number(r[k].actor_rate_nok)
      // Proevelytt: naar en kunde tester stemmen. Per 1000 tegn, ikke per bruk.
      const previewRatePer1000 = Number(r.preview?.actor_rate_nok ?? PREVIEW_ROYALTY_PER_1000.actor)

      out.push({
        id: a.id,
        name: a.name,
        hasVoice: !!a.elevenlabs_voice_id,
        hasFace: !!a.face_character_id,
        isActive: !!a.is_active,
        isExclusive: a.is_exclusive !== false,
        defaultRateNok: Number(a.actor_rate_nok),
        rates,
        previewRatePer1000,
        since: a.created_at,
        managedBy: tenantNames.get(a.owner_tenant_id as string) ?? tenant.app_name,
        uses: settlement.uses,
        earnedNok: settlement.earnedNok,
        // Delt opp, fordi de to leddene betyr helt ulike ting for den som eier
        // stemmen: måleren er småpenger per bruk, lisensen er honoraret.
        meterNok: settlement.meterNok,
        licenceNok: settlement.licenceNok,
        paidNok: settlement.paidNok,
        dueNok: settlement.dueNok,
        payouts: settlement.payouts,
        licences: (lics || []).map((l) => {
          const fradrag = (splits || [])
            .filter((s) => s.licence_id === l.id && s.basis === 'actor_fee')
            .map((s) => ({
              label: (s.party_label as string) || (s.party_type as string),
              pct: s.pct != null ? Number(s.pct) : null,
              amountNok: Number(s.amount_nok),
            }))
          const brutto = Number(l.fee_actor_nok)
          return {
            id: l.id,
            kind: l.kind,
            assetType: l.asset_type,
            status: l.status,
            workTitle: l.work_title,
            productionTier: l.production_tier,
            roleScope: l.role_scope,
            mediaClass: l.media_class,
            territory: l.territory,
            termStart: l.term_start,
            termEnd: l.term_end,
            exclusivity: l.exclusivity,
            grossNok: brutto,
            deductions: fradrag,
            netNok: Math.round((brutto - fradrag.reduce((s, f) => s + f.amountNok, 0)) * 100) / 100,
            steps: (steps || [])
              .filter((s) => s.licence_id === l.id)
              .map((s) => ({
                trigger: s.trigger_kind,
                label: s.label,
                status: s.status,
                toYouNok: Number(s.actor_nok),
              })),
          }
        }),
        events: events.map((e) => ({
          id: e.id,
          at: e.created_at,
          kind: (e.meta as { kind?: string } | null)?.kind || (e.asset_type === 'face' ? 'face' : 'ukjent'),
          chars: (e.meta as { chars?: number } | null)?.chars ?? null,
          assetType: e.asset_type || 'voice',
          usedBy: tenantNames.get(e.used_by_tenant_id as string) ?? 'Ukjent',
          toYouNok: Number(e.actor_rate_nok),
        })),
      })
    }

    return NextResponse.json({ tenant: { name: tenant.app_name }, actors: out, isCustomer })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Ukjent feil' }, { status: 500 })
  }
}
