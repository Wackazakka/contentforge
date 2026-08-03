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

// Partner-admin: gjeldende tenants DIREKTE underledd, med påslaget vi tar av
// dem (markup_percent) og royalty-satsen de betaler oppover (royalty_cut_pct).
// Samme tilgang som resten av adminflatene: tenantens admins + leddene over.
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
  try {
    const g = await guard(request)
    if (g.fail) return g.fail
    // Feilen ble tidligere kastet bort her: et mislykket oppslag ga data=null,
    // som ble til «Ingen partnere under dette leddet ennaa» — nøyaktig samme
    // skjerm som en tom liste (Lars 3/8: partnerne FANTES i basen). En tom
    // liste og et feilet oppslag maa aldri se like ut.
    const { data: children, error: childErr } = await admin()
      .from('tenants')
      .select('id, slug, app_name, logo_url, brand_card_url, colors, markup_percent, fee_direct_pct, fee_indirect_pct, license_fee_pct, billing_mode')
      .eq('parent_tenant_id', g.tenant!.id)
      .order('app_name')
    if (childErr) {
      console.error('[partners] oppslag av underledd feilet:', childErr.message, '| tenant:', g.tenant!.id)
      return NextResponse.json(
        { error: `Kunne ikke lese underleddene: ${childErr.message}` },
        { status: 500 }
      )
    }

    // Partnerinntekter denne måneden (mottakersiden av lisensavgiften):
    // brutto aktiva-omsetning per partner = kundeprisene i hovedboken for
    // skuespillere partneren EIER; din lisensinntekt = brutto × partnerens sats.
    // Speiler nøyaktig tallene partneren selv ser i sin bankadmin. Defensivt —
    // feiler oppslaget, leveres partnerne uten inntektstall.
    const income: Record<string, { grossNok: number; licenseNok: number; uses: number }> = {}
    try {
      const childIds = (children || []).map((c) => c.id)
      if (childIds.length > 0) {
        const { data: actors } = await admin()
          .from('voice_actors')
          .select('id, owner_tenant_id')
          .in('owner_tenant_id', childIds)
        const actorOwner = new Map((actors || []).map((a) => [a.id, a.owner_tenant_id]))
        if (actorOwner.size > 0) {
          const monthStart = new Date()
          monthStart.setUTCDate(1)
          monthStart.setUTCHours(0, 0, 0, 0)
          const { data: events } = await admin()
            .from('voice_usage_events')
            .select('actor_id, customer_price_nok, created_at')
            .in('actor_id', Array.from(actorOwner.keys()))
            .gte('created_at', monthStart.toISOString())
            .limit(5000)
          for (const e of events || []) {
            const owner = actorOwner.get(e.actor_id)
            if (!owner) continue
            const row = income[owner] || { grossNok: 0, licenseNok: 0, uses: 0 }
            row.grossNok += Number(e.customer_price_nok)
            row.uses++
            income[owner] = row
          }
          for (const c of children || []) {
            const row = income[c.id]
            if (row) {
              row.grossNok = Math.round(row.grossNok * 100) / 100
              row.licenseNok = Math.round(row.grossNok * Number(c.license_fee_pct ?? 0)) / 100
            }
          }
        }
      }
    } catch { /* inntektstall er tilleggsinfo */ }

    // ROT-VISNINGEN: er dette leddet plattformen selv (ingen forelder), vis
    // INFRASTRUKTURINNTEKTENE (3 %) over HELE treet — per bank, denne måneden.
    // Rotens egne skuespillere betaler ikke avgift og holdes utenfor.
    let infraIncome: Array<{ tenantName: string; uses: number; grossNok: number; infraNok: number }> | null = null
    try {
      const { data: self } = await admin().from('tenants').select('parent_tenant_id').eq('id', g.tenant!.id).single()
      if (self && !self.parent_tenant_id) {
        const { data: allTenants } = await admin().from('tenants').select('id, app_name').neq('id', g.tenant!.id)
        const navn = new Map((allTenants || []).map((t) => [t.id, t.app_name]))
        const { data: actors } = await admin()
          .from('voice_actors')
          .select('id, owner_tenant_id')
          .in('owner_tenant_id', Array.from(navn.keys()))
        const actorOwner = new Map((actors || []).map((a) => [a.id, a.owner_tenant_id]))
        if (actorOwner.size > 0) {
          const monthStart = new Date()
          monthStart.setUTCDate(1)
          monthStart.setUTCHours(0, 0, 0, 0)
          const { data: events } = await admin()
            .from('voice_usage_events')
            .select('actor_id, customer_price_nok, created_at')
            .in('actor_id', Array.from(actorOwner.keys()))
            .gte('created_at', monthStart.toISOString())
            .limit(5000)
          const perBank = new Map<string, { uses: number; grossNok: number }>()
          for (const e of events || []) {
            const owner = actorOwner.get(e.actor_id)
            if (!owner) continue
            const row = perBank.get(owner) || { uses: 0, grossNok: 0 }
            row.uses++
            row.grossNok += Number(e.customer_price_nok)
            perBank.set(owner, row)
          }
          infraIncome = Array.from(perBank.entries()).map(([tid, v]) => ({
            tenantName: navn.get(tid) || 'Ukjent bank',
            uses: v.uses,
            grossNok: Math.round(v.grossNok * 100) / 100,
            infraNok: Math.round(v.grossNok * PLATFORM_RIGHTS_FEE_PCT) / 100,
          })).sort((a, b) => b.infraNok - a.infraNok)
        } else {
          infraIncome = []
        }
      }
    } catch { /* rot-visningen er tilleggsinfo */ }

    // tenantId er med for feilsoeking: er lista tom, vil man vite HVILKEN
    // tenant den var tom for (verten avgjoer, ikke klienten)
    return NextResponse.json({ tenant: { id: g.tenant!.id, name: g.tenant!.app_name, slug: g.tenant!.slug }, partners: children || [], income, infraIncome })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function PATCH(request: Request) {
  try {
    const g = await guard(request)
    if (g.fail) return g.fail
    const { tenantId, markupPercent, feeDirectPct, feeIndirectPct, licenseFeePct, appName, logoUrl, brandCardUrl, colors } = await request.json()
    if (!tenantId) return NextResponse.json({ error: 'Mangler tenantId' }, { status: 400 })

    const patch: Record<string, unknown> = {}
    if (appName !== undefined) {
      const v = String(appName).trim()
      if (!v) return NextResponse.json({ error: 'Navnet kan ikke være tomt' }, { status: 400 })
      patch.app_name = v.slice(0, 60)
    }
    if (logoUrl !== undefined) patch.logo_url = logoUrl ? String(logoUrl).trim() : null
    // Adressen paa merkekortet (Lars 3/8) — vises under «<Navn> VideoMaker».
    // Ren tekst, ikke lenke: den skal LESES av noen som ser en video.
    if (brandCardUrl !== undefined) patch.brand_card_url = brandCardUrl ? String(brandCardUrl).trim().slice(0, 80) : null
    if (colors !== undefined) {
      // Fargeprofil: kun CSS-variabler med hex-verdier slipper gjennom
      const clean: Record<string, string> = {}
      for (const [k, v] of Object.entries(colors || {})) {
        if (/^--[a-z0-9-]+$/.test(k) && (/^#[0-9a-fA-F]{3,8}$/.test(String(v)) || /^\d{1,3},\d{1,3},\d{1,3}$/.test(String(v)))) clean[k] = String(v)
      }
      // FLETT med eksisterende tokens — adminskjemaet sender bare hovedfargene,
      // og illustrasjons-tokens (--glow, --orb-*, --tile-*) skal overleve lagring
      const { data: existing } = await admin().from('tenants').select('colors').eq('id', tenantId).single()
      patch.colors = { ...((existing?.colors as Record<string, string>) || {}), ...clean }
    }
    if (markupPercent !== undefined) {
      const v = Number(markupPercent)
      if (!(v >= 0 && v <= 500)) return NextResponse.json({ error: 'Påslaget må være mellom 0 og 500 %' }, { status: 400 })
      patch.markup_percent = v
    }
    if (feeDirectPct !== undefined) {
      const v = Number(feeDirectPct)
      if (!(v >= 0 && v <= 50)) return NextResponse.json({ error: 'Direkte-avgiften må være mellom 0 og 50 %' }, { status: 400 })
      patch.fee_direct_pct = v
    }
    if (licenseFeePct !== undefined) {
      const v = Number(licenseFeePct)
      if (isNaN(v) || v < 0 || v > 30) {
        return NextResponse.json({ error: 'Lisensavgiften må være mellom 0 og 30 %' }, { status: 400 })
      }
      patch.license_fee_pct = v
    }
    if (feeIndirectPct !== undefined) {
      const v = Number(feeIndirectPct)
      if (!(v >= 0 && v <= 50)) return NextResponse.json({ error: 'Indirekte-avgiften må være mellom 0 og 50 %' }, { status: 400 })
      patch.fee_indirect_pct = v
    }
    if (Object.keys(patch).length === 0) return NextResponse.json({ error: 'Ingenting å oppdatere' }, { status: 400 })

    // Kun direkte underledd av gjeldende tenant kan endres herfra
    const { data, error } = await admin()
      .from('tenants')
      .update(patch)
      .eq('id', tenantId)
      .eq('parent_tenant_id', g.tenant!.id)
      .select('id')
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!data || data.length === 0) return NextResponse.json({ error: 'Partneren er ikke et direkte underledd av denne tenanten' }, { status: 404 })
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
