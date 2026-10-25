'use client'

import { useEffect, useState } from 'react'

// Byråets innsigelse (116). Norsk alene: e-posten byrået fikk, er norsk.

export default function Innsigelse({ token }: { token: string }) {
  const [info, setInfo] = useState<{ name: string; agency: string | null } | null>(null)
  const [tilstand, setTilstand] = useState<'laster' | 'klar' | 'ukjent' | 'sender' | 'ferdig'>('laster')
  const [feil, setFeil] = useState<string | null>(null)

  useEffect(() => {
    fetch(`/api/voice-bank/agent-objection?token=${encodeURIComponent(token)}`)
      .then(async (r) => (r.ok ? (setInfo(await r.json()), setTilstand('klar')) : setTilstand('ukjent')))
      .catch(() => setTilstand('ukjent'))
  }, [token])

  const send = async () => {
    setTilstand('sender'); setFeil(null)
    try {
      const r = await fetch('/api/voice-bank/agent-objection', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(j.error || 'Noe gikk galt')
      setTilstand('ferdig')
    } catch (e) {
      setFeil(e instanceof Error ? e.message : 'Noe gikk galt'); setTilstand('klar')
    }
  }

  const h1: React.CSSProperties = { fontSize: 24, fontWeight: 800, letterSpacing: '-0.02em', margin: '0 0 12px' }
  const p: React.CSSProperties = { fontSize: 15, lineHeight: 1.55, color: 'var(--ink-soft)', margin: '0 0 16px' }

  if (tilstand === 'laster') return <p style={p}>Henter …</p>
  if (tilstand === 'ukjent') {
    return (<><h1 style={h1}>Lenken er brukt</h1><p style={p}>Denne lenken er allerede brukt, eller den finnes ikke. Ingenting er endret.</p></>)
  }
  if (tilstand === 'ferdig') {
    return (<><h1 style={h1}>Bekreftelsen er trukket</h1><p style={p}>{info?.name} er ikke lenger bekreftet av {info?.agency || 'byrået'}. Profilen er tatt ned og kan ikke publiseres før identiteten er bekreftet på en annen måte.</p></>)
  }
  return (
    <>
      <h1 style={h1}>Ikke vår klient?</h1>
      <p style={p}>
        <strong>{info?.name}</strong> meldte seg på gjennom påmeldingslenken til {info?.agency || 'byrået'}. Fordi lenken kom fra dere, regnes identiteten som bekreftet av byrået.
      </p>
      <p style={p}>Kjenner dere ikke personen, trekker dere bekreftelsen her. Profilen tas da ned, og den kan ikke publiseres før identiteten er bekreftet på en annen måte.</p>
      <button onClick={send} disabled={tilstand === 'sender'}
        style={{ background: 'var(--ink)', color: 'var(--paper)', border: 0, padding: '12px 20px', fontWeight: 600, fontSize: 15, cursor: 'pointer', opacity: tilstand === 'sender' ? 0.6 : 1 }}>
        {tilstand === 'sender' ? 'Trekker …' : 'Trekk bekreftelsen'}
      </button>
      {feil && <p style={{ ...p, color: '#B42318', marginTop: 12 }}>{feil}</p>}
      <p style={{ ...p, fontSize: 13, marginTop: 20 }}>Er dette deres klient, trenger dere ikke gjøre noe.</p>
    </>
  )
}
