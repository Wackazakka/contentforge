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
  custom_domain?: string | null // eget domene, uten www (f.eks. 'voicebank.ai')
  name: string
  app_name: string
  logo_url: string | null
  default_locale?: string | null
  icon_url: string | null
  colors: Record<string, string>
  billing_mode: 'direct' | 'invoice'
  price_multiplier?: number
  vertical?: string | null // f.eks. 'craftsman' (Bombaza) — styrer copy/felt-overstyringer
  accept_actor_applications?: boolean | null // «Bli en stemme i banken» åpen for drop-in-skuespillere
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
  vertical: null,
  accept_actor_applications: false,
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

/** Vertsnavn uten port og uten www — nøkkelen både cache og custom_domain bruker. */
function bareHost(host: string): string {
  return host.split(':')[0].toLowerCase().replace(/^www\./, '')
}

/** Er verten et subdomene av basedomenet (eller selve basedomenet)? */
function isBaseDomainHost(bare: string): boolean {
  return bare === BASE_DOMAIN || bare.endsWith('.' + BASE_DOMAIN) || bare.endsWith('.localhost')
}

/**
 * Oppslag på EGET DOMENE (voicebank.ai), 2026-08-01.
 *
 * Uten dette falt alle egne domener til root-tenanten: slugFromHost kjenner
 * kun subdomener av BASE_DOMAIN, så voicebank.ai ville vist CenterForge med
 * feil navn/logo/farger — og verre, `privat-*`-kredittpakkene blir avvist i
 * credit-checkout fordi de er gatet på slug === 'voicebank'. Prisene ville
 * sett riktige ut (VoiceBanks kjedefaktor er også 1), så feilen ville
 * dukket opp først i kassen.
 *
 * Feiler oppslaget (kolonnen finnes ikke ennå) → null → subdomene-stien
 * gjelder som før. Samme «deploybar før SQL-en er kjørt»-prinsipp som
 * lookupTenant.
 */
async function lookupTenantByDomain(domain: string): Promise<Tenant | null> {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
    const { data, error } = await supabase
      .from('tenants')
      .select('*')
      .eq('custom_domain', domain)
      .eq('is_active', true)
      .maybeSingle()
    if (error || !data) return null
    return {
      ...data,
      colors: (data.colors && typeof data.colors === 'object') ? data.colors : {},
    } as Tenant
  } catch {
    return null
  }
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
  // Cachen nøkles på VERT (ikke slug): to vertsnavn kan peke på samme tenant,
  // og eget domene må aldri arve et cachet root-oppslag fra netlify-URL-en.
  const bare = bareHost(host)

  const hit = ttl.get(bare)
  if (hit && Date.now() - hit.t < 60_000) return hit.v

  let tenant: Tenant | null = null
  // 1) Eget domene — kun for verter utenfor basedomenet, så subdomene-
  //    trafikken beholder ett DB-oppslag som før.
  if (bare && !isBaseDomainHost(bare)) {
    tenant = await lookupTenantByDomain(bare)
  }
  // 2) Subdomene av basedomenet (voicebank.norditech.io) — uendret sti.
  if (!tenant) {
    let slug = slugFromHost(host)
    if (!slug || slug === 'www') slug = ROOT_TENANT.slug
    tenant = await lookupTenant(slug)
  }

  let resolved = tenant ?? ROOT_TENANT
  if (resolved !== ROOT_TENANT) {
    resolved = { ...resolved, price_multiplier: await chainPriceFactor(resolved) }
  }
  ttl.set(bare, { t: Date.now(), v: resolved })
  return resolved
})

/**
 * Tenantens EGEN origin for absolutte lenker (canonical, OG, e-post).
 * Leser gjeldende vert, så hver tenant får sine egne URL-er i stedet for
 * en global NEXT_PUBLIC_BASE_URL. Fallback: basedomene-subdomenet.
 */
export async function getTenantOrigin(): Promise<string> {
  try {
    const h = await headers()
    const host = h.get('x-forwarded-host') ?? h.get('host') ?? ''
    if (host) return `https://${host.split(':')[0]}`
  } catch {
    /* utenfor request-kontekst (cron, webhook) — fall gjennom */
  }
  return process.env.NEXT_PUBLIC_BASE_URL || 'https://contentforge-610.netlify.app'
}
