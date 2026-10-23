import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { getTenant, getTenantCanonicalOrigin } from '@/lib/tenantServer'
import { getPublicActorByTlid, versjonSiden } from '@/lib/publicActors'
import { normaliserTlid } from '@/lib/tlid'
import Oppslag from '../Oppslag'

// /tlid/TL-XXXX-XXXX — svaret på oppslaget. Enhver skrivemåte («tl 7k4m
// q2xd», «tl7k4mq2xd») sendes til den kanoniske adressen.
//
// Ikke i søkeindeksen: visittkortet (/stemme/<id>) er siden som skal finnes
// i søk. Dette er et oppslag, og et tynt duplikat av kortet i et søkeresultat
// hjelper ingen.

export async function generateMetadata({ params }: { params: Promise<{ tlid: string }> }): Promise<Metadata> {
  const { tlid } = await params
  const t = await getTranslations('tlidLookup')
  return { title: `${normaliserTlid(decodeURIComponent(tlid)) ?? t('meta_title')} — ${t('meta_title')}`, robots: { index: false, follow: true } }
}

export default async function TlidSvar({ params }: { params: Promise<{ tlid: string }> }) {
  const { tlid: raa } = await params
  const tenant = await getTenant()
  const dekodet = decodeURIComponent(raa)
  const tlid = normaliserTlid(dekodet)
  if (!tlid) return <Oppslag tenant={tenant} svar={{ kind: 'ugyldig', q: dekodet.slice(0, 40) }} />
  if (tlid !== dekodet) redirect(`/tlid/${tlid}`)

  const actor = tenant.twinledger_enabled === false ? null : await getPublicActorByTlid(tenant, tlid)
  if (!actor) return <Oppslag tenant={tenant} svar={{ kind: 'ikke_funnet', tlid }} />
  const origin = await getTenantCanonicalOrigin(tenant)
  return (
    <Oppslag tenant={tenant} svar={{
      kind: 'funnet', tlid, actor,
      siden: await versjonSiden(actor.id, actor.twinVersion),
      apiUrl: `${origin}/api/tlid/${tlid}`,
    }} />
  )
}
