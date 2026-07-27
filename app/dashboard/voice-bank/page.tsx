'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { getSupabase } from '@/lib/supabaseClient'

// Stemmebank-admin: oversikt over tenantens egne skuespillere og royalty-loggen.
// Tilgang styres server-side (/api/voice-bank/admin): tenantens admins + leddene over.

interface Actor {
  id: string
  name: string
  elevenlabs_voice_id: string
  honorarium_nok: number
  actor_rate_nok: number
  customer_price_nok: number
  discount_tiers: Array<{ from_uses: number; discount_pct: number }>
  is_active: boolean
}

interface UsageEvent {
  id: number
  actor_id: string
  actor_rate_nok: number
  customer_price_nok: number
  meta: { kind?: string }
  created_at: string
}

interface Monthly {
  actor_id: string
  uses: number
  to_actor_nok: number
  from_customers_nok: number
  cut_nok: number
}

const nok = (n: number) => `${(Math.round(n * 100) / 100).toLocaleString('nb-NO')} kr`
const KIND_LABEL: Record<string, string> = { video: 'Video', avatar: 'Avatar', radio: 'Radio' }

export default function VoiceBankAdminPage() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tenantName, setTenantName] = useState('')
  const [actors, setActors] = useState<Actor[]>([])
  const [events, setEvents] = useState<UsageEvent[]>([])
  const [monthly, setMonthly] = useState<Monthly[]>([])

  useEffect(() => {
    ;(async () => {
      try {
        const supabase = getSupabase()
        const { data: sess } = await supabase.auth.getSession()
        const token = sess?.session?.access_token
        if (!token) { setError('Ikke innlogget'); return }
        const res = await fetch('/api/voice-bank/admin', { headers: { Authorization: `Bearer ${token}` } })
        const data = await res.json()
        if (!res.ok) { setError(data.error || 'Kunne ikke hente stemmebanken'); return }
        setTenantName(data.tenant?.name || '')
        setActors(data.actors || [])
        setEvents(data.events || [])
        setMonthly(data.monthly || [])
      } catch (err: any) {
        setError(err.message)
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  const actorName = (id: string) => actors.find((a) => a.id === id)?.name || 'Ukjent'
  const totals = monthly.reduce(
    (s, m) => ({ uses: s.uses + m.uses, to: s.to + m.to_actor_nok, from: s.from + m.from_customers_nok, cut: s.cut + m.cut_nok }),
    { uses: 0, to: 0, from: 0, cut: 0 }
  )

  return (
    <div className="min-h-screen bg-[var(--paper)]">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <Link href="/dashboard" className="text-[var(--ember-deep)] hover:text-[#1C1A16] mb-4 inline-block">← Tilbake</Link>
        <h1 className="text-3xl font-bold text-gray-900 mb-2">🎙️ Stemmebank</h1>
        <p className="text-gray-600 mb-8">
          {tenantName ? `Skuespillerstemmene til ${tenantName}` : 'Skuespillerstemmer'} — satser, bruk og hva som skal betales ut.
          Kvantumsrabatter og eventuelle andeler regnes ved månedsavregningen, ikke her.
        </p>

        {loading && <p className="text-gray-500">Henter stemmebanken …</p>}
        {error && (
          <div className="p-4 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
            {error === 'Ikke innlogget' ? 'Du må være innlogget for å se denne siden.' : error}
          </div>
        )}

        {!loading && !error && (
          <>
            {/* Månedens tall */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
              {[
                { label: 'Bruk denne måneden', value: String(totals.uses) },
                { label: 'Fra kundene', value: nok(totals.from) },
                { label: 'Til skuespillerne', value: nok(totals.to) },
                { label: 'Vår andel', value: nok(totals.cut) },
              ].map((c) => (
                <div key={c.label} className="bg-white rounded-lg border border-gray-200 p-4">
                  <div className="text-xs text-gray-500 mb-1">{c.label}</div>
                  <div className="text-xl font-bold text-gray-900">{c.value}</div>
                </div>
              ))}
            </div>

            {/* Skuespillere */}
            <h2 className="font-semibold text-gray-900 mb-3">Skuespillere</h2>
            {actors.length === 0 ? (
              <p className="text-sm text-gray-500 mb-8">Ingen skuespillere registrert ennå.</p>
            ) : (
              <div className="bg-white rounded-lg border border-gray-200 overflow-x-auto mb-8">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-gray-500 border-b border-gray-200">
                      <th className="px-4 py-2">Navn</th>
                      <th className="px-4 py-2">Til skuespiller</th>
                      <th className="px-4 py-2">Kundepris</th>
                      <th className="px-4 py-2">Rabatt-trapper</th>
                      <th className="px-4 py-2">Bruk (mnd)</th>
                      <th className="px-4 py-2">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {actors.map((a) => {
                      const m = monthly.find((x) => x.actor_id === a.id)
                      return (
                        <tr key={a.id} className="border-b border-gray-100 last:border-0">
                          <td className="px-4 py-2 font-medium text-gray-900">{a.name}</td>
                          <td className="px-4 py-2">{nok(a.actor_rate_nok)}</td>
                          <td className="px-4 py-2">{nok(a.customer_price_nok)}</td>
                          <td className="px-4 py-2 text-gray-600">
                            {(a.discount_tiers || []).length === 0
                              ? '—'
                              : a.discount_tiers.map((t) => `${t.discount_pct} % fra ${t.from_uses} bruk`).join(', ')}
                          </td>
                          <td className="px-4 py-2">{m?.uses ?? 0}</td>
                          <td className="px-4 py-2">
                            {a.is_active
                              ? <span className="text-green-700">Aktiv</span>
                              : <span className="text-gray-400">Inaktiv</span>}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Royalty-logg */}
            <h2 className="font-semibold text-gray-900 mb-3">Siste bruk</h2>
            {events.length === 0 ? (
              <p className="text-sm text-gray-500">Ingen produksjoner har brukt en skuespillerstemme ennå.</p>
            ) : (
              <div className="bg-white rounded-lg border border-gray-200 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-gray-500 border-b border-gray-200">
                      <th className="px-4 py-2">Tidspunkt</th>
                      <th className="px-4 py-2">Skuespiller</th>
                      <th className="px-4 py-2">Type</th>
                      <th className="px-4 py-2">Til skuespiller</th>
                      <th className="px-4 py-2">Kundepris</th>
                    </tr>
                  </thead>
                  <tbody>
                    {events.map((e) => (
                      <tr key={e.id} className="border-b border-gray-100 last:border-0">
                        <td className="px-4 py-2 text-gray-600">{new Date(e.created_at).toLocaleString('nb-NO')}</td>
                        <td className="px-4 py-2 font-medium text-gray-900">{actorName(e.actor_id)}</td>
                        <td className="px-4 py-2">{KIND_LABEL[e.meta?.kind || ''] || e.meta?.kind || '—'}</td>
                        <td className="px-4 py-2">{nok(e.actor_rate_nok)}</td>
                        <td className="px-4 py-2">{nok(e.customer_price_nok)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
