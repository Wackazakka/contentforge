import { createClient } from '@supabase/supabase-js'

// Eier brukeren det hen peker på? (sikkerhetsgjennomgangen 25.10.2026)
//
// Produkter hører til en organisasjon; brukeren må eie den eller være medlem.
// Utkast hører til et produkt. Ruter som starter betalt arbeid eller skriver
// på et produkt/utkast, sjekker her — før de gjør noe.

function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || '', process.env.SUPABASE_SERVICE_ROLE_KEY || '')
}

const UUID = /^[0-9a-f-]{36}$/i

export async function eierOrganisasjon(userId: string, orgId: string): Promise<boolean> {
  if (!UUID.test(orgId)) return false
  const db = admin()
  const { data: o } = await db.from('organizations').select('id').eq('id', orgId).eq('owner_id', userId).maybeSingle()
  if (o) return true
  const { data: m } = await db.from('organization_members').select('organization_id').eq('organization_id', orgId).eq('user_id', userId).maybeSingle()
  return !!m
}

export async function eierProdukt(userId: string, productId: string): Promise<boolean> {
  if (!UUID.test(productId)) return false
  const { data: p } = await admin().from('products').select('organization_id').eq('id', productId).maybeSingle()
  const orgId = (p as { organization_id?: string | null } | null)?.organization_id
  return !!orgId && eierOrganisasjon(userId, orgId)
}

export async function eierUtkast(userId: string, draftId: string): Promise<boolean> {
  if (!UUID.test(draftId)) return false
  const { data: d } = await admin().from('production_drafts').select('product_id').eq('id', draftId).maybeSingle()
  const productId = (d as { product_id?: string | null } | null)?.product_id
  return !!productId && eierProdukt(userId, productId)
}
