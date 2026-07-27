import { createClient } from '@supabase/supabase-js'

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
    await supabase.from('usage_events').insert({
      tenant_id: pt.tenantId,
      organization_id: pt.organizationId,
      user_id: e.userId ?? pt.ownerId,
      product_id: e.productId,
      draft_id: e.draftId ?? null,
      event_type: e.eventType,
      cost_nok: e.costNok,
      meta: e.meta ?? {},
    })
  } catch (err) {
    console.warn('[usage] logging feilet (ignoreres):', err)
  }
}
