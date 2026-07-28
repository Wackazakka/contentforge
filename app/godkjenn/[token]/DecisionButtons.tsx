'use client'

import { useState } from 'react'

export function DecisionButtons({ token }: { token: string }) {
  const [busy, setBusy] = useState<string | null>(null)
  const [result, setResult] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const decide = async (decision: 'approved' | 'rejected') => {
    setBusy(decision); setError(null)
    try {
      const res = await fetch('/api/review-decision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, decision }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Noe gikk galt')
      setResult(decision)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setBusy(null)
    }
  }

  if (result) {
    return (
      <div className={`p-4 rounded-lg text-sm ${result === 'rejected' ? 'bg-red-50 border border-red-200 text-red-700' : 'bg-green-50 border border-green-200 text-green-700'}`}>
        {result === 'approved' ? 'Godkjent — kunden kan nå bruke innholdet. Takk!' : 'Avvist — kunden kan ikke bruke innholdet.'}
      </div>
    )
  }

  return (
    <div>
      {error && <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">{error}</div>}
      <div className="flex gap-3">
        <button onClick={() => decide('approved')} disabled={!!busy}
          className="flex-1 px-5 py-3 rounded-lg font-semibold text-white bg-green-600 hover:bg-green-700 disabled:opacity-50 transition-colors">
          {busy === 'approved' ? 'Godkjenner …' : '✓ Godkjenn'}
        </button>
        <button onClick={() => decide('rejected')} disabled={!!busy}
          className="flex-1 px-5 py-3 rounded-lg font-semibold text-red-600 border border-red-300 hover:bg-red-50 disabled:opacity-50 transition-colors">
          {busy === 'rejected' ? 'Avviser …' : '✕ Avvis'}
        </button>
      </div>
    </div>
  )
}
