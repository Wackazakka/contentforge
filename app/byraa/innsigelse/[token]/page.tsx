import type { Metadata } from 'next'
import Innsigelse from './Innsigelse'

// «Ikke vår klient» — sida byrået kommer til fra e-posten (116).
// Viser hvem det gjelder; knappen gjør jobben (POST), så en e-postskanner som
// åpner lenken ikke trekker bekreftelsen ved et uhell.

export const metadata: Metadata = { title: 'Ikke vår klient', robots: { index: false, follow: false } }

export default async function InnsigelseSide({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  return (
    <div style={{ minHeight: '100vh', background: 'var(--paper)', color: 'var(--ink)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ maxWidth: 480, width: '100%' }}>
        <Innsigelse token={decodeURIComponent(token)} />
      </div>
    </div>
  )
}
