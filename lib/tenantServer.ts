import { cache } from 'react'
import { headers } from 'next/headers'
import { createClient } from '@supabase/supabase-js'

// White-label tenant-oppslag: host-header → tenants-rad (subdomene = slug).
// Trygg fallback til root-tenant (CenterForge) hvis tabellen mangler eller
// oppslaget feiler — gjør koden deploybar før SQL-en er kjørt.

export interface Tenant {
  id: string
  slug: string
  parent_tenant_id: string | null
  name: string
  app_name: string
  logo_url: string | null
  default_locale?: string | null
  icon_url: string | null
  colors: Record<string, string>
  billing_mode: 'direct' | 'invoice'
  price_multiplier?: number
  is_active: boolean
}

const BASE_DOMAIN = (process.env.TENANT_BASE_DOMAIN || 'centerforge.app').toLowerCase()

export const ROOT_TENANT: Tenant = {
  id: 'root',
  slug: 'centerforge',
  parent_tenant_id: null,
  name: 'CenterForge (root)',
  app_name: 'CenterForge',
  logo_url: null,
  icon_url: null,
  colors: {},
  billing_mode: 'direct',
  price_multiplier: 1,
  is_active: true,
}

// Per-lambda TTL-cache (~60s) så vi ikke slår opp i DB per sidevisning
const ttl = new Map<string, { t: number; v: Tenant }>()

async function lookupTenant(slug: string): Promise<Tenant | null> {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
    const { data, error } = await supabase
      .from('tenants')
      .select('*')
      .eq('slug', slug)
      .eq('is_active', true)
      .single()
    if (error || !data) return null
    return {
      ...data,
      colors: (data.colors && typeof data.colors === 'object') ? data.colors : {},
    } as Tenant
  } catch {
    return null
  }
}

function slugFromHost(host: string): string | null {
  const h = host.split(':')[0].toLowerCase()
  if (h.endsWith('.' + BASE_DOMAIN)) {
    // voicebank.centerforge.app → 'voicebank'
    const label = h.slice(0, -(BASE_DOMAIN.length + 1)).split('.').pop() || null
    return label
  }
  if (h.endsWith('.localhost')) return h.split('.')[0] // dev: voicebank.localhost:3000
  return null // basedomene, netlify-URL, ukjent → root
}

/**
 * Visningsfaktor relativt til COSTS_NOK (som er råkost × 2):
 * pris hos tenant T = råkost × Π (1 + markup_i/100) for kjeden root→T (uten root).
 * Faktor = Π / 2. Root/direktebrukere → 1 (dagens tall).
 * Eksempel: VoiceBank (vårt påslag 100 %) → 2/2 = 1; deres kunde (+100 %) → 4/2 = 2.
 */
async function chainPriceFactor(t: Tenant): Promise<number> {
  if (!t.parent_tenant_id) return 1
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
    let product = 1
    let cur: any = t
    for (let hop = 0; hop < 4 && cur; hop++) {
      product *= 1 + (Number(cur.markup_percent ?? 100) / 100)
      if (!cur.parent_tenant_id) break
      const { data } = await supabase.from('tenants').select('id, parent_tenant_id, markup_percent').eq('id', cur.parent_tenant_id).single()
      cur = data && data.parent_tenant_id !== null ? data : null // root (parent=null) teller ikke
    }
    return product / 2
  } catch {
    return 1
  }
}

// cache() = per-request dedupe (layout + generateMetadata deler ett oppslag)
export const getTenant = cache(async (): Promise<Tenant> => {
  const h = await headers()
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? ''
  let slug = slugFromHost(host)
  if (!slug || slug === 'www') slug = ROOT_TENANT.slug

  const hit = ttl.get(slug)
  if (hit && Date.now() - hit.t < 60_000) return hit.v

  let tenant = (await lookupTenant(slug)) ?? ROOT_TENANT
  if (tenant !== ROOT_TENANT) {
    tenant = { ...tenant, price_multiplier: await chainPriceFactor(tenant) }
  }
  ttl.set(slug, { t: Date.now(), v: tenant })
  return tenant
})
