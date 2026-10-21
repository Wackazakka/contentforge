'use client'

import { useEffect, useState, type CSSProperties } from 'react'
import { getSupabase } from '@/lib/supabaseClient'
import { useTenant } from '@/lib/tenantContext'
import { fulltNavn } from '@/lib/tenantNames'
import { AuthShell, AuthSubmit, AuthBanner, emberLink } from '@/components/AuthUI'
import { SUPPORT_KATEGORIER, SUPPORT_MOTTAKER } from '@/lib/support'

// Supportsiden (migrasjon 109, Lars 21.10.2026): brukerne sender spørsmål
// til Lars. Åpen også uten innlogging — den som ikke kommer inn, trenger den.

const HANKEN = 'var(--font-hanken), sans-serif'
const tekstStil: CSSProperties = { fontFamily: HANKEN, fontSize: 14.5, color: 'var(--ink)', lineHeight: 1.5 }
const etikett: CSSProperties = { ...tekstStil, fontWeight: 600, margin: '0 0 6px' }

const PLASSHOLDER: Record<string, string> = {
  'Spørsmål': 'Hva lurer du på?',
  'Noe virker ikke': 'Hva prøvde du å gjøre, og hva skjedde? Hvilken artist eller video gjelder det?',
  'Forslag': 'Hva kunne gjort tjenesten bedre for deg?',
}

export default function HjelpPage() {
  const tenant = useTenant()
  const navn = fulltNavn(tenant) || 'oss'
  const [innloggetEpost, setInnloggetEpost] = useState<string | null | undefined>(undefined)
  const [kategori, setKategori] = useState<string>('')
  const [melding, setMelding] = useState('')
  const [email, setEmail] = useState('')
  const [felle, setFelle] = useState('')
  const [sender, setSender] = useState(false)
  const [feil, setFeil] = useState<string | null>(null)
  const [sendtTil, setSendtTil] = useState<string | null>(null)
  const [side, setSide] = useState('')

  useEffect(() => {
    ;(async () => {
      const s = (await getSupabase().auth.getSession()).data?.session
      setInnloggetEpost(s?.user?.email || null)
    })()
    // Hvor kom brukeren fra? ?fra= fra lenker, ellers forrige side på samme domene
    const fra = new URLSearchParams(window.location.search).get('fra')
    let ref = ''
    try { const r = new URL(document.referrer); if (r.origin === window.location.origin) ref = r.pathname } catch { /* ingen */ }
    setSide(fra || ref)
  }, [])

  const send = async (e: React.FormEvent) => {
    e.preventDefault()
    setFeil(null)
    if (!kategori) { setFeil('Velg hva det gjelder.'); return }
    if (melding.trim().length < 5) { setFeil('Skriv litt mer om hva det gjelder.'); return }
    if (!innloggetEpost && !email.trim()) { setFeil('Skriv inn e-postadressen din, så vi kan svare deg.'); return }
    setSender(true)
    try {
      const token = (await getSupabase().auth.getSession()).data?.session?.access_token
      const res = await fetch('/api/support', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ kategori, melding, email, side, nettsted: felle }),
      })
      const d = await res.json().catch(() => null)
      if (!res.ok) { setFeil(d?.error || `Noe gikk galt. Send gjerne e-post til ${SUPPORT_MOTTAKER}.`); return }
      setSendtTil(d?.email || innloggetEpost || email)
      setMelding('')
      setKategori('')
    } catch {
      setFeil(`Noe gikk galt. Send gjerne e-post til ${SUPPORT_MOTTAKER}.`)
    } finally {
      setSender(false)
    }
  }

  if (innloggetEpost === undefined) {
    return (
      <div className="flex items-center justify-center py-24" style={{ minHeight: '100vh', background: 'var(--paper)' }}>
        <div className="cf-spinner" />
      </div>
    )
  }

  if (sendtTil) {
    return (
      <AuthShell title="Takk!" subtitle={`Vi har fått meldingen din og svarer på e-post til ${sendtTil}.`}>
        <p style={tekstStil}>
          <button type="button" onClick={() => setSendtTil(null)} style={emberLink}>Send en ny melding</button>
          {innloggetEpost ? <> · <a href="/dashboard" style={emberLink}>Tilbake til {navn}</a></> : <> · <a href="/login" style={emberLink}>Til innlogging</a></>}
        </p>
      </AuthShell>
    )
  }

  return (
    <AuthShell title="Hjelp" subtitle="Lurer du på noe, eller virker ikke noe som det skal? Skriv til oss, så svarer vi på e-post." maxWidth={560}>
      {feil && <AuthBanner variant="error">{feil}</AuthBanner>}
      <form onSubmit={send}>
        <p style={etikett}>Hva gjelder det?</p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 18 }}>
          {SUPPORT_KATEGORIER.map((k) => {
            const valgt = kategori === k
            return (
              <button
                key={k}
                type="button"
                aria-pressed={valgt}
                onClick={() => setKategori(k)}
                style={{
                  ...tekstStil, padding: '8px 14px', borderRadius: 999, cursor: 'pointer',
                  border: `1px solid ${valgt ? 'var(--ember-deep)' : 'var(--ds-border, rgba(127,127,127,0.35))'}`,
                  background: valgt ? 'var(--ember-deep)' : 'transparent',
                  color: valgt ? 'var(--on-ember, #fff)' : 'var(--ink)',
                }}
              >
                {k}
              </button>
            )
          })}
        </div>

        <label style={{ display: 'block', marginBottom: 18 }}>
          <p style={etikett}>Melding</p>
          <textarea
            className="cf-input"
            rows={6}
            style={{ resize: 'vertical' }}
            placeholder={PLASSHOLDER[kategori] || 'Skriv meldingen din her.'}
            value={melding}
            onChange={(e) => setMelding(e.target.value)}
          />
        </label>

        {innloggetEpost ? (
          <p style={{ ...tekstStil, fontSize: 13.5, color: 'var(--text-muted)', margin: '0 0 18px' }}>Vi svarer til {innloggetEpost}.</p>
        ) : (
          <label style={{ display: 'block', marginBottom: 18 }}>
            <p style={etikett}>E-postadressen din</p>
            <input className="cf-input" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="navn@eksempel.no" />
          </label>
        )}

        {/* Felle for roboter: usynlig for mennesker */}
        <input
          type="text" name="nettsted" tabIndex={-1} autoComplete="off" aria-hidden="true"
          value={felle} onChange={(e) => setFelle(e.target.value)}
          style={{ position: 'absolute', left: '-10000px', width: 1, height: 1, opacity: 0 }}
        />

        <AuthSubmit loading={sender} loadingLabel="Sender…">Send</AuthSubmit>
      </form>
    </AuthShell>
  )
}
