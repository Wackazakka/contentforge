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
  // Byråets andel av det som er til gode (117) — trekkes fra hennes del og
  // betales byrået som egen overføring.
  dueAgentNok?: number
  agency?: { name: string; pct: number } | null
  periodeFra: string
  periodeTil: string
  sistUtbetalt: string | null
}

// Byråenes oppgjør (097/117): det som er frosset på skuespillernes
// utbetalinger og ikke betalt videre. Én overføring per byrå.
interface Byraa {
  agentId: string
  name: string
  email: string | null
  orgNr: string | null
  earnedNok: number
  paidNok: number
  dueNok: number
  sistTil: string | null
}

// Utlegg ved onboarding (126): stemmeabonnementet hun betalte med sitt eget
// kort, og som vi eller byrået dekker. Ikke opptjening — egen liste.
interface Utlegg {
  id: string
  actorId: string
  actorName: string
  actorEmail: string | null
  amountNok: number
  amountUsd: number | null
  payer: 'platform' | 'agency'
  agentName: string | null
  refundedAt: string | null
  createdAt: string
}
interface Fakturering { agentId: string; name: string; sumNok: number; items: Utlegg[] }

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
  const [byraaer, setByraaer] = useState<Byraa[]>([])
  // Terskelen: småbeløp blir stående til neste gang i stedet for å koste en
  // bankoverføring hver. Ikke lagret — rutinen bestemmer den fra gang til gang.
  const [terskel, setTerskel] = useState('200')
  // Hvem er krysset av. null = «følg terskelen» (standard); et sett = brukeren
  // har overstyrt, og da rører ikke terskelen valgene mer.
  const [valgt, setValgt] = useState<Set<string> | null>(null)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [kvittering, setKvittering] = useState<string | null>(null)
  const [refusjoner, setRefusjoner] = useState<Utlegg[]>([])
  const [fakturaer, setFakturaer] = useState<Fakturering[]>([])

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
      setByraaer(d.byraaer || [])
      setValgt(null)
      // Utleggene (126) i eget kall: feiler det (migrasjonen ikke kjørt), står
      // utbetalingslisten likevel.
      try {
        const u = await (await authedFetch('/api/voice-bank/onboarding?liste=1')).json()
        setRefusjoner(u.toRefund || [])
        setFakturaer(u.toInvoice || [])
      } catch { /* listen over står */ }
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
    // Byråets andel står på samme linje (117): den betales byrået som egen
    // overføring etter at skuespilleren er ført som betalt.
    const sumByraa = valgte.reduce((s, r) => s + (r.dueAgentNok ?? 0), 0)
    const linjer = [
      [t('csv_name'), t('csv_email'), t('csv_amount'), t('csv_from'), t('csv_to'), t('csv_uses'), t('csv_agency'), t('csv_agency_amount')].map(felt).join(sep),
      ...valgte.map((r) => [r.name, r.email || '', tall(r.dueNok), r.periodeFra, r.periodeTil, String(r.uses), r.agency?.name || '', tall(r.dueAgentNok ?? 0)].map(felt).join(sep)),
      [t('csv_sum'), '', tall(sumValgt), '', '', '', '', tall(sumByraa)].map(felt).join(sep),
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
      setKvittering(
        t(d.antall === 1 ? 'receipt_one' : 'receipt_many', { n: d.antall, sum: nok(d.sumNok) })
        + (d.byraaNok > 0 ? ' ' + t('receipt_agency', { sum: nok(d.byraaNok) }) : '')
      )
      setNote('')
      await hent()
    } catch (e) {
      setError(e instanceof Error ? e.message : t('err_record'))
    } finally {
      setBusy(false)
    }
  }

  // Byrået betales som ÉN overføring for hele stallen (097). Perioden går fra
  // dagen etter forrige oppgjør til i dag; beløpet valideres på serveren.
  const foerByraa = async (b: Byraa) => {
    if (!confirm(t('agency_confirm', { name: b.name, sum: nok(b.dueNok) }))) return
    setBusy(true); setError(null); setKvittering(null)
    try {
      const idag = new Date().toISOString().slice(0, 10)
      let fra = idag
      if (b.sistTil) { const d = new Date(b.sistTil + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + 1); fra = d.toISOString().slice(0, 10) }
      if (fra > idag) fra = idag
      const res = await authedFetch('/api/voice-bank/payouts', {
        method: 'POST',
        body: JSON.stringify({ agentPayout: { agentId: b.agentId, amountNok: b.dueNok, periodeFra: fra, periodeTil: idag } }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || t('err_record'))
      setKvittering(t('agency_receipt', { name: b.name, sum: nok(d.sumNok) }))
      await hent()
    } catch (e) {
      setError(e instanceof Error ? e.message : t('err_record'))
    } finally {
      setBusy(false)
    }
  }
  const byraaTilGode = byraaer.filter((b) => b.dueNok > 0)

  // Refusjonen er overført i nettbanken — før den her.
  const foerRefusjon = async (u: Utlegg) => {
    if (!confirm(t('ob_refund_confirm', { sum: nok(u.amountNok), name: u.actorName }))) return
    setBusy(true); setError(null); setKvittering(null)
    try {
      const res = await authedFetch('/api/voice-bank/onboarding', { method: 'PATCH', body: JSON.stringify({ id: u.id, action: 'refunded' }) })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || t('err_record'))
      setKvittering(t('ob_refund_receipt', { sum: nok(u.amountNok), name: u.actorName }))
      await hent()
    } catch (e) { setError(e instanceof Error ? e.message : t('err_record')) } finally { setBusy(false) }
  }

  // Fakturagrunnlaget til byrået: én linje per skuespiller.
  const lastNedFaktura = (f: Fakturering) => {
    const felt = (s: string) => `"${String(s).replace(/"/g, '""')}"`
    const sep = locale === 'no' ? ';' : ','
    const tall = (n: number) => (locale === 'no' ? n.toFixed(2).replace('.', ',') : n.toFixed(2))
    const linjer = [
      [t('csv_name'), t('csv_email'), t('ob_csv_usd'), t('csv_amount'), t('ob_csv_refunded')].map(felt).join(sep),
      ...f.items.map((u) => [u.actorName, u.actorEmail || '', u.amountUsd != null ? tall(u.amountUsd) : '', tall(u.amountNok), (u.refundedAt || '').slice(0, 10)].map(felt).join(sep)),
      [t('csv_sum'), '', '', tall(f.sumNok), ''].map(felt).join(sep),
    ]
    const blob = new Blob(['\ufeff' + linjer.join('\r\n')], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `${t('ob_csv_file')}-${f.name.replace(/[^\p{L}\p{N}]+/gu, '-')}-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const foerFakturert = async (f: Fakturering) => {
    if (!confirm(t('ob_invoice_confirm', { name: f.name, sum: nok(f.sumNok) }))) return
    setBusy(true); setError(null); setKvittering(null)
    try {
      const res = await authedFetch('/api/voice-bank/onboarding', { method: 'PATCH', body: JSON.stringify({ agentId: f.agentId, action: 'invoiced' }) })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || t('err_record'))
      setKvittering(t('ob_invoice_receipt', { name: f.name, sum: nok(d.sumNok) }))
      await hent()
    } catch (e) { setError(e instanceof Error ? e.message : t('err_record')) } finally { setBusy(false) }
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

        {/* Utlegg ved onboarding (126). Står øverst: Lars vil at refusjonen
            skjer med en gang, så det som venter her, er noe som haster. */}
        {!loading && refusjoner.length > 0 && (
          <div className="mb-10">
            <h2 className="font-semibold text-gray-900 mb-1">{t('ob_h2')}</h2>
            <p className="text-sm text-gray-600 mb-3 max-w-2xl">{t('ob_intro')}</p>
            <div className="bg-[var(--paper-raised)] rounded-lg border border-amber-200 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-gray-500 border-b border-gray-200">
                    <th className="px-4 py-2">{t('th_holder')}</th>
                    <th className="px-4 py-2">{t('ob_th_payer')}</th>
                    <th className="px-4 py-2">{t('ob_th_paid')}</th>
                    <th className="px-4 py-2 text-right">{t('ob_th_amount')}</th>
                    <th className="px-4 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {refusjoner.map((u) => (
                    <tr key={u.id} className="border-b border-gray-100 last:border-0">
                      <td className="px-4 py-2">
                        <Link href={`/dashboard/voice-bank/${u.actorId}`} className="font-medium text-[var(--ember-deep)] hover:underline">{u.actorName}</Link>
                        <div className="text-xs text-gray-500">{u.actorEmail || '—'}</div>
                      </td>
                      <td className="px-4 py-2 text-gray-600">{u.payer === 'agency' ? (u.agentName || '—') : t('ob_payer_platform')}</td>
                      <td className="px-4 py-2 text-gray-600 whitespace-nowrap">{dato(u.createdAt)}</td>
                      <td className="px-4 py-2 text-right font-semibold text-gray-900 whitespace-nowrap">{nok(u.amountNok)}</td>
                      <td className="px-4 py-2 text-right">
                        <button onClick={() => foerRefusjon(u)} disabled={busy}
                          className="px-3 py-1.5 rounded-lg text-xs font-semibold text-[var(--on-ember)] bg-[var(--ember-deep)] disabled:opacity-50 whitespace-nowrap">
                          {t('ob_refunded')}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

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
                    <th className="px-4 py-2 text-right">{t('th_agency')}</th>
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
                        <td className="px-4 py-2 text-right text-gray-600 whitespace-nowrap">
                          {r.agency && (r.dueAgentNok ?? 0) > 0
                            ? <span title={`${r.agency.name} · ${String(r.agency.pct).replace('.', ',')} %`}>{nok(r.dueAgentNok ?? 0)}<span className="block text-[11px] text-gray-400">{r.agency.name}</span></span>
                            : '—'}
                        </td>
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

        {/* Byråene (097/117). Andelen deres fryses når skuespilleren føres som
            betalt, og står her til den er betalt videre — én overføring per
            byrå for hele stallen. */}
        {!loading && byraaTilGode.length > 0 && (
          <div className="mt-10">
            <h2 className="font-semibold text-gray-900 mb-1">{t('agency_h2')}</h2>
            <p className="text-sm text-gray-600 mb-3 max-w-2xl">{t('agency_intro')}</p>
            <div className="bg-[var(--paper-raised)] rounded-lg border border-gray-200 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-gray-500 border-b border-gray-200">
                    <th className="px-4 py-2">{t('agency_th_name')}</th>
                    <th className="px-4 py-2 text-right">{t('agency_th_earned')}</th>
                    <th className="px-4 py-2 text-right">{t('th_paid')}</th>
                    <th className="px-4 py-2 text-right">{t('th_due')}</th>
                    <th className="px-4 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {byraaTilGode.map((b) => (
                    <tr key={b.agentId} className="border-b border-gray-100 last:border-0">
                      <td className="px-4 py-2">
                        <div className="font-medium text-gray-900">{b.name}</div>
                        <div className="text-xs text-gray-500">{b.email || '—'}{b.orgNr ? ` · ${b.orgNr}` : ''}</div>
                      </td>
                      <td className="px-4 py-2 text-right text-gray-600">{nok(b.earnedNok)}</td>
                      <td className="px-4 py-2 text-right text-gray-600">{nok(b.paidNok)}</td>
                      <td className="px-4 py-2 text-right font-semibold text-gray-900">{nok(b.dueNok)}</td>
                      <td className="px-4 py-2 text-right">
                        <button onClick={() => foerByraa(b)} disabled={busy}
                          className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-gray-300 hover:border-[var(--ember-deep)] disabled:opacity-50 whitespace-nowrap">
                          {t('agency_record')}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Byråer som dekker abonnementet (126): vi refunderte skuespilleren
            med en gang, og byrået faktureres samlet for det. */}
        {!loading && fakturaer.length > 0 && (
          <div className="mt-10">
            <h2 className="font-semibold text-gray-900 mb-1">{t('ob_invoice_h2')}</h2>
            <p className="text-sm text-gray-600 mb-3 max-w-2xl">{t('ob_invoice_intro')}</p>
            <div className="space-y-3">
              {fakturaer.map((f) => (
                <div key={f.agentId} className="bg-[var(--paper-raised)] rounded-lg border border-gray-200 p-4 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="font-medium text-gray-900">{f.name}</div>
                    <div className="text-xs text-gray-500">{t(f.items.length === 1 ? 'ob_invoice_count_one' : 'ob_invoice_count', { n: f.items.length })} · {nok(f.sumNok)}</div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button onClick={() => lastNedFaktura(f)}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-gray-300 hover:border-[var(--ember-deep)]">
                      {t('ob_invoice_download')}
                    </button>
                    <button onClick={() => foerFakturert(f)} disabled={busy}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-gray-300 hover:border-[var(--ember-deep)] disabled:opacity-50">
                      {t('ob_invoice_record')}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
