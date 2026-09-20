import { getTranslations } from 'next-intl/server'
import { getTenant } from '@/lib/tenantServer'
import MinStemmeClient from './MinStemmeClient'

// Rettighetshaverens egen hovedbok — innsynssiden som manglet.
//
// Står utenfor /dashboard med vilje: dashbordet er kundenes produksjonsflate
// (og oppretter en organisasjon for enhver innlogget bruker). En skuespiller
// som logger inn for å se hva stemmen sin har tjent, er ikke en kunde.
// Tenant-drakten kommer via CSS-vars på <html>.

export async function generateMetadata() {
  const tenant = await getTenant()
  const t = await getTranslations('myLedger')
  return {
    title: t('meta_title', { tenant: tenant.app_name }),
    robots: { index: false, follow: false },
  }
}

export default async function MinStemmePage() {
  const tenant = await getTenant()
  return <MinStemmeClient appName={tenant.app_name} />
}
