'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { getSupabase } from '@/lib/supabaseClient'
import { CONSUMER_CREDIT_PACKAGES } from '@/lib/creditPackages'

// Kredittkjøp for privat og forening (/for-deg): små pakker, flat kurs 1 kr = 10 kreditter.

const BILLING_ON = process.env.NEXT_PUBLIC_BILLING_ENABLED === 'true'

const PACKAGE_HELP: Record<string, string> = {
  'privat-liten': 'Holder til en invitasjon eller et par kunngjøringer.',
  'privat-mellom': 'For foreningen som lager noe hver måned.',
  'privat-stor': 'Et helt år med korpsets kunngjøringer.',
}

export default function KredittClient() {
  const searchParams = useSearchParams()
  const [loggedIn, setLoggedIn] = useState<boolean | null>(null)
  const [saldo, setSaldo] = useState<number | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const paid = searchParams?.get('paid') === '1'

  const refresh = async () => {
    let token: string | undefined
    try {
      const { data: sess } = await getSupabase().auth.getSession()
      token = sess?.session?.access_token
    } catch { /* supabase utilgjengelig → behandles som utlogget */ }
    setLoggedIn(!!token)
    if (!token) return
    try {
      const d = await fetch('/api/org-balance', { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.json())
      setSaldo(typeof d.balance === 'number' ? d.balance : null)
    } catch { /* saldo utilgjengelig */ }
  }

  useEffect(() => {
    refresh()
    // Etter betaling: webhooken kan bruke noen sekunder — poll saldoen litt
    if (paid) {
      const iv = setInterval(refresh, 3000)
      const stop = setTimeout(() => clearInterval(iv), 30000)
      return () => { clearInterval(iv); clearTimeout(stop) }
    }
  }, [paid]) // eslint-disable-line react-hooks/exhaustive-deps

  const buy = async (packageId: string) => {
    setError(null)
    setBusy(packageId)
    try {
      const { data: sess } = await getSupabase().auth.getSession()
      const token = sess?.session?.access_token
      if (!token) throw new Error('Du må være innlogget.')
      const res = await fetch('/api/credit-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ packageId, returnPath: '/for-deg/kreditt' }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Kunne ikke starte betaling')
      window.location.href = data.url
    } catch (err: any) {
      setError(err.message)
      setBusy(null)
    }
  }

  return (
    <div className="fd-kreditt">
      <header className="fd-header" style={{ padding: '26px 0' }}>
        <span className="fd-logo-box">V</span>
        <span className="fd-wordmark">VoiceBank</span>
        <nav className="fd-nav">
          <Link href="/for-deg">← Tilbake</Link>
        </nav>
      </header>

      <div>
        <h1 className="fd-h2" style={{ marginBottom: 10 }}>Kjøp kreditt</h1>
        <p className="fd-ingress" style={{ maxWidth: 560 }}>
          Én krone er ti kreditter. Kreditten står på kontoen din til du lager noe —
          ingen månedsavgift, ingen binding.
        </p>
      </div>

      {paid && (
        <div className="fd-banner-green">
          Takk! Betalingen er mottatt — saldoen oppdateres om få sekunder.{' '}
          <Link href="/dashboard" style={{ fontWeight: 600, textDecoration: 'underline' }}>Lag noe nå →</Link>
        </div>
      )}

      {loggedIn && (
        <div className="fd-card-panel">
          <div style={{ fontSize: 13, color: 'var(--fd-ink-muted)', marginBottom: 4 }}>På konto nå</div>
          <div className="fd-package-price fd-num">
            {saldo === null ? '—' : `${Math.round(saldo * 10).toLocaleString('nb-NO')} kreditter`}
          </div>
          {saldo === null && (
            <p style={{ fontSize: 13, color: 'var(--fd-ink-muted)', margin: '4px 0 0' }}>
              Ingen konto ennå — den opprettes automatisk ved første kjøp.
            </p>
          )}
        </div>
      )}

      {loggedIn === false && (
        <div className="fd-card-panel">
          <h2 className="fd-h3" style={{ marginBottom: 8 }}>Først: lag en konto</h2>
          <p style={{ margin: '0 0 18px', color: 'var(--fd-ink-soft)' }}>
            Kontoen holder styr på kreditten din og det du lager. Det tar under et minutt.
          </p>
          <div className="fd-cta-row">
            <Link href="/register?next=/for-deg/kreditt" className="fd-cta">Registrer deg</Link>
            <Link href="/login?next=/for-deg/kreditt" className="fd-cta-ghost">Logg inn</Link>
          </div>
        </div>
      )}

      {!BILLING_ON && (
        <div className="fd-banner-green">
          <strong>Gratis i åpningsperioden</strong> — du trenger ikke kjøpe kreditt ennå.
          Bare {loggedIn ? <Link href="/dashboard" style={{ fontWeight: 600, textDecoration: 'underline' }}>kom i gang</Link> : <Link href="/register?next=/dashboard" style={{ fontWeight: 600, textDecoration: 'underline' }}>registrer deg og kom i gang</Link>}.
        </div>
      )}

      <div className="fd-packages">
        {CONSUMER_CREDIT_PACKAGES.map((p) => (
          <div key={p.id} className="fd-package">
            <span className="fd-package-price fd-num">{p.amount.toLocaleString('nb-NO')} kr</span>
            <span className="fd-package-credits fd-num">{p.credits.toLocaleString('nb-NO')} kreditter</span>
            <span className="fd-package-help">{PACKAGE_HELP[p.id]}</span>
            {BILLING_ON && loggedIn && (
              <button type="button" className="fd-cta" onClick={() => buy(p.id)} disabled={!!busy} style={{ opacity: busy && busy !== p.id ? 0.5 : 1 }}>
                {busy === p.id ? 'Åpner betaling …' : 'Kjøp →'}
              </button>
            )}
          </div>
        ))}
      </div>

      {error && (
        <div className="fd-card-panel" style={{ borderColor: '#F5D2C7', color: 'var(--fd-terracotta-dark)' }}>{error}</div>
      )}

      <footer className="fd-footer" style={{ padding: '30px 0 0' }}>
        <span className="fd-footer-links">
          <Link href="/privacy">Personvern</Link>
          <Link href="/terms">Vilkår</Link>
        </span>
      </footer>
    </div>
  )
}
