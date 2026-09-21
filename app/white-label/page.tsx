'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useTenant } from '@/lib/tenantContext'
import { produktnavn } from '@/lib/tenantNames'

// Åpen white-label-søknad. To produkter kan lisensieres — innholdsproduksjon
// og stemme-/rettighetsforvaltning — og interessefeltet skiller dem, saa
// oppfoelgingen kan starte i riktig samtale. Interne produktnavn
// (CenterForge/TwinLedger) nevnes bevisst IKKE: dette er partnerens fremtidige
// white-label, ikke vaar katalog. Skjemaet virker paa alle tenant-domener —
// soeknaden merkes med merkevaren den kom via (en soeknad hos en partner er
// partnerens lead). Interessevalget prependes i message-feltet, saa API og DB
// er uendret.

// 🔑 REKKEFØLGEN ER IKKE VILKÅRLIG (Claude Design 5E). Rettighetsforvaltning
// står FØRST: det er det en besøkende fra TwinLedger kommer for. Sto
// innholdsproduksjon øverst, leste sida som om det var hovedsaken.
const INTERESSER = [
  { id: 'rettigheter' as const, label: 'Stemme- og rettighetsforvaltning', hint: 'Forvalte stemmer og ansikter med hovedbok og oppgjør' },
  { id: 'produksjon' as const, label: 'Innholdsproduksjon', hint: 'Video, artikler og publisering under eget merke' },
  { id: 'begge' as const, label: 'Begge deler', hint: 'Hele plattformen' },
]

export default function WhiteLabelPage() {
  const tenant = useTenant()
  const [company, setCompany] = useState('')
  const [contactName, setContactName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [message, setMessage] = useState('')
  const [interest, setInterest] = useState<'produksjon' | 'rettigheter' | 'begge'>('begge')
  const [website, setWebsite] = useState('') // honeypot
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      const res = await fetch('/api/whitelabel-apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ company, contactName, email, phone, message: `[Interesse: ${INTERESSER.find((i) => i.id === interest)?.label}] ${message}`, website }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Noe gikk galt')
      setSent(true)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen bg-[var(--paper)]">
      <div className="max-w-xl mx-auto px-4 py-12">
        <Link href="/" className="text-[var(--ember-deep)] hover:text-[var(--ink)] mb-6 inline-block">← {produktnavn(tenant)}</Link>
        <h1 className="text-3xl font-bold text-gray-900 mb-3">Bli white-label-partner</h1>
        <p className="text-gray-600 mb-8">
          Plattformen har to deler som kan tilbys under deres eget navn, med egne farger og eget
          domene: <strong className="text-gray-800">innholdsproduksjon</strong> — video, artikler og
          publisering for deres kunder — og <strong className="text-gray-800">stemme- og
          rettighetsforvaltning</strong>, der hver bruk av en stemme eller et ansikt føres og gjøres
          opp mot rettighetshaveren. Dere velger den ene eller begge, og setter deres egne priser.
          Fortell oss kort hvem dere er, så tar vi kontakt.
        </p>

        {sent ? (
          <div style={{ padding: 22, background: 'var(--paper-sunken)', border: '1px solid var(--ds-border-strong)', color: 'var(--ink)' }}>
            <p className="font-semibold mb-1">Takk for søknaden!</p>
            <p className="text-sm">Vi tar kontakt på e-posten dere oppga, vanligvis innen en virkedag.</p>
          </div>
        ) : (
          <form onSubmit={submit} style={{ background: 'var(--paper-raised)', border: '1px solid var(--ds-border-strong)', padding: 26 }}>
            <label className="block text-sm font-medium text-gray-700 mb-1">Firma</label>
            <input value={company} onChange={(e) => setCompany(e.target.value)} required
              style={{ width: '100%', padding: '13px 14px', fontSize: 15, border: '1px solid var(--ds-border-strong)', background: 'var(--paper)', color: 'var(--ink)', marginBottom: 16, fontFamily: 'inherit' }} />

            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Kontaktperson</label>
                <input value={contactName} onChange={(e) => setContactName(e.target.value)} required
                  style={{ width: '100%', padding: '13px 14px', fontSize: 15, border: '1px solid var(--ds-border-strong)', background: 'var(--paper)', color: 'var(--ink)', marginBottom: 16, fontFamily: 'inherit' }} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Telefon (valgfritt)</label>
                <input value={phone} onChange={(e) => setPhone(e.target.value)}
                  style={{ width: '100%', padding: '13px 14px', fontSize: 15, border: '1px solid var(--ds-border-strong)', background: 'var(--paper)', color: 'var(--ink)', marginBottom: 16, fontFamily: 'inherit' }} />
              </div>
            </div>

            <label className="block text-sm font-medium text-gray-700 mb-1">E-post</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required
              style={{ width: '100%', padding: '13px 14px', fontSize: 15, border: '1px solid var(--ds-border-strong)', background: 'var(--paper)', color: 'var(--ink)', marginBottom: 16, fontFamily: 'inherit' }} />

            {/* Valgbare FLATER, ikke tre radioknapper under et langt avsnitt:
                valget er sidens viktigste input, og skal se ut som det. */}
            <label className="block text-sm font-medium text-gray-700 mb-2">Hva er dere interessert i?</label>
            <div style={{ display: 'grid', gap: 10, marginBottom: 18 }}>
              {INTERESSER.map((o) => {
                const paa = interest === o.id
                return (
                  <button key={o.id} type="button" onClick={() => setInterest(o.id)} aria-pressed={paa}
                    style={{
                      position: 'relative', textAlign: 'left', cursor: 'pointer',
                      padding: '14px 44px 14px 16px', background: paa ? 'var(--paper-sunken)' : 'var(--paper-raised)',
                      border: `1px solid ${paa ? 'var(--ink)' : 'var(--ds-border-strong)'}`,
                    }}>
                    <span style={{ display: 'block', fontFamily: 'var(--font-archivo), system-ui, sans-serif', fontWeight: 700, fontSize: 15.5, color: 'var(--ink)', marginBottom: 3 }}>{o.label}</span>
                    <span style={{ display: 'block', fontSize: 13, lineHeight: 1.5, color: 'var(--text-muted)' }}>{o.hint}</span>
                    <span aria-hidden="true" style={{
                      position: 'absolute', top: 14, right: 14, width: 18, height: 18,
                      border: `1px solid ${paa ? 'var(--ink)' : 'var(--ds-border-strong)'}`,
                      background: paa ? 'var(--ink)' : 'transparent',
                      color: 'var(--paper)', fontSize: 11, lineHeight: '17px', textAlign: 'center',
                    }}>{paa ? '\u2713' : ''}</span>
                  </button>
                )
              })}
            </div>

            <label className="block text-sm font-medium text-gray-700 mb-1">Hva slags kunder skal dere tilby dette til?</label>
            <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={4}
              placeholder="F.eks. bransje, antall kunder, hva dere vil tilby dem …"
              style={{ width: '100%', padding: '13px 14px', fontSize: 15, border: '1px solid var(--ds-border-strong)', background: 'var(--paper)', color: 'var(--ink)', marginBottom: 16, fontFamily: 'inherit' }} />

            {/* honeypot — skjult for mennesker */}
            <input value={website} onChange={(e) => setWebsite(e.target.value)} tabIndex={-1} autoComplete="off"
              style={{ position: 'absolute', left: '-9999px' }} aria-hidden="true" />

            {error && <div style={{ marginBottom: 16, padding: '12px 14px', border: '1px solid var(--ember-tint-border)', background: 'var(--ember-tint-bg)', color: 'var(--ember-deep)', fontSize: 14 }}>{error}</div>}

            <button type="submit" disabled={busy}
              style={{ padding: '14px 26px', fontFamily: 'var(--font-archivo), system-ui, sans-serif', fontWeight: 700, fontSize: 15.5, background: 'var(--ember-deep)', color: 'var(--on-ember)', border: 'none', cursor: 'pointer' }}>
              {busy ? 'Sender …' : 'Send søknad'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
