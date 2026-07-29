import { getTenant } from '@/lib/tenantServer'
import ApplyForm from './ApplyForm'

// «Bli en stemme i banken» — offentlig drop-in-inngang for skuespillere.
// Vises kun når tenanten har skrudd på accept_actor_applications (opt-in).
// Tenant-drakten kommer automatisk via CSS-vars på <html>.

export async function generateMetadata() {
  const tenant = await getTenant()
  return {
    title: `Bli en stemme hos ${tenant.app_name}`,
    robots: { index: false, follow: false }, // deles som lenke, ikke søkeside
  }
}

export default async function BliStemmePage() {
  const tenant = await getTenant()
  const open = tenant.id !== 'root' && tenant.accept_actor_applications === true

  if (!open) {
    return (
      <div className="min-h-screen bg-[var(--paper)] flex items-center justify-center px-6">
        <div className="max-w-md text-center">
          <h1 className="text-2xl font-bold text-[var(--ink,#1C1A16)] mb-3">
            {tenant.app_name} tar ikke imot åpne søknader nå
          </h1>
          <p className="text-sm text-gray-600">
            Ta gjerne kontakt direkte hvis du vil tilby stemmen din.
          </p>
        </div>
      </div>
    )
  }

  return <ApplyForm appName={tenant.app_name} />
}
