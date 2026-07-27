'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { getSupabase } from '@/lib/supabaseClient'

// Skuespiller-side: hva stemmen er brukt til og hva den har generert, per måned
// og per brukstype — pluss redigering av takstene. Samme admin-gating som banken.

interface ActorDetail {
  id: string
  name: string
  elevenlabs_voice_id: string
  honorarium_nok: number
  actor_rate_nok: number
  customer_price_nok: number
  rates: Record<string, { actor_rate_nok: number; customer_price_nok: number }> | null
  discount_tiers: Array<{ from_uses: number; discount_pct: number }>
  is_active: boolean
  created_at: string
}

interface Agg { key: string; uses: number; to_actor_nok: number; from_customers_nok: number }

const nok = (n: number) => `${(Math.round(n * 100) / 100).toLocaleString('nb-NO')} kr`
const KIND_LABEL: Record<string, string> = { video: 'Video', avatar: 'Avatar', radio: 'Radio', ukjent: 'Ukjent' }
const KINDS = ['video', 'avatar', 'radio']

export default function VoiceActorPage() {
  const params = useParams()
  const actorId = String(params.actorId || '')

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actor, setActor] = useState<ActorDetail | null>(null)
  const [events, setEvents] = useState<Array<{ id: number; actor_rate_nok: number; customer_price_nok: number; meta: { kind?: string }; created_at: string }>>([])
  const [byMonth, setByMonth] = useState<Agg[]>([])
  const [byKind, setByKind] = useState<Agg[]>([])

  // Takst-redigering: standard + per brukstype ('' = bruk standard)
  const [editRate, setEditRate] = useState('')
  const [editPrice, setEditPrice] = useState('')
  const [editKinds, setEditKinds] = useState<Record<string, { rate: string; price: string }>>({})
  const [saveBusy, setSaveBusy] = useState(false)
  const [saveMsg, setSaveMsg] = useState<string | null>(null)

  const authedFetch = async (init?: RequestInit) => {
    const { data: sess } = await getSupabase().auth.getSession()
    const token = sess?.session?.access_token
    if (!token) throw new Error('Ikke innlogget')
    return fetch(`/api/voice-bank/admin?actorId=${actorId}`, {
      ...init,
      headers: { ...(init?.headers || {}), Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    })
  }

  const refresh = useCallback(async () => {
    try {
      const res = await authedFetch()
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Kunne ikke hente skuespilleren'); return }
      setError(null)
      setActor(data.actor)
      setEvents(data.events || [])
      setByMonth(data.byMonth || [])
      setByKind(data.byKind || [])
      setEditRate(String(data.actor.actor_rate_nok))
      setEditPrice(String(data.actor.customer_price_nok))
      const ek: Record<string, { rate: string; price: string }> = {}
      for (const k of KINDS) {
        const r = data.actor.rates?.[k]
        ek[k] = r ? { rate: String(r.actor_rate_nok), price: String(r.customer_price_nok) } : { rate: '', price: '' }
      }
      setEditKinds(ek)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actorId])

  useEffect(() => { refresh() }, [refresh])

  const saveRates = async () => {
    setSaveMsg(null)
    if (editRate === '' || editPrice === '' || isNaN(Number(editRate)) || isNaN(Number(editPrice))) {
      setSaveMsg('Standardsatsene må være tall.'); return
    }
    const rates: Record<string, { actor_rate_nok: number; customer_price_nok: number }> = {}
    for (const k of KINDS) {
      const v = editKinds[k]
      if (!v || (v.rate === '' && v.price === '')) continue
      if (v.rate === '' || v.price === '' || isNaN(Number(v.rate)) || isNaN(Number(v.price))) {
        setSaveMsg(`Fyll ut både sats og pris for ${KIND_LABEL[k]} — eller la begge stå tomme for standard.`); return
      }
      rates[k] = { actor_rate_nok: Number(v.rate), customer_price_nok: Number(v.price) }
    }
    setSaveBusy(true)
    try {
      const res = await authedFetch({
        method: 'PATCH',
        body: JSON.stringify({ actorId, actorRateNok: Number(editRate), customerPriceNok: Number(editPrice), rates }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Lagring feilet')
      setSaveMsg('Takstene er lagret.')
      await refresh()
    } catch (err: any) {
      setSaveMsg(err.message)
    } finally {
      setSaveBusy(false)
    }
  }

  const totals = byMonth.reduce(
    (s, m) => ({ uses: s.uses + m.uses, to: s.to + m.to_actor_nok, from: s.from + m.from_customers_nok }),
    { uses: 0, to: 0, from: 0 }
  )

  return (
    <div className="min-h-screen bg-[var(--paper)]">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <Link href="/dashboard/voice-bank" className="text-[var(--ember-deep)] hover:text-[#1C1A16] mb-4 inline-block">← Stemmebanken</Link>

        {loading && <p className="text-gray-500">Henter skuespilleren …</p>}
        {error && <div className="p-4 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">{error}</div>}

        {!loading && !error && actor && (
          <>
            <div className="flex items-center gap-3 mb-1">
              <h1 className="text-3xl font-bold text-gray-900">🎙️ {actor.name}</h1>
              <span className={`text-sm font-medium ${actor.is_active ? 'text-green-700' : 'text-gray-400'}`}>
                {actor.is_active ? 'Aktiv' : 'Inaktiv'}
              </span>
            </div>
            <p className="text-gray-500 mb-8">
              ElevenLabs-id: <span className="font-mono">{actor.elevenlabs_voice_id}</span>
              {Number(actor.honorarium_nok) > 0 && <> · Engangshonorar: {nok(Number(actor.honorarium_nok))}</>}
            </p>

            {/* Totalt generert */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
              {[
                { label: 'Bruk totalt', value: String(totals.uses) },
                { label: 'Generert fra kundene', value: nok(totals.from) },
                { label: 'Opptjent til skuespilleren', value: nok(totals.to) },
                { label: 'Vår andel', value: nok(totals.from - totals.to) },
              ].map((c) => (
                <div key={c.label} className="bg-white rounded-lg border border-gray-200 p-4">
                  <div className="text-xs text-gray-500 mb-1">{c.label}</div>
                  <div className="text-xl font-bold text-gray-900">{c.value}</div>
                </div>
              ))}
            </div>

            {/* Takster */}
            <h2 className="font-semibold text-gray-900 mb-3">Takster</h2>
            <div className="bg-white rounded-lg border border-gray-200 p-6 mb-8">
              <div className="grid grid-cols-2 gap-3 mb-4 max-w-md">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Standard — til skuespiller (kr)</label>
                  <input value={editRate} onChange={(e) => setEditRate(e.target.value)} inputMode="decimal"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Standard — kundepris (kr)</label>
                  <input value={editPrice} onChange={(e) => setEditPrice(e.target.value)} inputMode="decimal"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                </div>
              </div>

              <p className="text-sm font-medium text-gray-700 mb-1">Egne takster per brukstype</p>
              <p className="text-xs text-gray-400 mb-3">La feltene stå tomme der standardsatsen skal gjelde.</p>
              <div className="space-y-2 max-w-md mb-4">
                {KINDS.map((k) => (
                  <div key={k} className="flex items-center gap-2 text-sm">
                    <span className="w-16 text-gray-600">{KIND_LABEL[k]}</span>
                    <input value={editKinds[k]?.rate ?? ''} placeholder="til skuespiller"
                      onChange={(e) => setEditKinds({ ...editKinds, [k]: { ...(editKinds[k] || { rate: '', price: '' }), rate: e.target.value } })}
                      inputMode="decimal" className="flex-1 px-3 py-1.5 border border-gray-300 rounded-lg" />
                    <input value={editKinds[k]?.price ?? ''} placeholder="kundepris"
                      onChange={(e) => setEditKinds({ ...editKinds, [k]: { ...(editKinds[k] || { rate: '', price: '' }), price: e.target.value } })}
                      inputMode="decimal" className="flex-1 px-3 py-1.5 border border-gray-300 rounded-lg" />
                  </div>
                ))}
              </div>

              {saveMsg && (
                <div className={`mb-3 p-3 rounded-lg text-sm ${saveMsg === 'Takstene er lagret.' ? 'bg-green-50 border border-green-200 text-green-700' : 'bg-red-50 border border-red-200 text-red-700'}`}>
                  {saveMsg}
                </div>
              )}
              <button onClick={saveRates} disabled={saveBusy}
                className="px-5 py-2.5 rounded-lg font-semibold text-white bg-[var(--ember-deep)] hover:opacity-90 disabled:opacity-50 transition-opacity">
                {saveBusy ? 'Lagrer …' : 'Lagre takster'}
              </button>
              <p className="text-xs text-gray-400 mt-2">Nye takster gjelder fra neste bruk — historikken beholder satsene som gjaldt da.</p>
            </div>

            {/* Per brukstype */}
            <h2 className="font-semibold text-gray-900 mb-3">Hva stemmen er brukt til</h2>
            {byKind.length === 0 ? (
              <p className="text-sm text-gray-500 mb-8">Ingen bruk registrert ennå.</p>
            ) : (
              <div className="bg-white rounded-lg border border-gray-200 overflow-x-auto mb-8">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-gray-500 border-b border-gray-200">
                      <th className="px-4 py-2">Brukstype</th>
                      <th className="px-4 py-2">Bruk</th>
                      <th className="px-4 py-2">Til skuespilleren</th>
                      <th className="px-4 py-2">Fra kundene</th>
                    </tr>
                  </thead>
                  <tbody>
                    {byKind.map((r) => (
                      <tr key={r.key} className="border-b border-gray-100 last:border-0">
                        <td className="px-4 py-2 font-medium text-gray-900">{KIND_LABEL[r.key] || r.key}</td>
                        <td className="px-4 py-2">{r.uses}</td>
                        <td className="px-4 py-2">{nok(r.to_actor_nok)}</td>
                        <td className="px-4 py-2">{nok(r.from_customers_nok)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Per måned */}
            <h2 className="font-semibold text-gray-900 mb-3">Måned for måned</h2>
            {byMonth.length === 0 ? (
              <p className="text-sm text-gray-500">Ingen bruk registrert ennå.</p>
            ) : (
              <div className="bg-white rounded-lg border border-gray-200 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-gray-500 border-b border-gray-200">
                      <th className="px-4 py-2">Måned</th>
                      <th className="px-4 py-2">Bruk</th>
                      <th className="px-4 py-2">Til skuespilleren</th>
                      <th className="px-4 py-2">Fra kundene</th>
                    </tr>
                  </thead>
                  <tbody>
                    {byMonth.map((r) => (
                      <tr key={r.key} className="border-b border-gray-100 last:border-0">
                        <td className="px-4 py-2 font-medium text-gray-900">{r.key}</td>
                        <td className="px-4 py-2">{r.uses}</td>
                        <td className="px-4 py-2">{nok(r.to_actor_nok)}</td>
                        <td className="px-4 py-2">{nok(r.from_customers_nok)}</td>
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
