import { createClient } from '@supabase/supabase-js'
import { getTenant } from '@/lib/tenantServer'
import type { Metadata } from 'next'

// Offentlig presentasjonsside for en skuespiller — visittkort til innsalg:
// bilder, lydprøver og bio, i eierens (byråets) egen drakt. Vises kun hvis
// skuespilleren er publisert (is_public) OG tilgjengelig på dette domenet
// (eier i tenant-kjeden, eller delt med hele plattformen).

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
  )
}

async function getActorForCurrentTenant(actorId: string) {
  const tenant = await getTenant()
  const supabase = admin()
  const { data: actor } = await supabase
    .from('voice_actors')
    .select('id, owner_tenant_id, name, bio, photo_urls, sample_urls, preview_url, is_public, is_active, is_exclusive')
    .eq('id', actorId)
    .single()
  if (!actor || !actor.is_public || !actor.is_active) return null

  // Tilgjengelig her? Eier i kjeden oppover fra gjeldende tenant, eller delt.
  if (tenant.id !== 'root') {
    const chain: string[] = []
    let cur: string | null = tenant.id
    for (let i = 0; i < 5 && cur; i++) {
      chain.push(cur)
      const res: { data: { parent_tenant_id: string | null } | null } = await supabase
        .from('tenants').select('parent_tenant_id').eq('id', cur).single()
      cur = res.data?.parent_tenant_id ?? null
    }
    if (!chain.includes(actor.owner_tenant_id) && actor.is_exclusive !== false) return null
  }
  return { actor, tenantName: tenant.app_name }
}

export async function generateMetadata({ params }: { params: Promise<{ actorId: string }> }): Promise<Metadata> {
  const { actorId } = await params
  const res = await getActorForCurrentTenant(actorId)
  if (!res) return { title: 'Ikke funnet' }
  return {
    title: `${res.actor.name} — stemmeskuespiller`,
    description: res.actor.bio?.slice(0, 150) || `Hør stemmeprøver fra ${res.actor.name}.`,
  }
}

export default async function ActorPresentationPage({ params }: { params: Promise<{ actorId: string }> }) {
  const { actorId } = await params
  const res = await getActorForCurrentTenant(actorId)

  if (!res) {
    return (
      <div className="min-h-screen bg-[var(--paper)] flex items-center justify-center px-4">
        <p className="text-gray-500">Denne siden finnes ikke.</p>
      </div>
    )
  }

  const { actor, tenantName } = res
  const photos: string[] = Array.isArray(actor.photo_urls) ? actor.photo_urls : []
  const samples: string[] = Array.isArray(actor.sample_urls) && actor.sample_urls.length > 0
    ? actor.sample_urls
    : (actor.preview_url ? [actor.preview_url] : [])

  return (
    <div className="min-h-screen bg-[var(--paper)]">
      <div className="max-w-2xl mx-auto px-4 py-12">
        {/* Hovedbilde + navn */}
        <div className="text-center mb-10">
          {photos[0] && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photos[0]} alt={actor.name}
              className="w-40 h-40 rounded-full object-cover mx-auto mb-6 border-4 border-white shadow-lg" />
          )}
          <h1 className="text-4xl font-bold text-[var(--ink,#1C1A16)] mb-2">{actor.name}</h1>
          <p className="text-sm uppercase tracking-widest text-gray-500">Stemmeskuespiller · {tenantName}</p>
        </div>

        {/* Bio */}
        {actor.bio && (
          <p className="text-lg leading-relaxed text-gray-700 mb-10 whitespace-pre-line">{actor.bio}</p>
        )}

        {/* Lydprøver */}
        {samples.length > 0 && (
          <div className="mb-10">
            <h2 className="font-semibold text-gray-900 mb-3">🎧 Hør stemmen</h2>
            <div className="space-y-3">
              {samples.map((url, i) => (
                <div key={url} className="bg-white rounded-xl border border-gray-200 p-4">
                  <div className="text-xs text-gray-400 mb-2">Prøve {i + 1}</div>
                  <audio controls preload="none" src={url} className="w-full" />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Flere bilder */}
        {photos.length > 1 && (
          <div className="mb-10">
            <h2 className="font-semibold text-gray-900 mb-3">📷 Bilder</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {photos.slice(1).map((url) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={url} src={url} alt={actor.name} className="w-full aspect-square object-cover rounded-xl border border-gray-200" />
              ))}
            </div>
          </div>
        )}

        <div className="text-center text-sm text-gray-400 border-t border-gray-200 pt-6">
          Stemmen leveres gjennom {tenantName} — kontakt oss for bruk i din produksjon.
        </div>
      </div>
    </div>
  )
}
