'use client'

import { useEffect, useState } from 'react'
import { useTenant } from '@/lib/tenantContext'
import { produktnavn } from '@/lib/tenantNames'
import { AuthShell, AuthSubmit, AuthBanner, emberLink } from '@/components/AuthUI'

// Landingssiden for velkomstlenken (migrasjon 107). Krever et trykk: en
// e-postskanner som forhåndsåpner lenken skal ikke bruke opp tokenet.
// Tokenet leses fra adressen i nettleseren (ikke useSearchParams, som ville
// krevd en Suspense-grense rundt hele siden).

const BESKJED: Record<string, string> = {
  brukt: 'Denne lenken er allerede brukt. Logg inn med passordet du valgte.',
  utlopt: 'Lenken har gått ut. Trykk «Glemt passord» på innloggingssiden, så får du en ny på e-post.',
  ugyldig: 'Lenken er ikke gyldig. Sjekk at du har kopiert hele lenken fra e-posten.',
  feil: 'Noe gikk galt hos oss. Prøv igjen om litt.',
}

export default function VelkommenPage() {
  const tenant = useTenant()
  const produkt = produktnavn(tenant) || 'CenterForge'
  const [token, setToken] = useState('')
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState<string | null>(null)

  useEffect(() => {
    setToken(new URLSearchParams(window.location.search).get('t') || '')
  }, [])

  const fortsett = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!token) { setStatus('ugyldig'); return }
    setLoading(true)
    setStatus(null)
    try {
      const res = await fetch('/api/velkommen', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      })
      const d = await res.json().catch(() => ({ status: 'feil' }))
      if (d.status === 'ok' && d.url) { window.location.href = d.url; return }
      setStatus(d.status || 'feil')
    } catch {
      setStatus('feil')
    }
    setLoading(false)
  }

  return (
    <AuthShell title={`Velkommen til ${produkt}`} subtitle="Kontoen din er klar. Velg et passord, så er du i gang.">
      {status && <AuthBanner variant="error">{BESKJED[status] || BESKJED.feil}</AuthBanner>}
      {status === 'brukt' || status === 'utlopt' ? (
        <p style={{ marginTop: 12 }}>
          <a href="/login" style={emberLink}>Gå til innlogging →</a>
        </p>
      ) : (
        <form onSubmit={fortsett}>
          <AuthSubmit loading={loading} loadingLabel="Gjør klar…">Velg passord og kom i gang</AuthSubmit>
        </form>
      )}
    </AuthShell>
  )
}
