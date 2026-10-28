'use client'

import { useCallback, useEffect, useState } from 'react'
import { useTranslations, useLocale } from 'next-intl'
import { getSupabase } from '@/lib/supabaseClient'

// Stemmeabonnementet og påmeldingsavgiften på skuespillerkortet (126, 28.10.2026).
//
// Hun betaler abonnementet med sitt eget kort i møtet. Her føres det: beløpet,
// hvem som skal dekke det (forslaget kommer fra veien inn — byråets innstilling
// eller «selv» for en drop-in), og om refusjonen er overført. Lars: refusjonen
// skal skje med en gang, så «Refundert nå» er krysset av fra start.

type Betaler = 'platform' | 'agency' | 'actor'
type Status = 'own_cost' | 'to_refund' | 'refunded' | 'to_invoice' | 'invoiced'

interface Utlegg {
  id: string; amountNok: number; amountUsd: number | null; payer: Betaler
  agentName: string | null; status: Status; refundedAt: string | null; invoicedAt: string | null
}
interface Kort {
  enabled: boolean
  expense: Utlegg | null
  suggestedPayer: Betaler
  agency: { id: string; name: string; covers: 'platform' | 'agency' } | null
  fee: { amountNok: number | null; required: boolean; status: 'paid' | 'waived' | null; at: string | null } | null
}

const BCP47: Record<string, string> = { no: 'nb-NO', en: 'en-GB' }

export default function OnboardingUtleggBoks({ actorId, actorName }: { actorId: string; actorName: string }) {
  const t = useTranslations('actorAdmin')
  const bcp = BCP47[useLocale()] || 'en-GB'
  const nok = (n: number) => `${n.toLocaleString(bcp, { minimumFractionDigits: 0, maximumFractionDigits: 2 })} kr`
  const dato = (s: string) => new Date(s).toLocaleDateString(bcp, { day: 'numeric', month: 'short', year: 'numeric' })

  const [kort, setKort] = useState<Kort | null>(null)
  const [feil, setFeil] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [beloep, setBeloep] = useState('')
  const [usd, setUsd] = useState('')
  const [betaler, setBetaler] = useState<Betaler | ''>('')
  const [refundert, setRefundert] = useState(true)

  const kall = useCallback(async (init?: RequestInit, qs = `?actorId=${encodeURIComponent(actorId)}`) => {
    const { data: sess } = await getSupabase().auth.getSession()
    const token = sess?.session?.access_token
    if (!token) throw new Error('Ikke innlogget')
    const res = await fetch(`/api/voice-bank/onboarding${init ? '' : qs}`, {
      ...init, headers: { ...(init?.headers || {}), Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    })
    const d = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(d.error || t('ob_err'))
    return d
  }, [actorId, t])

  useEffect(() => {
    let avbrutt = false
    kall().then((d) => { if (!avbrutt && 'enabled' in d) setKort(d as Kort) }).catch((e) => { if (!avbrutt) setFeil(e.message) })
    return () => { avbrutt = true }
  }, [kall])

  const gjoer = async (init: RequestInit, sporsmaal?: string) => {
    if (sporsmaal && !window.confirm(sporsmaal)) return
    setBusy(true); setFeil(null)
    try {
      const d = await kall(init)
      if ('enabled' in d) setKort(d as Kort)
    } catch (e) { setFeil(e instanceof Error ? e.message : t('ob_err')) } finally { setBusy(false) }
  }

  if (!kort && !feil) return null

  const valgt: Betaler = betaler || kort?.suggestedPayer || 'actor'
  const betalerTekst = (p: Betaler, byraa: string | null) =>
    p === 'platform' ? t('ob_payer_platform') : p === 'agency' ? t('ob_payer_agency', { name: byraa || '—' }) : t('ob_payer_actor')

  const registrer = () => gjoer({
    method: 'POST',
    body: JSON.stringify({ actorId, amountNok: beloep, amountUsd: usd, payer: valgt, refunded: valgt !== 'actor' && refundert }),
  })

  return (
    <div className="mb-4 max-w-md rounded-lg border border-gray-200 bg-[var(--paper)] p-4 text-sm">
      <p className="font-medium text-gray-700 mb-1">{t('ob_h')}</p>
      <p className="text-xs text-gray-400 mb-3">{t('ob_hint')}</p>

      {feil && <p className="mb-3 text-xs text-red-700">{feil}</p>}
      {kort && !kort.enabled && <p className="text-xs text-amber-700">{t('ob_not_enabled')}</p>}

      {kort?.enabled && kort.expense && (() => {
        const u = kort.expense
        return (
          <div>
            <p className="text-gray-900">
              {nok(u.amountNok)}{u.amountUsd ? ` (${u.amountUsd} USD)` : ''} · {betalerTekst(u.payer, u.agentName)}
            </p>
            <p className="text-xs mt-1">
              {u.status === 'own_cost' && <span className="text-gray-500">{t('ob_st_own')}</span>}
              {u.status === 'to_refund' && <span className="text-amber-700 font-semibold">{t('ob_st_to_refund', { name: actorName })}</span>}
              {u.status === 'refunded' && <span className="text-green-700">{t('ob_st_refunded', { date: dato(u.refundedAt!) })}</span>}
              {u.status === 'to_invoice' && <span className="text-green-700">{t('ob_st_to_invoice', { date: dato(u.refundedAt!), name: u.agentName || '—' })}</span>}
              {u.status === 'invoiced' && <span className="text-green-700">{t('ob_st_invoiced', { date: dato(u.invoicedAt!), name: u.agentName || '—' })}</span>}
            </p>
            {u.status === 'to_refund' && (
              <div className="mt-2 flex flex-wrap gap-2">
                <button type="button" disabled={busy} onClick={() => gjoer({ method: 'PATCH', body: JSON.stringify({ id: u.id, action: 'refunded' }) }, t('ob_refund_confirm', { sum: nok(u.amountNok), name: actorName }))}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold text-[var(--on-ember)] bg-[var(--ember-deep)] disabled:opacity-50">
                  {t('ob_refund_now')}
                </button>
                <button type="button" disabled={busy} onClick={() => gjoer({ method: 'DELETE', body: JSON.stringify({ id: u.id }) }, t('ob_delete_confirm'))}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-gray-300 text-gray-700 disabled:opacity-50">
                  {t('ob_delete')}
                </button>
              </div>
            )}
            {u.status === 'own_cost' && (
              <button type="button" disabled={busy} onClick={() => gjoer({ method: 'DELETE', body: JSON.stringify({ id: u.id }) }, t('ob_delete_confirm'))}
                className="mt-2 px-3 py-1.5 rounded-lg text-xs font-semibold border border-gray-300 text-gray-700 disabled:opacity-50">
                {t('ob_delete')}
              </button>
            )}
          </div>
        )
      })()}

      {kort?.enabled && !kort.expense && (
        <div className="grid gap-2">
          <div className="flex flex-wrap gap-2">
            <label className="text-xs text-gray-600">{t('ob_amount')}
              <input value={beloep} onChange={(e) => setBeloep(e.target.value)} inputMode="decimal" placeholder="230"
                className="block w-28 mt-1 px-3 py-2 border border-gray-300 rounded-lg text-sm" />
            </label>
            <label className="text-xs text-gray-600">{t('ob_usd')}
              <input value={usd} onChange={(e) => setUsd(e.target.value)} inputMode="decimal" placeholder="22"
                className="block w-24 mt-1 px-3 py-2 border border-gray-300 rounded-lg text-sm" />
            </label>
          </div>
          <label className="text-xs text-gray-600">{t('ob_payer')}
            <select value={valgt} onChange={(e) => setBetaler(e.target.value as Betaler)}
              className="block w-full mt-1 px-3 py-2 border border-gray-300 rounded-lg text-sm bg-[var(--paper-raised)]">
              <option value="platform">{t('ob_payer_platform')}</option>
              {kort.agency && <option value="agency">{t('ob_payer_agency', { name: kort.agency.name })}</option>}
              <option value="actor">{t('ob_payer_actor')}</option>
            </select>
            <span className="block mt-1 text-gray-400">
              {kort.agency
                ? t('ob_suggest_agency', { name: kort.agency.name, who: betalerTekst(kort.suggestedPayer, kort.agency.name) })
                : t('ob_suggest_dropin')}
            </span>
          </label>
          {valgt !== 'actor' && (
            <label className="flex items-start gap-2 text-xs text-gray-700">
              <input type="checkbox" checked={refundert} onChange={(e) => setRefundert(e.target.checked)} className="mt-0.5" />
              <span>{t('ob_refunded_now', { name: actorName })}</span>
            </label>
          )}
          <div>
            <button type="button" disabled={busy || !beloep.trim()} onClick={registrer}
              className="px-4 py-2 rounded-lg text-sm font-semibold text-[var(--on-ember)] bg-[var(--ember-deep)] disabled:opacity-50">
              {t('ob_register')}
            </button>
          </div>
        </div>
      )}

      {kort?.enabled && kort.fee && (
        <div className="mt-4 pt-3 border-t border-gray-200 text-xs">
          <span className="text-gray-700 font-medium">{t('ob_fee', { sum: nok(kort.fee.amountNok ?? 0) })}</span>{' '}
          {kort.fee.status === 'paid' && <span className="text-green-700">{t('ob_fee_paid', { date: dato(kort.fee.at!) })}</span>}
          {kort.fee.status === 'waived' && <span className="text-gray-500">{t('ob_fee_waived')}</span>}
          {!kort.fee.status && (
            <>
              <span className="text-amber-700">{t('ob_fee_unpaid')}</span>{' '}
              <button type="button" disabled={busy} onClick={() => gjoer({ method: 'PATCH', body: JSON.stringify({ actorId, action: 'waive_fee' }) }, t('ob_fee_waive_confirm', { name: actorName }))}
                className="ml-1 underline text-gray-700 disabled:opacity-50">
                {t('ob_fee_waive')}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}
