'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useTranslations, useLocale } from 'next-intl'
import { getSupabase } from '@/lib/supabaseClient'

// Utbetalingslisten (Lars 17/9) — månedsrutinen for å betale rettighetshaverne.
//
// Pengene går IKKE gjennom systemet: du betaler i nettbanken, og fører det her
// etterpå. Siden gjør de tre tingene som ellers tar tid: finner hvem som har noe
// til gode, summerer det eksakt fra hovedboken, og fører alle som betalt i ett
// klikk. Serveren validerer hvert beløp mot hovedboken, så det kan aldri føres
// mer enn det som skyldes — heller ikke ved dobbeltklikk.

interface Rad {
  actorId: string
  name: string
  email: string | null
  isActive: boolean
  uses: number
  earnedNok: number
  paidNok: number
  dueNok: number
  periodeFra: string
  periodeTil: string
  sistUtbetalt: string | null
}

const BCP47: Record<string, string> = { no: 'nb-NO', en: 'en-GB' }

export default function UtbetalingslistePage() {
  const t = useTranslations('payouts')
  const locale = useLocale()
  const bcp = BCP47[locale] || 'en-GB'
  const nok = (n: number) => `${(Math.round(n * 100) / 100).toLocaleString(bcp, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kr`
  const dato = (s: string) => new Date(s + (s.length === 10 ? 'T00:00:00' : '')).toLocaleDateString(bcp, { day: 'numeric', month: 'short', year: 'numeric' })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tenantName, setTenantName] = useState('')
  const [rader, setRader] = useState<Rad[]>([])
  // Terskelen: småbeløp blir stående til neste gang i stedet for å koste en
  // bankoverføring hver. Ikke lagret — rutinen bestemmer den fra gang til gang.
  const [terskel, setTerskel] = useState('200')
  // Hvem er krysset av. null = «følg terskelen» (standard); et sett = brukeren
  // har overstyrt, og da rører ikke terskelen valgene mer.
  const [valgt, setValgt] = useState<Set<string> | null>(null)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [kvittering, setKvittering] = useState<string | null>(null)

  const authedFetch = async (url: string, init?: RequestInit) => {
    const { data: sess } = await getSupabase().auth.getSession()
    const token = sess?.session?.access_token
    if (!token) throw new Error('Ikke innlogget')
    return fetch(url, { ...init, headers: { ...(init?.headers || {}), Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } })
  }

  // «loading» starter som true og skrus bare AV her: første henting trenger
  // ingen synkron setState i effekten, og en oppfrisking etter føring beholder
  // tabellen på skjermen i stedet for å blinke til «Henter …».
  const hent = async () => {
    try {
      const res = await authedFetch('/api/voice-bank/payouts?liste=1')
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'Kunne ikke hente utbetalingslisten')
      setError(null)
      setTenantName(d.tenant?.name || '')
      setRader(d.rader || [])
      setValgt(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : t('err_fetch'))
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { hent() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const terskelNok = Math.max(0, Number(String(terskel).replace(',', '.')) || 0)
  const tilGode = useMemo(() => rader.filter((r) => r.dueNok > 0).sort((a, b) => b.dueNok - a.dueNok), [rader])
  const erValgt = (r: Rad) => (valgt ? valgt.has(r.actorId) : r.dueNok >= terskelNok)
  const valgte = tilGode.filter(erValgt)
  const sumValgt = valgte.reduce((s, r) => s + r.dueNok, 0)
  const sumAlt = tilGode.reduce((s, r) => s + r.dueNok, 0)

  const toggle = (r: Rad) => {
    const neste = new Set(valgt ?? tilGode.filter((x) => x.dueNok >= terskelNok).map((x) => x.actorId))
    if (neste.has(r.actorId)) neste.delete(r.actorId); else neste.add(r.actorId)
    setValgt(neste)
  }

  // CSV til nettbanken / regnskapet. Semikolon + BOM: åpner riktig i norsk Excel.
  const lastNedCsv = () => {
    const felt = (s: string) => `"${String(s).replace(/"/g, '""')}"`
    // Norsk Excel forventer semikolon og desimalkomma; engelsk forventer
    // komma og desimalpunktum. Samme fil i feil form legger alt i én kolonne.
    const sep = locale === 'no' ? ';' : ','
    const tall = (n: number) => (locale === 'no' ? n.toFixed(2).replace('.', ',') : n.toFixed(2))
    const linjer = [
      [t('csv_name'), t('csv_email'), t('csv_amount'), t('csv_from'), t('csv_to'), t('csv_uses')].map(felt).join(sep),
      ...valgte.map((r) => [r.name, r.email || '', tall(r.dueNok), r.periodeFra, r.periodeTil, String(r.uses)].map(felt).join(sep)),
      [t('csv_sum'), '', tall(sumValgt), '', '', ''].map(felt).join(sep),
    ]
    const blob = new Blob(['﻿' + linjer.join('\r\n')], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `${t('csv_file')}-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const foer = async () => {
    if (valgte.length === 0) return
    const ok = confirm(
      t(valgte.length === 1 ? 'confirm_one' : 'confirm_many', { n: valgte.length, sum: nok(sumValgt) })
    )
    if (!ok) return
    setBusy(true); setError(null); setKvittering(null)
    try {
      const res = await authedFetch('/api/voice-bank/payouts', {
        method: 'POST',
        body: JSON.stringify({
          note: note.trim() || null,
          items: valgte.map((r) => ({ actorId: r.actorId, amountNok: r.dueNok, periodeFra: r.periodeFra, periodeTil: r.periodeTil })),
        }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || t('err_record'))
      setKvittering(t(d.antall === 1 ? 'receipt_one' : 'receipt_many', { n: d.antall, sum: nok(d.sumNok) }))
      setNote('')
      await hent()
    } catch (e) {
      setError(e instanceof Error ? e.message : t('err_record'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen bg-[var(--paper)]">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <Link href="/dashboard/voice-bank" className="text-[var(--ember-deep)] hover:text-[var(--ink)] mb-4 inline-block">{t('back')}</Link>
        <h1 className="text-3xl font-bold text-gray-900 mb-2">{t('h1')}</h1>
        <p className="text-gray-600 mb-6 max-w-2xl">
          {t('intro', { tenant: tenantName || t('the_bank') })}
        </p>

        {loading && <p className="text-gray-500">{t('loading')}</p>}
        {error && <div className="mb-6 p-4 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">{error}</div>}
        {kvittering && <div className="mb-6 p-4 rounded-lg bg-green-50 border border-green-200 text-sm text-green-800">{kvittering}</div>}

        {!loading && !error && tilGode.length === 0 && (
          <div className="bg-[var(--paper-raised)] rounded-lg border border-gray-200 p-6 text-sm text-gray-600">
            {t('none_due_a')}{t(rader.length === 0 ? 'none_due_empty' : 'none_due_paid')}
          </div>
        )}

        {!loading && tilGode.length > 0 && (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6">
              {[
                { label: t('card_all'), value: nok(sumAlt) },
                { label: t('card_selected', { n: valgte.length }), value: nok(sumValgt) },
                { label: t('card_held'), value: nok(sumAlt - sumValgt) },
              ].map((c) => (
                <div key={c.label} className="bg-[var(--paper-raised)] rounded-lg border border-gray-200 p-4">
                  <div className="text-xs text-gray-500 mb-1">{c.label}</div>
                  <div className="text-xl font-bold text-gray-900">{c.value}</div>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap items-end gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('threshold')}</label>
                <input value={terskel} onChange={(e) => { setTerskel(e.target.value); setValgt(null) }} inputMode="decimal"
                  className="w-28 px-3 py-2 border border-gray-300 rounded-lg text-sm" />
              </div>
              <p className="text-xs text-gray-500 max-w-md pb-2">
                {t('threshold_hint')}
              </p>
            </div>

            <div className="bg-[var(--paper-raised)] rounded-lg border border-gray-200 overflow-x-auto mb-6">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-gray-500 border-b border-gray-200">
                    <th className="px-4 py-2 w-8"></th>
                    <th className="px-4 py-2">{t('th_holder')}</th>
                    <th className="px-4 py-2">{t('th_period')}</th>
                    <th className="px-4 py-2 text-right">{t('th_earned')}</th>
                    <th className="px-4 py-2 text-right">{t('th_paid')}</th>
                    <th className="px-4 py-2 text-right">{t('th_due')}</th>
                  </tr>
                </thead>
                <tbody>
                  {tilGode.map((r) => {
                    const paa = erValgt(r)
                    return (
                      <tr key={r.actorId} className={`border-b border-gray-100 last:border-0 ${paa ? '' : 'opacity-55'}`}>
                        <td className="px-4 py-2">
                          <input type="checkbox" checked={paa} onChange={() => toggle(r)} aria-label={t('include', { name: r.name })} />
                        </td>
                        <td className="px-4 py-2">
                          <Link href={`/dashboard/voice-bank/${r.actorId}`} className="font-medium text-[var(--ember-deep)] hover:underline">{r.name}</Link>
                          <div className="text-xs text-gray-500">
                            {r.email || <span className="text-amber-700">{t('no_email')}</span>}
                            {!r.isActive && <span className="ml-2 text-gray-400">{t('inactive')}</span>}
                          </div>
                        </td>
                        <td className="px-4 py-2 text-gray-600 whitespace-nowrap">{dato(r.periodeFra)} – {dato(r.periodeTil)}</td>
                        <td className="px-4 py-2 text-right text-gray-600">{nok(r.earnedNok)}</td>
                        <td className="px-4 py-2 text-right text-gray-600">{nok(r.paidNok)}</td>
                        <td className="px-4 py-2 text-right font-semibold text-gray-900">{nok(r.dueNok)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            <div className="bg-[var(--paper-raised)] rounded-lg border border-gray-200 p-5">
              <ol className="text-sm text-gray-700 space-y-1 mb-4 list-decimal list-inside">
                <li>{t('step_1')}</li>
                <li>{t('step_2')}</li>
              </ol>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('note_label')}</label>
              <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} placeholder={t('note_ph')}
                className="w-full max-w-xl px-3 py-2 border border-gray-300 rounded-lg text-sm mb-4" />
              <div className="flex flex-wrap gap-3 items-center">
                <button onClick={lastNedCsv} disabled={valgte.length === 0}
                  className="px-4 py-2.5 rounded-lg text-sm font-semibold border border-gray-300 hover:border-[var(--ember-deep)] disabled:opacity-50">
                  {t('download')}
                </button>
                <button onClick={foer} disabled={busy}
                  className="px-5 py-2.5 rounded-lg font-semibold text-[var(--on-ember)] bg-[var(--ember-deep)] hover:opacity-90 disabled:opacity-60 transition-opacity">
                  {busy ? t('recording') : valgte.length === 0 ? t('record_empty') : t('record_n', { n: valgte.length, sum: nok(sumValgt) })}
                </button>
                {valgte.length === 0 && !busy && <span className="text-sm text-amber-700">{t('none_ticked')}</span>}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
