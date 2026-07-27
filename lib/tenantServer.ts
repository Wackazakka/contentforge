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
  icon_url: string | null
  colors: Record<string, string>
  billing_mode: 'direct' | 'invoice'
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

// cache() = per-request dedupe (layout + generateMetadata deler ett oppslag)
export const getTenant = cache(async (): Promise<Tenant> => {
  const h = await headers()
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? ''
  let slug = slugFromHost(host)
  if (!slug || slug === 'www') slug = ROOT_TENANT.slug

  const hit = ttl.get(slug)
  if (hit && Date.now() - hit.t < 60_000) return hit.v

  const tenant = (await lookupTenant(slug)) ?? ROOT_TENANT
  ttl.set(slug, { t: Date.now(), v: tenant })
  return tenant
})
