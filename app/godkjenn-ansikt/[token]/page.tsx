'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'

// Rettighetshaverens godkjenning av sin egen ansiktsmodell (migrasjon 091).
//
// 🔑 HEN HAR INGEN KONTO HOS OSS, og skal ikke trenge en for å svare på om
// ansiktet sitt kan brukes. Lenken i e-posten er autentiseringen.
//
// 🔑 PRØVEBILDENE LAGES HER, ETT OM GANGEN. Man kan ikke vise noen en
// LoRA-fil — bare hva den lager. Hvert bilde tar noen sekunder, så de dukker
// opp underveis i stedet for at hen venter på en tom side.
//
// Sida sier ingenting om kunder eller priser. Hen svarer på ett spørsmål:
// ser dette ut som meg, og kan det brukes.

const SANS = 'var(--font-hanken), system-ui, sans-serif'
const DISPLAY = 'var(--font-archivo), system-ui, sans-serif'
const ANTALL_PROVER = 3

export default function GodkjennAnsiktPage() {
  const token = String(useParams().token || '')
  const [navn, setNavn] = useState<string | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [ferdigTrent, setFerdigTrent] = useState(false)
  const [bilder, setBilder] = useState<string[]>([])
  const [tikk, setTikk] = useState(0)
  const [lager, setLager] = useState(false)
  const [svarer, setSvarer] = useState(false)
  const [feil, setFeil] = useState<string | null>(null)

  const hent = useCallback(async () => {
    try {
      const d = await fetch(`/api/characters/approval?token=${encodeURIComponent(token)}`).then((r) => r.json())
      if (d.error) { setFeil(d.error); return }
      setNavn(d.name); setStatus(d.status); setFerdigTrent(!!d.trainingDone)
      setBilder(d.samples || [])
    } catch { setFeil('Kunne ikke hente modellen') }
  }, [token])

  useEffect(() => { hent() }, [hent])

  // Lag prøvebildene ett for ett til vi har nok.
  useEffect(() => {
    if (status !== 'pending' || !ferdigTrent || lager || bilder.length >= ANTALL_PROVER) return
    let avbrutt = false
    ;(async () => {
      setLager(true)
      try {
        const d = await fetch('/api/characters/approval', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token, action: 'sample' }),
        }).then((r) => r.json())
        if (!avbrutt && Array.isArray(d.samples)) setBilder(d.samples)
        if (!avbrutt && d.error) setFeil(d.error)
        // Jobben ligger hos fal; spoer igjen om tre sekunder. Effekten
        // re-trigges via `tikk`, saa hvert kall er kort og ingen ny jobb sendes.
        if (!avbrutt && d.pending) { setFeil(null); setTimeout(() => { if (!avbrutt) setTikk((n) => n + 1) }, 3000) }
      } catch {
        if (!avbrutt) setFeil('Prøvebildet kunne ikke lages. Last siden på nytt.')
      } finally {
        if (!avbrutt) setLager(false)
      }
    })()
    return () => { avbrutt = true }
  }, [status, ferdigTrent, lager, bilder.length, token, tikk])

  const svar = async (decision: 'approved' | 'rejected') => {
    setSvarer(true); setFeil(null)
    try {
      const d = await fetch('/api/characters/approval', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, action: 'decide', decision }),
      }).then((r) => r.json())
      if (d.error) setFeil(d.error)
      else setStatus(d.status)
    } catch { setFeil('Svaret kom ikke fram. Prøv igjen.') } finally { setSvarer(false) }
  }

  const ramme = { maxWidth: 720, margin: '0 auto', padding: 'clamp(28px, 5vw, 56px) 20px' }

  if (feil && !navn) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--paper)', color: 'var(--ink)', fontFamily: SANS }}>
        <div style={ramme}><p>{feil}</p></div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--paper)', color: 'var(--ink)', fontFamily: SANS }}>
      <div style={ramme}>
        <h1 style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 'clamp(26px, 4vw, 40px)', letterSpacing: '-0.03em', lineHeight: 1.1, margin: '0 0 14px' }}>
          Er dette deg?
        </h1>

        {status === 'approved' ? (
          <>
            <p style={{ fontSize: 17, lineHeight: 1.6 }}>
              Takk — modellen er godkjent og kan nå brukes under de avtalene som klareres for den.
              Du kan når som helst be om at den stenges.
            </p>
            {/* Veien videre (Lars 22.09): sida var en blindvei etter svaret. Hun kom
                hit fra en e-post uten konto — «siden din» krever innlogging, og
                /login sender henne dit hvis hun har en. Forsiden er alltid aapen. */}
            <p style={{ marginTop: 22, display: 'flex', gap: 18, flexWrap: 'wrap', alignItems: 'center' }}>
              <Link href="/min-stemme" style={{ display: 'inline-block', background: 'var(--ink)', color: 'var(--paper)', padding: '12px 20px', fontWeight: 600, textDecoration: 'none' }}>Gå til siden din →</Link>
              <Link href="/" style={{ color: 'var(--ink-soft)', textDecoration: 'underline', textUnderlineOffset: 3 }}>Til forsiden</Link>
            </p>
          </>
        ) : status === 'rejected' ? (
          <>
            <p style={{ fontSize: 17, lineHeight: 1.6 }}>
              Modellen er avvist og kan ikke brukes. Den er stengt fra nå.
            </p>
            <p style={{ marginTop: 22 }}>
              <Link href="/" style={{ color: 'var(--ink-soft)', textDecoration: 'underline', textUnderlineOffset: 3 }}>Til forsiden</Link>
            </p>
          </>
        ) : (
          <>
            <p style={{ fontSize: 17, lineHeight: 1.6, color: 'var(--ink-soft)', margin: '0 0 8px' }}>
              Vi har laget en ansiktsmodell{navn ? ` («${navn}»)` : ''} fra bildene dine.
              Under ser du hva den lager — tre bilder i ulike situasjoner, generert nå.
            </p>
            <p style={{ fontSize: 15, lineHeight: 1.6, color: 'var(--text-muted)', margin: '0 0 28px' }}>
              Sier du ja, kan ansiktet brukes i produksjoner vi klarerer, og hver eneste bruk
              føres opp med hva som skal betales til deg. Sier du nei, stenges modellen.
              Du kan ombestemme deg senere uansett hva du svarer nå.
            </p>

            {!ferdigTrent ? (
              <p style={{ fontSize: 15, color: 'var(--text-muted)' }}>Modellen trenes fortsatt. Prøv igjen om noen minutter.</p>
            ) : (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 28 }}>
                  {bilder.map((url) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img key={url} src={url} alt="" style={{ width: '100%', aspectRatio: '1/1', objectFit: 'cover', display: 'block', border: '1px solid var(--ds-border-strong)' }} />
                  ))}
                  {bilder.length < ANTALL_PROVER && (
                    <div style={{ aspectRatio: '1/1', border: '1px dashed var(--ds-border-strong)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13.5, color: 'var(--text-faint)', textAlign: 'center', padding: 12 }}>
                      Lager prøvebilde {bilder.length + 1} av {ANTALL_PROVER}…
                    </div>
                  )}
                </div>

                {feil && <p style={{ fontSize: 14, color: 'var(--ember-deep)' }}>{feil}</p>}

                {/* Knappene kommer først når hen faktisk har sett noe. Et «ja»
                    avgitt før bildene finnes, er ikke et informert ja. */}
                {bilder.length >= ANTALL_PROVER && (
                  <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                    <button onClick={() => svar('approved')} disabled={svarer}
                      style={{ padding: '14px 28px', fontFamily: DISPLAY, fontWeight: 700, fontSize: 16, background: 'var(--ember-deep)', color: 'var(--on-ember)', border: 'none', cursor: 'pointer' }}>
                      Ja, dette er meg — modellen kan brukes
                    </button>
                    <button onClick={() => svar('rejected')} disabled={svarer}
                      style={{ padding: '14px 28px', fontFamily: DISPLAY, fontWeight: 700, fontSize: 16, background: 'transparent', color: 'var(--ink)', border: '1.5px solid var(--ink)', cursor: 'pointer' }}>
                      Nei — steng modellen
                    </button>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}
