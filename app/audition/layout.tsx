import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'

// Auditionsiden er en klientkomponent og kan derfor ikke eksportere metadata
// selv. Uten dette laget arvet fanen tenantens meta_title — som på TwinLedger
// fortsatt sa «VoiceBank», fra før navnebyttet 20.09.2026. En delt auditionlenke
// er noe av det første en produsent ser; den skal ikke bære feil produktnavn.
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('audition')
  return {
    title: t('meta_title'),
    description: t('meta_description'),
    // Auditions koster penger og krever innlogging. Sida er sperret i
    // robots.txt, men det hindrer bare CRAWLING — en sperret side kan fortsatt
    // havne i indeksen som naken URL hvis noen lenker til den, og da leses
    // aldri en noindex vi ikke har satt. Beltet i tillegg til selene, og et
    // vern mot dagen noen fjerner Disallow-linja.
    robots: { index: false, follow: false },
  }
}

export default function AuditionLayout({ children }: { children: React.ReactNode }) {
  return children
}
