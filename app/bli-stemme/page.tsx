import { getTranslations } from 'next-intl/server'
import { getTenant, getTenantCanonicalOrigin } from '@/lib/tenantServer'
import ApplyForm from './ApplyForm'

// «Bli en stemme i banken» — offentlig drop-in-inngang for skuespillere.
// Vises kun når tenanten har skrudd på accept_actor_applications (opt-in).
// Tenant-drakten kommer automatisk via CSS-vars på <html>.

export async function generateMetadata() {
  const tenant = await getTenant()
  const t = await getTranslations('apply')
  // ÅPNET FOR INDEKSERING 21.09.2026 (Lars). Sto som «deles som lenke, ikke
  // søkeside» — men rekruttering er nettopp det denne sida er til for, og en
  // skuespiller som googler «leie ut stemmen min» skal kunne finne den.
  //
  // 🔑 MEN BARE NÅR DØRA FAKTISK ER ÅPEN. Er accept_actor_applications av,
  // viser sida «vi tar ikke imot søknader nå» — og et søkeresultat som fører
  // til et avslag er verre enn ingen treff. Da skal den ikke indekseres.
  const aapen = tenant.id !== 'root' && tenant.accept_actor_applications === true
  const kanIndekseres = aapen && tenant.allow_indexing === true
  return {
    title: t('meta_title', { tenant: tenant.app_name }),
    description: t('meta_description', { tenant: tenant.app_name }),
    ...(kanIndekseres
      ? { alternates: { canonical: `${await getTenantCanonicalOrigin(tenant)}/bli-stemme` } }
      : {}),
    robots: kanIndekseres ? { index: true, follow: true } : { index: false, follow: false },
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
