'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useTranslations, useLocale } from 'next-intl'
import { getSupabase } from '@/lib/supabaseClient'

// Stemmebank-admin: oversikt over tenantens egne skuespillere og royalty-loggen.
// Tilgang styres server-side (/api/voice-bank/admin): tenantens admins + leddene over.

interface Actor {
  id: string
  name: string
  elevenlabs_voice_id: string | null
  honorarium_nok: number
  actor_rate_nok: number
  customer_price_nok: number
  discount_tiers: Array<{ from_uses: number; discount_pct: number }>
  is_active: boolean
  is_exclusive?: boolean | null
  face_character_id?: string | null
}

interface UsageEvent {
  id: number
  actor_id: string
  actor_rate_nok: number
  customer_price_nok: number
  meta: { kind?: string }
  created_at: string
}

interface VoiceApplication {
  id: string
  name: string
  email: string
  phone: string | null
  bio: string | null
  sample_urls: string[]
  wants_face: boolean
  status: string
  created_at: string
}

interface Monthly {
  actor_id: string
  uses: number
  to_actor_nok: number
  from_customers_nok: number
  cut_nok: number
}

// Brukstypene er API-kontrakt mot hendelsesloggen; bare etiketten oversettes.
const BCP47: Record<string, string> = { no: 'nb-NO', en: 'en-GB' }

export default function VoiceBankAdminPage() {
  const t = useTranslations('bank')
  const locale = useLocale()
  const bcp = BCP47[locale] || 'en-GB'
  const nok = (n: number) => `${(Math.round(n * 100) / 100).toLocaleString(bcp)} kr`
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tenantName, setTenantName] = useState('')
  const [actors, setActors] = useState<Actor[]>([])
  const [events, setEvents] = useState<UsageEvent[]>([])
  const [monthly, setMonthly] = useState<Monthly[]>([])
  const [fees, setFees] = useState<{ infraPct: number; licensePct: number; licenseTo: string | null } | null>(null)
  const [monthInfraNok, setMonthInfraNok] = useState(0)
  const [monthLicenseNok, setMonthLicenseNok] = useState(0)
  // Faste kostnader: abonnementene vi dekker. Regnes server-side.
  const [subsCount, setSubsCount] = useState(0)
  const [subsNok, setSubsNok] = useState(0)
  const [applications, setApplications] = useState<VoiceApplication[]>([])
  const [acceptApps, setAcceptApps] = useState(false)
  const [appsMigrated, setAppsMigrated] = useState(true)
  const [appBusy, setAppBusy] = useState<string | null>(null)

  // Legg til skuespiller-skjemaet
  const [showForm, setShowForm] = useState(false)
  const [fName, setFName] = useState('')
  const [fVoiceId, setFVoiceId] = useState('')
  const [fHonorar, setFHonorar] = useState('')
  const [fRate, setFRate] = useState('')
  const [fPrice, setFPrice] = useState('')
  const [fTiers, setFTiers] = useState<Array<{ from_uses: string; discount_pct: string }>>([])
  const [fExclusive, setFExclusive] = useState(true)
  const [fHasVoice, setFHasVoice] = useState(true)
  const [fHasFace, setFHasFace] = useState(false)
  const [fFaceCharId, setFFaceCharId] = useState('')
  const [ownChars, setOwnChars] = useState<Array<{ id: string; name: string }>>([])
  const [fBusy, setFBusy] = useState(false)
  const [bulkBusy, setBulkBusy] = useState(false)
  const [fError, setFError] = useState<string | null>(null)

  const authedFetchTo = async (url: string, init?: RequestInit) => {
    const { data: sess } = await getSupabase().auth.getSession()
    const token = sess?.session?.access_token
    if (!token) throw new Error('Ikke innlogget')
    return fetch(url, {
      ...init,
      headers: { ...(init?.headers || {}), Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    })
  }
  const authedFetch = (init?: RequestInit) => authedFetchTo('/api/voice-bank/admin', init)

  const refresh = async () => {
    try {
      const res = await authedFetch()
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Kunne ikke hente stemmebanken'); return }
      setError(null)
      setTenantName(data.tenant?.name || '')
      setActors(data.actors || [])
      setEvents(data.events || [])
      setMonthly(data.monthly || [])
      setFees(data.fees || null)
      setMonthInfraNok(Number(data.monthInfraNok) || 0)
      setMonthLicenseNok(Number(data.monthLicenseNok) || 0)
      setSubsCount(Number(data.subscriptionCount) || 0)
      setSubsNok(Number(data.subscriptionNok) || 0)
      try {
        const { data: sess } = await getSupabase().auth.getSession()
        const token = sess?.session?.access_token
        const cd = await fetch('/api/characters', token ? { headers: { Authorization: `Bearer ${token}` } } : undefined).then((r) => r.json())
        setOwnChars((cd.characters || []).filter((c: any) => c.status === 'ready').map((c: any) => ({ id: c.id, name: c.name })))
      } catch { /* karakterliste utilgjengelig */ }
      try {
        const ares = await authedFetchTo('/api/voice-bank/applications')
        const adata = await ares.json()
        if (ares.ok) {
          setApplications(adata.applications || [])
          setAcceptApps(adata.acceptApplications === true)
          setAppsMigrated(adata.migrated !== false)
        }
      } catch { /* søknadskøen er valgfri */ }
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { refresh() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const addActor = async () => {
    setFError(null)
    if (!fName.trim()) { setFError(t('err_name')); return }
    if (!fHasVoice && !fHasFace) { setFError('Velg minst ett aktivum: stemme eller ansikt.'); return }
    if (fHasVoice && !fVoiceId.trim()) { setFError(t('err_voice_id')); return }
    if (fHasFace && !fFaceCharId.trim()) { setFError('Velg karakteren (ansiktet) raden skal forvalte.'); return }
    if (fRate === '' || fPrice === '' || isNaN(Number(fRate)) || isNaN(Number(fPrice))) {
      setFError('Fyll ut begge satsene som tall.'); return
    }
    setFBusy(true)
    try {
      const res = await authedFetch({
        method: 'POST',
        body: JSON.stringify({
          name: fName.trim(),
          elevenlabsVoiceId: fVoiceId.trim(),
          honorariumNok: Number(fHonorar) || 0,
          actorRateNok: Number(fRate),
          customerPriceNok: Number(fPrice),
          discountTiers: fTiers.map((t) => ({ from_uses: Number(t.from_uses), discount_pct: Number(t.discount_pct) })),
          isExclusive: fExclusive,
          hasVoice: fHasVoice,
          faceCharacterId: fHasFace ? fFaceCharId.trim() : null,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Kunne ikke legge til skuespilleren')
      setFName(''); setFVoiceId(''); setFHonorar(''); setFRate(''); setFPrice(''); setFTiers([]); setFExclusive(true)
      setFHasVoice(true); setFHasFace(false); setFFaceCharId('')
      setShowForm(false)
      await refresh()
    } catch (err: any) {
      setFError(err.message)
    } finally {
      setFBusy(false)
    }
  }

  const toggleActive = async (a: Actor) => {
    try {
      const res = await authedFetch({ method: 'PATCH', body: JSON.stringify({ actorId: a.id, isActive: !a.is_active }) })
      if (res.ok) await refresh()
    } catch { /* vis gammel status */ }
  }

  // Bulk: sett eksklusivitet for HELE banken (Både Og-scenariet: 100 stemmer på én gang)
  const setAllExclusive = async (exclusive: boolean) => {
    const ids = actors.map((a) => a.id)
    if (ids.length === 0) return
    const verb = exclusive ? 'eksklusive for denne banken' : 'delt med hele plattformen'
    if (!confirm(`Sette alle ${ids.length} skuespillere som ${verb}?`)) return
    setBulkBusy(true)
    try {
      const res = await authedFetch({ method: 'PATCH', body: JSON.stringify({ actorIds: ids, isExclusive: exclusive }) })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Bulk-endringen feilet')
      await refresh()
    } catch (err: any) {
      alert(err.message)
    } finally {
      setBulkBusy(false)
    }
  }

  const toggleAcceptApps = async () => {
    try {
      const res = await authedFetchTo('/api/voice-bank/applications', { method: 'PATCH', body: JSON.stringify({ toggleAccept: !acceptApps }) })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Kunne ikke endre bryteren')
      setAcceptApps(data.acceptApplications === true)
    } catch (err: any) {
      alert(err.message)
    }
  }

  const decideApplication = async (app: VoiceApplication, decision: 'approved' | 'rejected') => {
    if (decision === 'rejected' && !confirm(t('apps_confirm_reject', { name: app.name }))) return
    setAppBusy(app.id)
    try {
      const res = await authedFetchTo('/api/voice-bank/applications', { method: 'PATCH', body: JSON.stringify({ applicationId: app.id, decision }) })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Beslutningen feilet')
      if (decision === 'approved' && data.actorId) {
        window.location.href = `/dashboard/voice-bank/${data.actorId}`
        return
      }
      await refresh()
    } catch (err: any) {
      alert(err.message)
    } finally {
      setAppBusy(null)
    }
  }

  const actorName = (id: string) => actors.find((a) => a.id === id)?.name || t('unknown')
  const totals = monthly.reduce(
    (s, m) => ({ uses: s.uses + m.uses, to: s.to + m.to_actor_nok, from: s.from + m.from_customers_nok, cut: s.cut + m.cut_nok }),
    { uses: 0, to: 0, from: 0, cut: 0 }
  )

  return (
    <div className="min-h-screen bg-[var(--paper)]">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <Link href="/dashboard" className="text-[var(--ember-deep)] hover:text-[var(--ink)] mb-4 inline-block">{t('back')}</Link>
        <h1 className="text-3xl font-bold text-gray-900 mb-2">{t('h1')}</h1>
        <p className="text-gray-600 mb-8">
          {t('intro', { who: tenantName ? t('intro_who_tenant', { tenant: tenantName }) : t('intro_who') })}
        </p>

        {loading && <p className="text-gray-500">{t('loading')}</p>}
        {error && (
          <div className="p-4 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
            {error === 'Ikke innlogget' ? t('err_login') : error}
          </div>
        )}

        {!loading && !error && (
          <>
            {/* Månedens tall */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
              {[
                { label: t('card_uses'), value: String(totals.uses) },
                { label: t('card_from'), value: nok(totals.from) },
                { label: t('card_to'), value: nok(totals.to) },
                ...(fees ? [{ label: t('card_infra', { pct: fees.infraPct }), value: nok(monthInfraNok) }] : []),
                ...(fees?.licenseTo ? [{ label: t('card_licence', { to: fees.licenseTo, pct: fees.licensePct }), value: nok(monthLicenseNok) }] : []),
                { label: fees ? t('card_cut_net') : t('card_cut'), value: nok(totals.cut - monthInfraNok - monthLicenseNok) },
              ].map((c) => (
                <div key={c.label} className="bg-[var(--paper-raised)] rounded-lg border border-gray-200 p-4">
                  <div className="text-xs text-gray-500 mb-1">{c.label}</div>
                  <div className="text-xl font-bold text-gray-900">{c.value}</div>
                </div>
              ))}
            </div>
            {subsCount > 0 && (
              <p className="text-xs text-gray-400 -mt-5 mb-8">
                {t(subsCount === 1 ? 'subs_note_one' : 'subs_note', { n: subsCount, sum: nok(subsNok) })}
              </p>
            )}

            {/* Månedsrutinen: hvem har noe til gode, og før dem som betalt */}
            <div className="mb-8 -mt-2">
              <Link href="/dashboard/voice-bank/utbetaling"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold border border-gray-300 hover:border-[var(--ember-deep)] text-gray-800">
                {t('payout_link')}
              </Link>
              <span className="ml-3 text-xs text-gray-500">{t('payout_hint')}</span>
            </div>

            {/* Skuespillere */}
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold text-gray-900">{t('actors_h2')}</h2>
              <button
                onClick={() => { setShowForm(!showForm); setFError(null) }}
                className="px-4 py-2 rounded-lg text-sm font-semibold text-[var(--on-ember)] bg-[var(--ember-deep)] hover:opacity-90 transition-opacity"
              >
                {showForm ? t('cancel') : t('add_actor')}
              </button>
            </div>

            {showForm && (
              <div className="bg-[var(--paper-raised)] rounded-lg border border-gray-200 p-6 mb-6">
                <div className="flex gap-5 mb-4 text-sm text-gray-700">
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={fHasVoice} onChange={(e) => setFHasVoice(e.target.checked)} />
                    {t('f_voice')}
                  </label>
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={fHasFace} onChange={(e) => setFHasFace(e.target.checked)} />
                    {t('f_face')}
                  </label>
                  <span className="text-xs text-gray-400 self-center">{t('f_row_hint')}</span>
                </div>
                <div className="grid sm:grid-cols-2 gap-4 mb-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{t('f_name')}</label>
                    <input value={fName} onChange={(e) => setFName(e.target.value)} placeholder={t('f_name_ph')}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                  </div>
                  {fHasVoice && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">{t('f_voice_id')}</label>
                      <input value={fVoiceId} onChange={(e) => setFVoiceId(e.target.value)} placeholder={t('f_voice_id_ph')}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono" />
                    </div>
                  )}
                  {fHasFace && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">{t('f_face_char')}</label>
                      <select value={fFaceCharId} onChange={(e) => setFFaceCharId(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-[var(--paper-raised)]">
                        <option value="">{t('f_face_pick')}</option>
                        {ownChars.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                      <p className="text-xs text-gray-400 mt-1">{t('f_face_hint_a')}<a href="/dashboard/characters" className="underline">{t('f_face_hint_link')}</a>{t('f_face_hint_b')}</p>
                    </div>
                  )}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{t('f_fee')}</label>
                    <input value={fHonorar} onChange={(e) => setFHonorar(e.target.value)} placeholder="0" inputMode="decimal"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                    <p className="text-xs text-gray-400 mt-1">{t('f_fee_hint')}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">{t('f_rate')}</label>
                      <input value={fRate} onChange={(e) => setFRate(e.target.value)} placeholder="150" inputMode="decimal"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">{t('f_price')}</label>
                      <input value={fPrice} onChange={(e) => setFPrice(e.target.value)} placeholder="250" inputMode="decimal"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                    </div>
                  </div>
                </div>

                <label className="block text-sm font-medium text-gray-700 mb-1">{t('f_tiers')}</label>
                <p className="text-xs text-gray-400 mb-2">{t('f_tiers_hint')}</p>
                {fTiers.map((trinn, i) => (
                  <div key={i} className="flex items-center gap-2 mb-2 text-sm">
                    <span className="text-gray-600">{t('f_tier_from')}</span>
                    <input value={trinn.from_uses} onChange={(e) => setFTiers(fTiers.map((x, j) => j === i ? { ...x, from_uses: e.target.value } : x))}
                      inputMode="numeric" className="w-20 px-2 py-1.5 border border-gray-300 rounded-lg" />
                    <span className="text-gray-600">{t('f_tier_uses')}</span>
                    <input value={trinn.discount_pct} onChange={(e) => setFTiers(fTiers.map((x, j) => j === i ? { ...x, discount_pct: e.target.value } : x))}
                      inputMode="numeric" className="w-16 px-2 py-1.5 border border-gray-300 rounded-lg" />
                    <span className="text-gray-600">{t('f_tier_pct')}</span>
                    <button onClick={() => setFTiers(fTiers.filter((_, j) => j !== i))} className="text-red-500 hover:text-red-700 ml-1">{t('f_tier_remove')}</button>
                  </div>
                ))}
                <button onClick={() => setFTiers([...fTiers, { from_uses: '', discount_pct: '' }])}
                  className="text-sm text-[var(--ember-deep)] hover:underline mb-4">{t('f_tier_add')}</button>

                <label className="flex items-center gap-2 text-sm text-gray-700 mb-4">
                  <input type="checkbox" checked={fExclusive} onChange={(e) => setFExclusive(e.target.checked)} />
                  {t('f_exclusive')}
                </label>

                {fError && <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">{fError}</div>}

                <div>
                  <button onClick={addActor} disabled={fBusy}
                    className="px-5 py-2.5 rounded-lg font-semibold text-[var(--on-ember)] bg-[var(--ember-deep)] hover:opacity-90 disabled:opacity-50 transition-opacity">
                    {fBusy ? t('saving') : t('save_actor')}
                  </button>
                </div>
              </div>
            )}
            {actors.length === 0 ? (
              <p className="text-sm text-gray-500 mb-8">{t('none_registered')}</p>
            ) : (
              <>
              <div className="flex items-center gap-3 mb-2">
                <span className="text-xs text-gray-500">{t('bulk_label')}</span>
                <button onClick={() => setAllExclusive(true)} disabled={bulkBusy}
                  className="text-xs px-3 py-1.5 rounded-lg border border-gray-300 hover:border-[var(--ember-deep)] disabled:opacity-50">
                  {t('bulk_exclusive')}
                </button>
                <button onClick={() => setAllExclusive(false)} disabled={bulkBusy}
                  className="text-xs px-3 py-1.5 rounded-lg border border-gray-300 hover:border-[var(--ember-deep)] disabled:opacity-50">
                  {t('bulk_shared')}
                </button>
                {bulkBusy && <span className="text-xs text-gray-400">{t('bulk_busy')}</span>}
              </div>
              <div className="bg-[var(--paper-raised)] rounded-lg border border-gray-200 overflow-x-auto mb-8">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-gray-500 border-b border-gray-200">
                      <th className="px-4 py-2">{t('th_name')}</th>
                      <th className="px-4 py-2">{t('th_to_actor')}</th>
                      <th className="px-4 py-2">{t('th_price')}</th>
                      <th className="px-4 py-2">{t('th_tiers')}</th>
                      <th className="px-4 py-2">{t('th_uses_month')}</th>
                      <th className="px-4 py-2">{t('th_assets')}</th>
                      <th className="px-4 py-2">{t('th_access')}</th>
                      <th className="px-4 py-2">{t('th_status')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {actors.map((a) => {
                      const m = monthly.find((x) => x.actor_id === a.id)
                      return (
                        <tr key={a.id} className="border-b border-gray-100 last:border-0">
                          <td className="px-4 py-2 font-medium">
                            <Link href={`/dashboard/voice-bank/${a.id}`} className="text-[var(--ember-deep)] hover:underline">{a.name}</Link>
                          </td>
                          <td className="px-4 py-2">{nok(a.actor_rate_nok)}</td>
                          <td className="px-4 py-2">{nok(a.customer_price_nok)}</td>
                          <td className="px-4 py-2 text-gray-600">
                            {(a.discount_tiers || []).length === 0
                              ? '—'
                              : a.discount_tiers.map((x) => t('tier_line', { pct: x.discount_pct, from: x.from_uses })).join(', ')}
                          </td>
                          <td className="px-4 py-2">{m?.uses ?? 0}</td>
                          <td className="px-4 py-2">
                            {a.elevenlabs_voice_id && a.face_character_id ? '🎙️🧑' : a.elevenlabs_voice_id ? '🎙️' : a.face_character_id ? '🧑' : t('waiting_clone')}
                          </td>
                          <td className="px-4 py-2" title={a.is_exclusive !== false ? t('access_excl_title') : t('access_shared_title')}>
                            {a.is_exclusive !== false ? t('access_exclusive') : t('access_shared')}
                          </td>
                          <td className="px-4 py-2">
                            <button
                              onClick={() => toggleActive(a)}
                              title={a.is_active ? t('toggle_off_title') : t('toggle_on_title')}
                              className={`hover:underline ${a.is_active ? 'text-green-700' : 'text-gray-400'}`}
                            >
                              {a.is_active ? t('active') : t('inactive')}
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              </>
            )}

            {/* Drop-in-søknader («Bli en stemme i banken») */}
            {appsMigrated && (
              <div className="mb-8">
                <div className="bg-[var(--paper-raised)] rounded-lg border border-gray-200 p-4 mb-3 flex flex-wrap items-center gap-3">
                  <div className="flex-1 min-w-[240px]">
                    <div className="font-semibold text-gray-900 text-sm">{t('apps_title')}</div>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {acceptApps
                        ? <>{t('apps_on')} <span className="font-mono">{typeof window !== 'undefined' ? `${window.location.origin}/bli-stemme` : '/bli-stemme'}</span></>
                        : t('apps_off')}
                    </p>
                  </div>
                  <button onClick={toggleAcceptApps}
                    className={`px-4 py-2 rounded-lg text-sm font-semibold ${acceptApps ? 'bg-gray-100 text-gray-700 hover:bg-gray-200' : 'text-[var(--on-ember)] bg-[var(--ember-deep)] hover:opacity-90'}`}>
                    {acceptApps ? t('apps_turn_off') : t('apps_turn_on')}
                  </button>
                </div>

                {applications.filter((a) => a.status === 'new').length > 0 && (
                  <>
                    <h2 className="font-semibold text-gray-900 mb-3">
                      {t('apps_h2', { n: applications.filter((a) => a.status === 'new').length })}
                    </h2>
                    <div className="space-y-3">
                      {applications.filter((a) => a.status === 'new').map((app) => (
                        <div key={app.id} className="bg-[var(--paper-raised)] rounded-lg border border-gray-200 p-4">
                          <div className="flex flex-wrap items-start gap-3">
                            <div className="flex-1 min-w-[220px]">
                              <div className="font-semibold text-gray-900">{app.name}{app.wants_face && <span className="ml-2 text-xs bg-purple-50 text-purple-700 border border-purple-200 rounded-full px-2 py-0.5">{t('apps_plus_face')}</span>}</div>
                              <div className="text-xs text-gray-500">{app.email}{app.phone ? ` · ${app.phone}` : ''} · {String(app.created_at).slice(0, 10)}</div>
                              {app.bio && <p className="text-sm text-gray-600 mt-1">{app.bio}</p>}
                              <div className="flex flex-wrap gap-2 mt-2">
                                {(app.sample_urls || []).map((u, i) => (
                                  <audio key={i} controls preload="none" src={u} className="h-9" />
                                ))}
                              </div>
                            </div>
                            <div className="flex gap-2">
                              <button onClick={() => decideApplication(app, 'approved')} disabled={appBusy === app.id}
                                className="px-3 py-1.5 rounded-lg text-sm font-semibold text-white bg-green-700 hover:opacity-90 disabled:opacity-50">
                                {t('apps_approve')}
                              </button>
                              <button onClick={() => decideApplication(app, 'rejected')} disabled={appBusy === app.id}
                                className="px-3 py-1.5 rounded-lg text-sm text-gray-600 border border-gray-300 hover:border-red-400 hover:text-red-600 disabled:opacity-50">
                                {t('apps_reject')}
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Royalty-logg */}
            <h2 className="font-semibold text-gray-900 mb-3">{t('events_h2')}</h2>
            {events.length === 0 ? (
              <p className="text-sm text-gray-500">{t('events_none')}</p>
            ) : (
              <div className="bg-[var(--paper-raised)] rounded-lg border border-gray-200 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-gray-500 border-b border-gray-200">
                      <th className="px-4 py-2">{t('th_time')}</th>
                      <th className="px-4 py-2">{t('th_actor')}</th>
                      <th className="px-4 py-2">{t('th_type')}</th>
                      <th className="px-4 py-2">{t('th_to_actor')}</th>
                      <th className="px-4 py-2">{t('th_price')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {events.map((e) => (
                      <tr key={e.id} className="border-b border-gray-100 last:border-0">
                        <td className="px-4 py-2 text-gray-600">{new Date(e.created_at).toLocaleString(bcp)}</td>
                        <td className="px-4 py-2 font-medium text-gray-900">{actorName(e.actor_id)}</td>
                        <td className="px-4 py-2">{e.meta?.kind ? (t.has(`kind_${e.meta.kind}`) ? t(`kind_${e.meta.kind}`) : e.meta.kind) : '—'}</td>
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
