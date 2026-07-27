'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { getSupabase } from '@/lib/supabaseClient'
import { CREDIT_PACKAGES } from '@/lib/creditPackages'

// Selvbetjent kredittkjøp for white-label-sluttkunder: se saldo, kjøp pakke.
// Saldoen trekkes automatisk for hver produksjon (vises også i taxameteret).

const nok = (n: number) => `${n.toLocaleString('nb-NO')} kr`

export default function CreditsPage() {
  const searchParams = useSearchParams()
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
        <Link href="/dashboard" className="text-[var(--ember-deep)] hover:text-[#1C1A16] mb-4 inline-block">← Tilbake</Link>
        <h1 className="text-3xl font-bold text-gray-900 mb-2">💳 Kreditter</h1>
        <p className="text-gray-600 mb-6">Kjøp kreditt på forhånd — hver produksjon trekker fra saldoen, og taxameteret viser alltid om du har dekning.</p>

        {paid && (
          <div className="mb-6 p-4 rounded-lg bg-green-50 border border-green-200 text-sm text-green-700">
            Takk! Betalingen er mottatt — saldoen oppdateres om få sekunder.
          </div>
        )}

        <div className="bg-white rounded-lg border border-gray-200 p-5 mb-8">
          <div className="text-xs text-gray-500 mb-1">På konto nå</div>
          <div className="text-3xl font-bold text-gray-900">
            {loading ? '…' : saldo === null ? '—' : nok(Math.round(saldo * 100) / 100)}
          </div>
          {saldo === null && !loading && (
            <p className="text-xs text-gray-400 mt-1">Ingen forskuddskonto ennå — den opprettes automatisk ved første kjøp.</p>
          )}
        </div>

        <h2 className="font-semibold text-gray-900 mb-3">Kjøp mer</h2>
        <div className="grid sm:grid-cols-3 gap-4 mb-4">
          {CREDIT_PACKAGES.map((p) => (
            <button
              key={p.id}
              onClick={() => buy(p.id)}
              disabled={!!busy}
              className="bg-white rounded-xl border border-gray-200 p-5 text-left hover:border-[var(--ember-deep)] disabled:opacity-50 transition-colors"
            >
              <div className="text-2xl font-bold text-gray-900 mb-1">{nok(p.amount)}</div>
              {p.bonus > 0
                ? <div className="text-sm font-medium text-green-700 mb-2">+ {nok(p.bonus)} bonus</div>
                : <div className="text-sm text-gray-400 mb-2">&nbsp;</div>}
              <div className="text-sm text-[var(--ember-deep)] font-semibold">
                {busy === p.id ? 'Åpner betaling …' : 'Kjøp →'}
              </div>
            </button>
          ))}
        </div>
        <p className="text-xs text-gray-400 mb-4">Betaling med kort. Bonusen legges på saldoen sammen med beløpet.</p>

        {error && <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">{error}</div>}
      </div>
    </div>
  )
}
