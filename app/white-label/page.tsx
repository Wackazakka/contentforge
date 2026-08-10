'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useTenant } from '@/lib/tenantContext'
import { produktnavn } from '@/lib/tenantNames'

// Åpen white-label-søknad: hele plattformen under eget navn og domene.
// Skjemaet virker på alle tenant-domener — søknaden merkes med merkevaren
// den kom via (en søknad hos en partner er partnerens lead).

export default function WhiteLabelPage() {
  const tenant = useTenant()
  const [company, setCompany] = useState('')
  const [contactName, setContactName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [message, setMessage] = useState('')
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
        body: JSON.stringify({ company, contactName, email, phone, message, website }),
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
          Tilby hele plattformen under deres eget navn, med egne farger og eget domene — til deres kunder,
          med deres priser. Fortell oss kort hvem dere er, så tar vi kontakt.
        </p>

        {sent ? (
          <div className="p-5 rounded-xl bg-green-50 border border-green-200 text-green-800">
            <p className="font-semibold mb-1">Takk for søknaden!</p>
            <p className="text-sm">Vi tar kontakt på e-posten dere oppga, vanligvis innen en virkedag.</p>
          </div>
        ) : (
          <form onSubmit={submit} className="bg-white rounded-xl border border-gray-200 p-6">
            <label className="block text-sm font-medium text-gray-700 mb-1">Firma</label>
            <input value={company} onChange={(e) => setCompany(e.target.value)} required
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm mb-4" />

            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Kontaktperson</label>
                <input value={contactName} onChange={(e) => setContactName(e.target.value)} required
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm mb-4" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Telefon (valgfritt)</label>
                <input value={phone} onChange={(e) => setPhone(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm mb-4" />
              </div>
            </div>

            <label className="block text-sm font-medium text-gray-700 mb-1">E-post</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm mb-4" />

            <label className="block text-sm font-medium text-gray-700 mb-1">Hva slags kunder skal dere tilby dette til?</label>
            <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={4}
              placeholder="F.eks. bransje, antall kunder, hva slags innhold de lager …"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm mb-4" />

            {/* honeypot — skjult for mennesker */}
            <input value={website} onChange={(e) => setWebsite(e.target.value)} tabIndex={-1} autoComplete="off"
              style={{ position: 'absolute', left: '-9999px' }} aria-hidden="true" />

            {error && <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">{error}</div>}

            <button type="submit" disabled={busy}
              className="px-5 py-2.5 rounded-lg font-semibold text-[var(--on-ember)] bg-[var(--ember-deep)] hover:opacity-90 disabled:opacity-50 transition-opacity">
              {busy ? 'Sender …' : 'Send søknad'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
