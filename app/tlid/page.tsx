import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { getTenant, getTenantCanonicalOrigin } from '@/lib/tenantServer'
import { normaliserTlid } from '@/lib/tlid'
import Oppslag from './Oppslag'

// /tlid — søkefeltet. ?q=<hva som helst> sendes videre til den kanoniske
// adressen /tlid/TL-XXXX-XXXX, så en delt lenke alltid ser lik ut.

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('tlidLookup')
  const tenant = await getTenant()
  return {
    title: t('meta_title'),
    description: t('lead'),
    alternates: { canonical: `${await getTenantCanonicalOrigin(tenant)}/tlid` },
  }
}

export default async function TlidSoek({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams
  const tenant = await getTenant()
  const raa = (q || '').trim()
  if (raa) {
    const tlid = normaliserTlid(raa)
    if (tlid) redirect(`/tlid/${tlid}`)
    return <Oppslag tenant={tenant} svar={{ kind: 'ugyldig', q: raa.slice(0, 40) }} />
  }
  return <Oppslag tenant={tenant} svar={{ kind: 'tom' }} />
}
