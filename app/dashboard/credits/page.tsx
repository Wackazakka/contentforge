'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { useSearchParams } from 'next/navigation'
import { getSupabase } from '@/lib/supabaseClient'
import { CREDIT_PACKAGES, CONSUMER_CREDIT_PACKAGES } from '@/lib/creditPackages'
import { useTenant } from '@/lib/tenantContext'

// Selvbetjent kredittkjøp for white-label-sluttkunder: se saldo, kjøp pakke.
// Saldoen trekkes automatisk for hver produksjon (vises også i taxameteret).

const nok = (n: number) => `${n.toLocaleString('nb-NO')} kr`

export default function CreditsPage() {
  const t = useTranslations('creditsPage')
  const searchParams = useSearchParams()
  // Artister er enkeltpersoner, ikke byraaer: de skal se 200-1000-pakkene,
  // ikke bedriftskurven som starter paa 1 000 kr (Lars 2/8).
  const tenant = useTenant()
  const erArtist = tenant.vertical === 'music'
  const PAKKER: readonly any[] = erArtist ? CONSUMER_CREDIT_PACKAGES : CREDIT_PACKAGES
  const [saldo, setSaldo] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const paid = searchParams?.get('paid') === '1'

  const refresh = async () => {
    try {
      const { data: sess } = await getSupabase().auth.getSession()
      const token = sess?.session?.access_token
      if (!token) { setError('Du må være innlogget.'); return }
      const d = await fetch('/api/org-balance', { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.json())
      setSaldo(typeof d.balance === 'number' ? d.balance : null)
    } catch { /* saldo utilgjengelig */ } finally {
      setLoading(false)
    }
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
        body: JSON.stringify({ packageId }),
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
    <div className="min-h-screen bg-[var(--paper)]">
      <div className="max-w-2xl mx-auto px-4 py-8">
        <Link href="/dashboard" className="text-[var(--ember-deep)] hover:text-[var(--ink)] mb-4 inline-block">{t('back')}</Link>
        <h1 className="text-3xl font-bold text-[var(--ink)] mb-2">💳 {t('title')}</h1>
        <p className="text-[var(--text-muted)] mb-6">{t('intro')}</p>

        {paid && (
          <div className="mb-6 p-4 rounded-lg bg-green-50 border border-green-200 text-sm text-green-700">
            Takk! Betalingen er mottatt — saldoen oppdateres om få sekunder.
          </div>
        )}

        <div className="bg-[var(--paper-raised)] rounded-lg border border-[var(--ds-border)] p-5 mb-8">
          <div className="text-xs text-[var(--text-muted)] mb-1">{t('balance')}</div>
          <div className="text-3xl font-bold text-[var(--ink)]">
            {loading ? '…' : saldo === null ? '—' : `${Math.round(saldo * 10).toLocaleString('nb-NO')} kreditter`}
          </div>
          {saldo === null && !loading && (
            <p className="text-xs text-[var(--text-faint)] mt-1">{t('noAccount')}</p>
          )}
        </div>

        <h2 className="font-semibold text-[var(--ink)] mb-3">{t('buyMore')}</h2>
        <div className="grid sm:grid-cols-3 gap-4 mb-4">
          {PAKKER.map((p) => (
            <button
              key={p.id}
              onClick={() => buy(p.id)}
              disabled={!!busy}
              className="bg-[var(--paper-raised)] rounded-xl border border-[var(--ds-border)] p-5 text-left hover:border-[var(--ember-deep)] disabled:opacity-50 transition-colors"
            >
              <div className="text-2xl font-bold text-[var(--ink)]">{nok(p.amount)}</div>
              <div className="text-base font-semibold text-[var(--ink)] mb-1">
                {p.credits.toLocaleString('nb-NO')} kreditter
                {p.bonusPct > 0 && <span className="ml-1.5 text-[var(--ember-deep)]">+{p.bonusPct} %</span>}
              </div>
              {p.rekker ? (
                <div className="text-sm text-[var(--text-muted)] mb-2">{t('lasts', { films: t(p.rekker) })}</div>
              ) : (
                <div className={`text-sm font-medium mb-2 ${p.amount >= 100000 ? 'text-green-700' : 'text-[var(--text-muted)]'}`}>
                  kurs {(p.amount / p.credits).toFixed(3).replace('.', ',')} kr/kreditt{p.amount >= 100000 ? ' — beste kurs' : ''}
                </div>
              )}
              <div className="text-sm text-[var(--ember-deep)] font-semibold">
                {busy === p.id ? t('opening') : t('buy')}
              </div>
            </button>
          ))}
        </div>
        <p className="text-xs text-[var(--text-faint)] mb-4">
          {erArtist
            ? t('footConsumer')
            : t('footPro')}
        </p>

        {error && <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">{error}</div>}
      </div>
    </div>
  )
}
