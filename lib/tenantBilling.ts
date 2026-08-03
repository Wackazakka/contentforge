import { createClient } from '@supabase/supabase-js'
import { platformWholesaleFactor } from './platformMarkup'

// Tenant-fakturering: avgjør om et produkt tilhører en invoice-fakturert tenant
// (white-label-partner/kunde) — de skal ALDRI møte kreditt-/betalingsmur;
// bruken deres logges i usage_events og faktureres partneren månedlig.

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
  )
}

export interface ProductTenant {
  tenantId: string | null
  billingMode: 'direct' | 'invoice'
  organizationId: string | null
  ownerId: string | null
}

// produkt → organisasjon → tenant (tenant løses ALLTID server-side; aldri fra klient)
export async function getProductTenant(productId: string): Promise<ProductTenant> {
  const fallback: ProductTenant = { tenantId: null, billingMode: 'direct', organizationId: null, ownerId: null }
  try {
    const supabase = admin()
    const { data: product } = await supabase
      .from('products')
      .select('organization_id')
      .eq('id', productId)
      .single()
    if (!product?.organization_id) return fallback

    const { data: org } = await supabase
      .from('organizations')
      .select('id, owner_id, tenant_id')
      .eq('id', product.organization_id)
      .single()
    if (!org?.tenant_id) return { ...fallback, organizationId: org?.id ?? null, ownerId: org?.owner_id ?? null }

    const { data: tenant } = await supabase
      .from('tenants')
      .select('id, billing_mode')
      .eq('id', org.tenant_id)
      .single()
    return {
      tenantId: tenant?.id ?? org.tenant_id,
      billingMode: (tenant?.billing_mode as 'direct' | 'invoice') || 'direct',
      organizationId: org.id,
      ownerId: org.owner_id,
    }
  } catch {
    return fallback
  }
}

/**
 * Forskuddssaldo for en partner-tenant: SUM(påfyll+bonus) − SUM(forbruk i hele
 * subtreet). Partnere kjøper kreditter upfront (null kredittrisiko for oss);
 * volumrabatt gis som bonus_nok ved registrering av kjøpet.
 * Saldo beregnes for partner-tenanten (nærmeste forfedre-tenant med topups
 * finnes ikke i v1 — vi sjekker tenantens egen id og forelder).
 */
export async function getPartnerBalance(tenantId: string): Promise<number | null> {
  try {
    const supabase = admin()
    // Finn partner-nivået: tenanten selv eller dens forelder (to-lags-modellen)
    const { data: t } = await supabase.from('tenants').select('id, parent_tenant_id').eq('id', tenantId).single()
    if (!t) return null
    const candidates = [t.id, t.parent_tenant_id].filter(Boolean) as string[]

    for (const pid of candidates) {
      const { data: tops } = await supabase.from('partner_topups').select('amount_nok, bonus_nok').eq('tenant_id', pid)
      if (!tops || tops.length === 0) continue
      const paidIn = tops.reduce((s, r) => s + Number(r.amount_nok) + Number(r.bonus_nok), 0)
      // Forbruk i hele partnerens subtre
      const { data: subtree } = await supabase.from('tenants').select('id').or(`id.eq.${pid},parent_tenant_id.eq.${pid}`)
      const ids = (subtree || []).map((r) => r.id)
      const { data: usage } = await supabase.from('usage_events').select('cost_nok').in('tenant_id', ids)
      const used = (usage || []).reduce((s, r) => s + Number(r.cost_nok), 0)
      return paidIn - used
    }
    return null // ingen topups registrert → ubegrenset i v1 (før første kjøp)
  } catch {
    return null
  }
}

/**
 * Sluttkundepris-faktor for en tenant: Π(1+markup/100) over kjeden root→tenant
 * (uten root). Samme formel som
 * chainPriceFactor i tenantServer, men oppslag per tenant-id — brukes ved
 * logging så kundeprisen fryses på raden selv om påslag endres senere.
 */
export async function chainFactorByTenantId(tenantId: string): Promise<number> {
  try {
    const supabase = admin()
    let product = 1
    let curId: string | null = tenantId
    for (let hop = 0; hop < 4 && curId; hop++) {
      const res: { data: { parent_tenant_id: string | null; markup_percent: number | null } | null } =
        await supabase.from('tenants').select('parent_tenant_id, markup_percent').eq('id', curId).single()
      if (!res.data || res.data.parent_tenant_id === null) break // root teller ikke
      product *= 1 + Number(res.data.markup_percent ?? 0) / 100
      curId = res.data.parent_tenant_id
    }
    // Se tenantServer.chainPriceFactor — halveringen er fjernet 3/8 saa
    // paaslaget betyr paaslag. MAA holdes lik den funksjonen.
    return product
  } catch {
    return 1
  }
}

/**
 * Forskuddssaldo for en SLUTTKUNDE-organisasjon (f.eks. byråets kunde):
 * SUM(org_topups) − SUM(forbruk til kundepris). null = ingen forskuddskonto
 * opprettet → ingen sperre (etterskudds-/innkjøringsmodus, tenantens valg).
 */
export async function getOrgBalance(organizationId: string): Promise<number | null> {
  try {
    const supabase = admin()
    const { data: tops } = await supabase
      .from('org_topups')
      .select('amount_nok, bonus_nok')
      .eq('organization_id', organizationId)
    if (!tops || tops.length === 0) return null
    const paidIn = tops.reduce((s, r) => s + Number(r.amount_nok) + Number(r.bonus_nok), 0)
    const { data: usage } = await supabase
      .from('usage_events')
      .select('cost_nok, customer_cost_nok')
      .eq('organization_id', organizationId)
    const used = (usage || []).reduce((s, r) => s + Number(r.customer_cost_nok ?? r.cost_nok), 0)
    return paidIn - used
  } catch {
    return null
  }
}

// Logg en forbrukshendelse (grunnlag for partnerfaktura). Feiler stille — måling
// skal aldri velte produksjon.
export async function logUsageEvent(e: {
  productId?: string | null
  draftId?: string | null
  userId?: string | null
  eventType: string
  costNok: number
  meta?: Record<string, unknown>
}): Promise<void> {
  try {
    let productId = e.productId
    if (!productId && e.draftId) {
      const { data: draft } = await admin().from('production_drafts').select('product_id').eq('id', e.draftId).single()
      productId = draft?.product_id ?? null
    }
    if (!productId) return
    e = { ...e, productId }
    const pt = await getProductTenant(productId)
    if (!pt.tenantId) return // ingen tenant-kobling (eldre data) → hopp over
    const supabase = admin()
    // ContentForges engrospris = COSTS_NOK: råkost + vårt eget påslag (Lars 1/8:
    // «ContentForges andel er produksjonsprisen + påslaget»).
    //
    // ⚠️ Her sto tidligere en skalering med partnerens markup_percent. Men det
    // feltet styrer KUNDEPRISEN (chainPriceFactor) — brukt begge steder ble
    // cost_nok og customer_cost_nok identiske, og white-labelens margin ble 0
    // i avregningen. Engrosprisen er den samme uansett hva partneren tar av
    // sine egne kunder; vil vi differensiere den, trengs et eget felt.
    // Innprisen partneren faktureres = raakost x (1 + VAART paaslag/100).
    // COSTS_NOK er raakost x 2, saa faktoren er 1,0 ved standard 100 % — ingen
    // tall flytter seg foer noen bevisst skrur paa plattformpaaslaget (3/8).
    const costNok = e.costNok * (await platformWholesaleFactor())
    // Kundepris (hele kjedens påslag) fryses på raden — sluttkundens saldo
    // trekkes til DERES pris, partnersaldoen til partnerpris (cost_nok)
    // Kundeprisen bygger paa INNPRISEN, ikke listeprisen — saa partnerens
    // prosent staar urort naar vaart paaslag endres (Lars 3/8)
    const customerCostNok = costNok * (await chainFactorByTenantId(pt.tenantId))
    const row = {
      tenant_id: pt.tenantId,
      organization_id: pt.organizationId,
      user_id: e.userId ?? pt.ownerId,
      product_id: e.productId,
      draft_id: e.draftId ?? null,
      event_type: e.eventType,
      cost_nok: costNok,
      meta: e.meta ?? {},
    }
    const { error: insErr } = await supabase.from('usage_events').insert({ ...row, customer_cost_nok: customerCostNok })
    if (insErr) await supabase.from('usage_events').insert(row) // kolonnen ikke kjørt ennå → logg uten
  } catch (err) {
    console.warn('[usage] logging feilet (ignoreres):', err)
  }
}
