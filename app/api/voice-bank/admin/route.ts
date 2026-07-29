import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getTenant } from '@/lib/tenantServer'
import { isTenantAdmin, PLATFORM_RIGHTS_FEE_PCT } from '@/lib/voiceBank'

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
  )
}

// Felles vakt for alle metodene: host-tenant + admin-sjekk oppover kjeden.
// Returnerer tenanten, eller et ferdig feilsvar.
async function guard(request: Request): Promise<{ tenant?: Awaited<ReturnType<typeof getTenant>>; fail?: NextResponse }> {
  const tenant = await getTenant()
  if (tenant.id === 'root') {
    return { fail: NextResponse.json({ error: 'Tenant-oppsett mangler' }, { status: 404 }) }
  }
  // Hvem spør? E-post fra verifisert JWT — aldri fra klientdata
  let email: string | null = null
  const auth = request.headers.get('authorization')
  if (auth?.startsWith('Bearer ')) {
    const { data } = await admin().auth.getUser(auth.slice(7))
    email = data?.user?.email ?? null
  }
  if (!email) return { fail: NextResponse.json({ error: 'Ikke innlogget' }, { status: 401 }) }
  if (!(await isTenantAdmin(email, tenant.id))) {
    return { fail: NextResponse.json({ error: 'Ingen admin-tilgang' }, { status: 403 }) }
  }
  return { tenant }
}

// Rettighetsavgift (Lars 2026-07-29, ERSTATTER to-sats-marginmodellen):
// plattformen tar flat PLATFORM_RIGHTS_FEE_PCT av BRUTTO stemmeomsetning
// (kundepris, alle kinds) i alle ledd — betaling for rettighetshåndtering,
// logging og utbetaling. Root betaler ingen avgift (den ER plattformen).
// fee_direct_pct/fee_indirect_pct-kolonnene ligger sovende (som royalty_cut_pct).
async function getFees(tenantId: string): Promise<{ rightsPct: number } | null> {
  try {
    const { data: t } = await admin()
      .from('tenants')
      .select('parent_tenant_id')
      .eq('id', tenantId)
      .single()
    if (!t?.parent_tenant_id) return null
    return { rightsPct: PLATFORM_RIGHTS_FEE_PCT }
  } catch {
    return null
  }
}

function feeForEvents(events: Array<{ customer_price_nok: number }>, _ownTenantId: string, fees: { rightsPct: number } | null): number {
  if (!fees) return 0
  let fee = 0
  for (const e of events) {
    fee += Number(e.customer_price_nok) * (fees.rightsPct / 100)
  }
  return Math.round(fee * 100) / 100
}

// Stemmebank-admin for gjeldende tenant (host-basert). Tilgang: tenantens egne
// admins + admins i leddene over (admin_emails på tenants, sjekkes oppover).
// Viser tenantens EGNE skuespillere med full sats-info + royalty-loggen deres.
export async function GET(request: Request) {
  try {
    const g = await guard(request)
    if (g.fail) return g.fail
    const tenant = g.tenant!

    const supabase = admin()

    // Detaljvisning for én skuespiller: full historikk + tall per måned og brukstype
    const actorId = new URL(request.url).searchParams.get('actorId')
    if (actorId) {
      const { data: actor } = await supabase
        .from('voice_actors')
        .select('*')
        .eq('id', actorId)
        .eq('owner_tenant_id', tenant.id)
        .single()
      if (!actor) return NextResponse.json({ error: 'Skuespilleren finnes ikke i denne banken' }, { status: 404 })
      const { data: ev } = await supabase
        .from('voice_usage_events')
        .select('id, used_by_tenant_id, actor_rate_nok, customer_price_nok, meta, created_at')
        .eq('actor_id', actorId)
        .order('created_at', { ascending: false })
        .limit(1000)
      const events = ev || []
      const agg = (key: (e: any) => string) => {
        const m = new Map<string, { uses: number; to_actor_nok: number; from_customers_nok: number }>()
        for (const e of events) {
          const k = key(e)
          const row = m.get(k) || { uses: 0, to_actor_nok: 0, from_customers_nok: 0 }
          row.uses++
          row.to_actor_nok += Number(e.actor_rate_nok)
          row.from_customers_nok += Number(e.customer_price_nok)
          m.set(k, row)
        }
        return Array.from(m.entries()).map(([k, v]) => ({ key: k, ...v }))
      }
      const fees = await getFees(tenant.id)
      return NextResponse.json({
        tenant: { id: tenant.id, name: tenant.app_name },
        actor,
        events: events.slice(0, 200),
        byMonth: agg((e) => String(e.created_at).slice(0, 7)).sort((a, b) => b.key.localeCompare(a.key)),
        byKind: agg((e) => e.meta?.kind || 'ukjent'),
        fees,
        totalFeeNok: feeForEvents(events as any, tenant.id, fees),
      })
    }

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
        .limit(1000)
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

    const fees = await getFees(tenant.id)
    const monthEvents = events.filter((e) => new Date(e.created_at) >= monthStart)

    return NextResponse.json({
      tenant: { id: tenant.id, name: tenant.app_name },
      actors: actors || [],
      events,
      monthly,
      fees,
      monthFeeNok: feeForEvents(monthEvents as any, tenant.id, fees),
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// Legg til skuespiller i gjeldende tenants bank
export async function POST(request: Request) {
  try {
    const g = await guard(request)
    if (g.fail) return g.fail
    const tenant = g.tenant!

    const body = await request.json()
    const name = String(body.name || '').trim()
    const voiceId = String(body.elevenlabsVoiceId || '').trim()
    const actorRate = Number(body.actorRateNok)
    const customerPrice = Number(body.customerPriceNok)
    const honorarium = Number(body.honorariumNok || 0)
    if (!name || !voiceId) return NextResponse.json({ error: 'Navn og ElevenLabs voice-id må fylles ut' }, { status: 400 })
    if (!(actorRate >= 0) || !(customerPrice >= 0)) {
      return NextResponse.json({ error: 'Satsene må være tall (0 eller høyere)' }, { status: 400 })
    }
    // Rabatt-trapper: [{from_uses, discount_pct}] — valideres og sorteres
    const tiers = (Array.isArray(body.discountTiers) ? body.discountTiers : [])
      .map((t: any) => ({ from_uses: Math.round(Number(t.from_uses)), discount_pct: Number(t.discount_pct) }))
      .filter((t: any) => t.from_uses > 0 && t.discount_pct > 0 && t.discount_pct <= 100)
      .sort((a: any, b: any) => a.from_uses - b.from_uses)

    const { data, error } = await admin()
      .from('voice_actors')
      .insert({
        owner_tenant_id: tenant.id,
        name,
        elevenlabs_voice_id: voiceId,
        honorarium_nok: honorarium >= 0 ? honorarium : 0,
        actor_rate_nok: actorRate,
        customer_price_nok: customerPrice,
        discount_tiers: tiers,
        notes: body.notes ? String(body.notes) : null,
        // Eksplisitt (var tidligere DB-default): eksklusiv med mindre skjemaet sier delt
        is_exclusive: body.isExclusive !== false,
      })
      .select('id')
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, id: data.id })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// Oppdater en skuespiller (kun tenantens egne): aktiv/inaktiv og/eller takster
export async function PATCH(request: Request) {
  try {
    const g = await guard(request)
    if (g.fail) return g.fail
    const tenant = g.tenant!

    const body = await request.json()

    // Bulk: sett eksklusivitet for mange skuespillere i ett kall (Både Og-skala).
    // KUN isExclusive i bulk — owner-scope + antallsverifisering hindrer at
    // fremmede rader treffes.
    if (Array.isArray(body.actorIds)) {
      if (typeof body.isExclusive !== 'boolean') {
        return NextResponse.json({ error: 'Bulk støtter kun isExclusive' }, { status: 400 })
      }
      const ids = body.actorIds.map(String).slice(0, 200)
      if (ids.length === 0) return NextResponse.json({ error: 'Tom liste' }, { status: 400 })
      const { data, error } = await admin()
        .from('voice_actors')
        .update({ is_exclusive: body.isExclusive })
        .in('id', ids)
        .eq('owner_tenant_id', tenant.id)
        .select('id')
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      if ((data || []).length !== ids.length) {
        return NextResponse.json({ error: `Oppdaterte ${(data || []).length} av ${ids.length} — noen tilhører ikke denne banken`, updated: (data || []).length }, { status: 409 })
      }
      return NextResponse.json({ ok: true, updated: data!.length })
    }

    const actorId = body.actorId
    if (!actorId) return NextResponse.json({ error: 'Mangler actorId' }, { status: 400 })

    const patch: Record<string, unknown> = {}
    if (typeof body.isActive === 'boolean') patch.is_active = body.isActive
    if (typeof body.isExclusive === 'boolean') patch.is_exclusive = body.isExclusive
    if (typeof body.isPublic === 'boolean') patch.is_public = body.isPublic
    if (body.bio !== undefined) patch.bio = body.bio ? String(body.bio).slice(0, 2000) : null
    if (Array.isArray(body.photoUrls)) patch.photo_urls = body.photoUrls.map(String).slice(0, 12)
    if (Array.isArray(body.sampleUrls)) patch.sample_urls = body.sampleUrls.map(String).slice(0, 12)
    if (body.actorRateNok !== undefined) {
      const v = Number(body.actorRateNok)
      if (!(v >= 0)) return NextResponse.json({ error: 'Ugyldig skuespillersats' }, { status: 400 })
      patch.actor_rate_nok = v
    }
    if (body.customerPriceNok !== undefined) {
      const v = Number(body.customerPriceNok)
      if (!(v >= 0)) return NextResponse.json({ error: 'Ugyldig kundepris' }, { status: 400 })
      patch.customer_price_nok = v
    }
    if (typeof body.libraryEnabled === 'boolean') patch.library_enabled = body.libraryEnabled
    if (body.librarySharePct !== undefined) {
      const v = Number(body.librarySharePct)
      if (!(v >= 0 && v <= 100)) return NextResponse.json({ error: 'Skuespillerens andel må være 0-100 %' }, { status: 400 })
      patch.library_share_pct = v
    }
    if (body.actorEmail !== undefined) {
      // E-post for godkjenningsvarsler (magisk lenke); tom = ingen varsling mulig
      const v = String(body.actorEmail).trim()
      patch.actor_email = v && v.includes('@') ? v : null
    }
    if (body.faceCharacterId !== undefined) {
      // Kobling til skuespillerens ansikt (LoRA-karakter); tom streng fjerner koblingen
      patch.face_character_id = body.faceCharacterId ? String(body.faceCharacterId).trim() : null
    }
    if (body.rates !== undefined) {
      // Takster per brukstype: {video:{actor_rate_nok,customer_price_nok},…} — kun gyldige tall beholdes
      const clean: Record<string, { actor_rate_nok: number; customer_price_nok: number }> = {}
      for (const [kind, r] of Object.entries(body.rates || {})) {
        const rate = Number((r as any)?.actor_rate_nok)
        const price = Number((r as any)?.customer_price_nok)
        if (rate >= 0 && price >= 0) clean[kind] = { actor_rate_nok: rate, customer_price_nok: price }
      }
      patch.rates = clean
    }
    if (Object.keys(patch).length === 0) return NextResponse.json({ error: 'Ingenting å oppdatere' }, { status: 400 })

    const { data, error } = await admin()
      .from('voice_actors')
      .update(patch)
      .eq('id', actorId)
      .eq('owner_tenant_id', tenant.id)
      .select('id')
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!data || data.length === 0) return NextResponse.json({ error: 'Skuespilleren finnes ikke i denne banken' }, { status: 404 })
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
