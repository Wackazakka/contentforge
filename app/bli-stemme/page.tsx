import { getTranslations } from 'next-intl/server'
import { getTenant } from '@/lib/tenantServer'
import ApplyForm from './ApplyForm'

// «Bli en stemme i banken» — offentlig drop-in-inngang for skuespillere.
// Vises kun når tenanten har skrudd på accept_actor_applications (opt-in).
// Tenant-drakten kommer automatisk via CSS-vars på <html>.

export async function generateMetadata() {
  const tenant = await getTenant()
  const t = await getTranslations('apply')
  return {
    title: t('meta_title', { tenant: tenant.app_name }),
    robots: { index: false, follow: false }, // deles som lenke, ikke søkeside
  }
}

export default async function BliStemmePage() {
  const tenant = await getTenant()
  const t = await getTranslations('apply')
  const open = tenant.id !== 'root' && tenant.accept_actor_applications === true

  if (!open) {
    return (
      <div className="min-h-screen bg-[var(--paper)] flex items-center justify-center px-6">
        <div className="max-w-md text-center">
          <h1 className="text-2xl font-bold text-[var(--ink,#1C1A16)] mb-3">
            {t('closed_title', { tenant: tenant.app_name })}
          </h1>
          <p className="text-sm text-gray-600">
            {t('closed_body')}
          </p>
        </div>
      </div>
    )
  }

  return <ApplyForm appName={tenant.app_name} />
}
