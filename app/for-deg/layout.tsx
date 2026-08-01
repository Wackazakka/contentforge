import type { Metadata } from 'next'
import { Bricolage_Grotesque } from 'next/font/google'
import { getTenant, getTenantOrigin } from '@/lib/tenantServer'
import './for-deg.css'

const bricolage = Bricolage_Grotesque({
  variable: '--font-bricolage',
  subsets: ['latin', 'latin-ext'],
  weight: ['500', '600', '700'],
})

// URL og merkenavn utledes fra verten (2026-08-01): før sto
// voicebank.norditech.io hardkodet her, så canonical/OG ville pekt på det
// gamle subdomenet i det voicebank.ai gikk live — og delte lenker ville
// tatt folk til feil adresse.
export async function generateMetadata(): Promise<Metadata> {
  const [tenant, origin] = await Promise.all([getTenant(), getTenantOrigin()])
  const brand = tenant.app_name || tenant.name || 'VoiceBank'
  return {
    title: 'For privat og forening',
    description:
      'Lag invitasjoner, kunngjøringer og hilsener som ser proffe ut — uten designerfaring. En 30-sekunders video koster rundt hundre kroner. Ingen abonnement.',
    robots: { index: true, follow: true },
    alternates: { canonical: `${origin}/for-deg` },
    openGraph: {
      type: 'website',
      url: `${origin}/for-deg`,
      title: `${brand} — for privat og forening`,
      description:
        'Lag invitasjoner, kunngjøringer og hilsener som ser proffe ut — uten designerfaring.',
    },
  }
}

export default function ForDegLayout({ children }: { children: React.ReactNode }) {
  return (
    <div lang="no" className={`fd-root ${bricolage.variable}`}>
      {children}
    </div>
  )
}
