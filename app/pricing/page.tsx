import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { mergeRateCard } from '@/lib/rateCard'
import { getTenant, getTenantCanonicalOrigin } from '@/lib/tenantServer'
import KredittPriser from './KredittPriser'
import LisensPriser from './LisensPriser'

// /pricing tjener to helt ulike produkter.
//
// 🔑 PÅ TWINLEDGER KJØPES DET IKKE KREDITTER, MEN LISENSER. Sida viste
// CenterForges kredittpakker — på engelsk, med emoji — til en produsent som
// kom for å vite hva bruksrett til en stemme koster. Det var ikke bare feil
// drakt; det var feil vare.
//
// Tenant-skillet står her og ikke inne i komponentene, slik at hver av dem
// bare kjenner sitt eget produkt.

export async function generateMetadata(): Promise<Metadata> {
  const tenant = await getTenant()
  if (tenant.twinledger_enabled === false || tenant.slug !== 'twinledger') return {}
  const t = await getTranslations('licencePricing')
  const kort = mergeRateCard(tenant.rate_card ?? null)
  const origin = await getTenantCanonicalOrigin(tenant)
  return {
    title: t('meta_title'),
    description: t('meta_description', { pct: kort.rightsHolderPct }),
    alternates: { canonical: `${origin}/pricing` },
  }
}

export default async function PricingPage() {
  const tenant = await getTenant()
  return tenant.slug === 'twinledger' ? <LisensPriser /> : <KredittPriser />
}
