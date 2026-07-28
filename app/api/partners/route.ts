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
    const { data: children } = await admin()
      .from('tenants')
      .select('id, slug, app_name, logo_url, colors, markup_percent, fee_direct_pct, fee_indirect_pct, billing_mode')
      .eq('parent_tenant_id', g.tenant!.id)
      .order('app_name')
    return NextResponse.json({ tenant: { id: g.tenant!.id, name: g.tenant!.app_name }, partners: children || [] })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function PATCH(request: Request) {
  try {
    const g = await guard(request)
    if (g.fail) return g.fail
    const { tenantId, markupPercent, feeDirectPct, feeIndirectPct, appName, logoUrl, colors } = await request.json()
    if (!tenantId) return NextResponse.json({ error: 'Mangler tenantId' }, { status: 400 })

    const patch: Record<string, unknown> = {}
    if (appName !== undefined) {
      const v = String(appName).trim()
      if (!v) return NextResponse.json({ error: 'Navnet kan ikke være tomt' }, { status: 400 })
      patch.app_name = v.slice(0, 60)
    }
    if (logoUrl !== undefined) patch.logo_url = logoUrl ? String(logoUrl).trim() : null
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
