'use client'

import { useParams } from 'next/navigation'
import LeveringPanel from '@/components/LeveringPanel'

// Leveringssiden for en SOEKNAD (099) — tokenlenke, ingen konto. Staar for de
// radene som kom inn foer paameldingen (101); nye deltakere leverer innlogget
// paa /min-stemme med samme panel.

export default function LeveringPage() {
  const token = String(useParams().token || '')
  return (
    <main style={{ maxWidth: 640, margin: '0 auto', padding: 'clamp(24px, 5vw, 56px) 20px 80px', color: 'var(--ink)', fontFamily: 'var(--font-hanken), system-ui, sans-serif' }}>
      <h1 style={{ fontFamily: 'var(--font-archivo), system-ui, sans-serif', fontWeight: 700, fontSize: 26, letterSpacing: '-0.02em', margin: '0 0 6px' }}>
        Her leverer du
      </h1>
      <p style={{ fontSize: 15, lineHeight: 1.55, color: 'var(--ink-soft)', margin: '0 0 26px' }}>
        Du kan komme tilbake til denne siden så mange ganger du vil. Det du har lastet opp, ligger her.
      </p>
      <LeveringPanel auth={{ token }} />
    </main>
  )
}
