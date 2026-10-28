import type { Metadata } from 'next'
import Innsyn from './Innsyn'

// Byråets innsynsside (128) — der byrået bestemmer hva klientene ser av bruken
// av tvillingen sin, per lisens. Nøkkelen i adressen er tilgangen.

export const metadata: Metadata = { title: 'Hva klientene ser', robots: { index: false, follow: false } }

export default async function InnsynSide({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  return (
    <div style={{ minHeight: '100vh', background: 'var(--paper)', color: 'var(--ink)', padding: '40px 16px' }}>
      <div style={{ maxWidth: 760, margin: '0 auto' }}>
        <Innsyn token={decodeURIComponent(token)} />
      </div>
    </div>
  )
}
