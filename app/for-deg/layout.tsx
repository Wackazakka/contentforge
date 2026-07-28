import type { Metadata } from 'next'
import { Bricolage_Grotesque } from 'next/font/google'
import './for-deg.css'

const bricolage = Bricolage_Grotesque({
  variable: '--font-bricolage',
  subsets: ['latin', 'latin-ext'],
  weight: ['500', '600', '700'],
})

export const metadata: Metadata = {
  title: 'For privat og forening',
  description:
    'Lag invitasjoner, kunngjøringer og hilsener som ser proffe ut — uten designerfaring. En 30-sekunders video koster rundt hundre kroner. Ingen abonnement.',
  robots: { index: true, follow: true },
  openGraph: {
    type: 'website',
    url: 'https://voicebank.norditech.io/for-deg',
    title: 'VoiceBank — for privat og forening',
    description:
      'Lag invitasjoner, kunngjøringer og hilsener som ser proffe ut — uten designerfaring.',
  },
}

export default function ForDegLayout({ children }: { children: React.ReactNode }) {
  return (
    <div lang="no" className={`fd-root ${bricolage.variable}`}>
      {children}
    </div>
  )
}
