'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { normaliserTlid } from '@/lib/tlid'

// Søkefeltet i det åpne oppslaget.
//
// ⚠️ NORMALISERER I NETTLESEREN OG GÅR RETT TIL DEN KANONISKE ADRESSEN. Det
// vanlige GET-skjemaet gikk via /tlid?q=… og en serveromdirigering — og
// Netlify hektet den opprinnelige søkestrengen på igjen, så adressen ble
// /tlid/TL-…?q=… (Lars 23.10). Lokalt ble den ren; det er Netlify, ikke Next.
// Skjemaet virker fortsatt uten JavaScript (action + method), og resultatsida
// rydder adressen i det tilfellet (RensAdresse).

const MONO = 'var(--font-cfmono), ui-monospace, monospace'
const SANS = 'var(--font-hanken), system-ui, sans-serif'

export default function SoekeSkjema({ forhaand, label, knapp }: { forhaand: string; label: string; knapp: string }) {
  const router = useRouter()
  const [verdi, setVerdi] = useState(forhaand)

  return (
    <form action="/tlid" method="get" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 32 }}
      onSubmit={(e) => {
        const tlid = normaliserTlid(verdi)
        // Ugyldig: la serveren vise feilmeldingen på /tlid?q=… — der er
        // søkestrengen nettopp det som forklarer meldingen.
        if (!tlid) return
        e.preventDefault()
        router.push(`/tlid/${tlid}`)
      }}>
      <label htmlFor="tlid-q" style={{ position: 'absolute', left: -9999 }}>{label}</label>
      <input id="tlid-q" name="q" value={verdi} onChange={(e) => setVerdi(e.target.value)} placeholder="TL-XXXX-XXXX" autoComplete="off" spellCheck={false}
        style={{ flex: '1 1 220px', minWidth: 0, fontFamily: MONO, fontSize: 17, letterSpacing: '0.06em', textTransform: 'uppercase', padding: '12px 14px', border: '1px solid var(--ds-border-strong)', background: 'var(--paper-raised)', color: 'var(--ink)' }} />
      <button type="submit" style={{ background: 'var(--ink)', color: 'var(--paper)', border: 'none', padding: '12px 22px', fontSize: 15, fontWeight: 600, cursor: 'pointer', fontFamily: SANS }}>{knapp}</button>
    </form>
  )
}
