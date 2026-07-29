'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { getSupabase } from '@/lib/supabaseClient'

// Partner-admin: dine direkte underledd — påslaget du tar av dem, royalty-satsen
// de betaler oppover, og merkevaren deres (navn, logo, fargeprofil).
// Hvert ledd styrer kun leddet under seg; ingen ser oppover.

interface Partner {
  id: string
  slug: string
  app_name: string
  logo_url: string | null
  colors: Record<string, string>
  markup_percent: number
  license_fee_pct?: number | null
  fee_direct_pct: number
  fee_indirect_pct: number
  billing_mode: string
}

const COLOR_FIELDS: Array<{ key: string; label: string; fallback: string }> = [
  { key: '--ember', label: 'Hovedfarge', fallback: '#E25822' },
  { key: '--ember-deep', label: 'Dyp variant', fallback: '#C5451B' },
  { key: '--ember-tint-bg', label: 'Lys bakgrunn', fallback: '#FBE9E1' },
  { key: '--ember-tint-border', label: 'Lys kant', fallback: '#F2C9B8' },
]

export default function PartnersPage() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tenantName, setTenantName] = useState('')
  const [partners, setPartners] = useState<Partner[]>([])
  const [income, setIncome] = useState<Record<string, { grossNok: number; licenseNok: number; uses: number }>>({})
  const [edits, setEdits] = useState<Record<string, { markup: string; feeDirect: string; feeIndirect: string; license: string; name: string; logo: string; colors: Record<string, string> }>>({})
  const [busy, setBusy] = useState<string | null>(null)
  const [saved, setSaved] = useState<string | null>(null)

  const authedFetch = async (init?: RequestInit) => {
    const { data: sess } = await getSupabase().auth.getSession()
    const token = sess?.session?.access_token
    if (!token) throw new Error('Ikke innlogget')
    return fetch('/api/partners', {
      ...init,
      headers: { ...(init?.headers || {}), Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    })
  }

  const refresh = async () => {
    try {
      const res = await authedFetch()
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Kunne ikke hente partnerne'); return }
      setError(null)
      setTenantName(data.tenant?.name || '')
      setPartners(data.partners || [])
      setIncome(data.income || {})
      const e: typeof edits = {}
      for (const p of data.partners || []) {
        const colors: Record<string, string> = {}
        for (const f of COLOR_FIELDS) colors[f.key] = p.colors?.[f.key] || f.fallback
        e[p.id] = { markup: String(p.markup_percent), feeDirect: String(p.fee_direct_pct ?? 3), feeIndirect: String(p.fee_indirect_pct ?? 7.5), license: String(p.license_fee_pct ?? 0), name: p.app_name, logo: p.logo_url || '', colors }
      }
      setEdits(e)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { refresh() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const save = async (p: Partner) => {
    const e = edits[p.id]
    if (!e) return
    if (isNaN(Number(e.markup)) || isNaN(Number(e.license))) { setError('Påslag og lisensavgift må være tall.'); return }
    setBusy(p.id); setSaved(null); setError(null)
    try {
      const res = await authedFetch({
        method: 'PATCH',
        body: JSON.stringify({
          tenantId: p.id,
          markupPercent: Number(e.markup),
          licenseFeePct: Number(e.license),
          appName: e.name,
          logoUrl: e.logo || null,
          colors: e.colors,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Lagring feilet')
      setSaved(p.id)
      await refresh()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setBusy(null)
    }
  }

  const setEdit = (id: string, field: string, value: string) =>
    setEdits((prev) => ({ ...prev, [id]: { ...prev[id], [field]: value } }))
  const setColor = (id: string, key: string, value: string) =>
    setEdits((prev) => ({ ...prev, [id]: { ...prev[id], colors: { ...prev[id].colors, [key]: value } } }))

  return (
    <div className="min-h-screen bg-[var(--paper)]">
      <div className="max-w-3xl mx-auto px-4 py-8">
        <Link href="/dashboard" className="text-[var(--ember-deep)] hover:text-[#1C1A16] mb-4 inline-block">← Tilbake</Link>
        <h1 className="text-3xl font-bold text-gray-900 mb-2">🤝 Partnere</h1>
        <p className="text-gray-600 mb-8">
          {tenantName ? `${tenantName} sine direkte underledd` : 'Dine direkte underledd'} — sett påslaget dere tar av dem,
          lisensavgiften fra partneravtalen, og merkevaren deres (navn, logo og farger på deres eget domene).
        </p>

        {loading && <p className="text-gray-500">Henter partnerne …</p>}
        {error && <div className="mb-6 p-4 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">{error}</div>}

        {!loading && partners.length === 0 && !error && (
          <p className="text-sm text-gray-500">Ingen partnere under dette leddet ennå.</p>
        )}

        {Object.keys(income).length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 p-5 mb-8">
            <h2 className="font-semibold text-gray-900 mb-1">Partnerinntekter denne måneden</h2>
            <p className="text-xs text-gray-400 mb-3">Lisensavgiften av partnernes stemme- og ansiktsomsetning — samme hovedbok som partneren selv ser. Endelig oppgjør skjer ved månedsavregningen.</p>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-500 border-b border-gray-200">
                  <th className="py-2">Partner</th>
                  <th className="py-2">Bruk</th>
                  <th className="py-2">Aktiva-omsetning</th>
                  <th className="py-2">Sats</th>
                  <th className="py-2 text-right">Til dere</th>
                </tr>
              </thead>
              <tbody>
                {partners.filter((p) => income[p.id]).map((p) => {
                  const inc = income[p.id]
                  return (
                    <tr key={p.id} className="border-b border-gray-100 last:border-0">
                      <td className="py-2 font-medium">{p.app_name}</td>
                      <td className="py-2">{inc.uses}</td>
                      <td className="py-2">{inc.grossNok.toLocaleString('nb-NO')} kr</td>
                      <td className="py-2">{Number(p.license_fee_pct ?? 0)} %</td>
                      <td className="py-2 text-right font-semibold text-green-700">{inc.licenseNok.toLocaleString('nb-NO')} kr</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className="space-y-6">
          {partners.map((p) => {
            const e = edits[p.id]
            if (!e) return null
            return (
              <div key={p.id} className="bg-white rounded-xl border border-gray-200 p-6">
                <div className="flex items-center justify-between gap-4 mb-5">
                  <div>
                    <h2 className="font-semibold text-gray-900 text-lg">{p.app_name}</h2>
                    <p className="text-xs text-gray-400 font-mono">{p.slug} · {p.billing_mode === 'invoice' ? 'forskudd/avregning' : 'direktebetaling'}</p>
                  </div>
                  <div className="w-10 h-10 rounded-lg border border-gray-200 flex-none" style={{ background: e.colors['--ember'] }} title="Hovedfarge" />
                </div>

                <div className="grid sm:grid-cols-2 gap-4 mb-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Vårt påslag mot partneren (%)</label>
                    <input value={e.markup} onChange={(ev) => setEdit(p.id, 'markup', ev.target.value)} inputMode="decimal"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                    <p className="text-xs text-gray-400 mt-1">0–500. Partnerens innpris = vår kost + dette påslaget. 100 = standard.</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Lisensavgift (%)</label>
                    <input value={e.license} onChange={(ev) => setEdit(p.id, 'license', ev.target.value)} inputMode="decimal"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                    <p className="text-xs text-gray-400 mt-1">Din forhandlede andel av partnerens stemme- og ansiktsomsetning. 0 = ingen. I tillegg går infrastrukturavgiften (3 %) til plattformen i alle ledd.</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Visningsnavn</label>
                    <input value={e.name} onChange={(ev) => setEdit(p.id, 'name', ev.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Logo-URL</label>
                    <input value={e.logo} onChange={(ev) => setEdit(p.id, 'logo', ev.target.value)} placeholder="https://…"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono" />
                  </div>
                </div>

                <label className="block text-sm font-medium text-gray-700 mb-2">Fargeprofil (partnerens domene)</label>
                <div className="flex flex-wrap gap-4 mb-5">
                  {COLOR_FIELDS.map((f) => (
                    <label key={f.key} className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
                      <input type="color" value={e.colors[f.key]} onChange={(ev) => setColor(p.id, f.key, ev.target.value)}
                        className="w-9 h-9 rounded border border-gray-300 cursor-pointer" />
                      {f.label}
                    </label>
                  ))}
                </div>

                <div className="flex items-center gap-3">
                  <button onClick={() => save(p)} disabled={busy === p.id}
                    className="px-5 py-2.5 rounded-lg font-semibold text-white bg-[var(--ember-deep)] hover:opacity-90 disabled:opacity-50 transition-opacity">
                    {busy === p.id ? 'Lagrer …' : 'Lagre'}
                  </button>
                  {saved === p.id && <span className="text-sm text-green-700">Lagret — synlig på partnerens domene innen ett minutt.</span>}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
