'use client'

import React, { useState, useEffect } from 'react'
import Link from 'next/link'
import { useTranslations, useLocale } from 'next-intl'
import { getSupabase } from '@/lib/supabaseClient'
import { fmtNok } from '@/lib/costs'

// Avregning (Lars 1/8): hva er opptjent i en periode, og hvor mye skal
// white-labelen ha? Følger FORBRUK, ikke kredittsalg — en artist som kjøper i
// januar og produserer i mars, tjenes inn i mars, for det er da kostnadene
// påløper. Hvert ledd ser sin egen avregning.

interface Avregning {
  tenant: { id: string; navn: string }
  periode: { fra: string; til: string }
  antallHendelser: number
  omsetningNok: number
  tilContentForgeNok: number
  tilWhiteLabelNok: number
  // Innkrevingsmodellen — kan mangle på svar fra før 7/8
  innkrevdNok?: number
  rabattfaktor?: number
  tilUtbetalingNok?: number
  alleredeUtbetaltNok?: number
  tilGodeNok?: number
  perKunde?: {
    orgId: string; navn: string; epost: string | null
    kjoept: number; forbrukt: number; saldo: number | null; antall: number
    hendelser?: { dato: string; type: string; produkt: string | null; beloep: number }[]
  }[]
  erPlattformAdmin?: boolean
  tenantSlug?: string | null
  valgbareTenants?: { slug: string; navn: string }[]
  perType: Record<string, { antall: number; omsetning: number; engros: number }>
}

// Kolonnenavnene kommer fra oversettelsene, ikke fra en norsk tabell —
// Isabels tenant er engelsk hele veien (Lars 3/8)
const TYPE_NOKKEL: Record<string, string> = {
  video_production: 'typeVideo',
  image: 'typeImage',
  voiceover: 'typeVoice',
  avatar: 'typeAvatar',
  radio: 'typeRadio',
  animation: 'typeAnimation',
}

function maanedStart(d: Date) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1))
}

export default function AvregningPage() {
  const t = useTranslations('settlement')
  // Maanedsnavnene sto laast i nb-NO — «Juli 2026» midt paa en engelsk side
  const locale = useLocale()
  const [data, setData] = useState<Avregning | null>(null)
  const [laster, setLaster] = useState(true)
  const [feil, setFeil] = useState<string | null>(null)
  // Månedsvelger: 0 = inneværende, 1 = forrige, …
  const [maanedTilbake, setMaanedTilbake] = useState(0)
  // Plattform-admin maa kunne se en PARTNERS avregning for aa betale den ut.
  const [valgtTenant, setValgtTenant] = useState<string>('')

  const hent = async (tilbake: number) => {
    setLaster(true)
    setFeil(null)
    try {
      const { data: sess } = await getSupabase().auth.getSession()
      const token = sess?.session?.access_token
      if (!token) throw new Error(t('notLoggedIn'))
      const naa = new Date()
      const fra = maanedStart(new Date(Date.UTC(naa.getUTCFullYear(), naa.getUTCMonth() - tilbake, 1)))
      const til = tilbake === 0
        ? new Date()
        : new Date(Date.UTC(fra.getUTCFullYear(), fra.getUTCMonth() + 1, 1) - 1)
      const tenantDel = valgtTenant ? `&tenant=${encodeURIComponent(valgtTenant)}` : ''
      const res = await fetch(`/api/settlement?fra=${fra.toISOString()}&til=${til.toISOString()}${tenantDel}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const d = await res.json()
      if (!res.ok) throw new Error(t('loadError'))
      setData(d)
    } catch (err) {
      setFeil(err instanceof Error ? err.message : 'Noe gikk galt')
    } finally {
      setLaster(false)
    }
  }

  useEffect(() => { hent(maanedTilbake) }, [maanedTilbake, valgtTenant])

  // Registrer en utbetaling. Kun plattform-admin ser skjemaet; serveren
  // håndhever det samme uansett.
  const [utbetalingApen, setUtbetalingApen] = useState(false)
  // Utfoldet kunderad — bestillingshistorikken (Lars 27/8)
  const [apenKunde, setApenKunde] = useState<string | null>(null)
  const [utbetalingBelop, setUtbetalingBelop] = useState('')
  const [utbetalingNotat, setUtbetalingNotat] = useState('')
  const [utbetalingStatus, setUtbetalingStatus] = useState<string | null>(null)
  const [lagrer, setLagrer] = useState(false)

  const registrerUtbetaling = async () => {
    const belop = Number(String(utbetalingBelop).replace(',', '.'))
    if (!Number.isFinite(belop) || belop < 0) return
    setLagrer(true)
    setUtbetalingStatus(null)
    try {
      const { data: sess } = await getSupabase().auth.getSession()
      const naa = new Date()
      const fra = maanedStart(new Date(Date.UTC(naa.getUTCFullYear(), naa.getUTCMonth() - maanedTilbake, 1)))
      const til = maanedTilbake === 0
        ? new Date()
        : new Date(Date.UTC(fra.getUTCFullYear(), fra.getUTCMonth() + 1, 1) - 1)
      const res = await fetch('/api/settlement', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${sess?.session?.access_token ?? ''}`,
        },
        body: JSON.stringify({
          tenantSlug: data?.tenantSlug ?? undefined,
          periodeFra: fra.toISOString().slice(0, 10),
          periodeTil: til.toISOString().slice(0, 10),
          amountNok: belop,
          note: utbetalingNotat || undefined,
        }),
      })
      if (!res.ok) throw new Error(t('payoutFailed'))
      setUtbetalingStatus(t('payoutSaved'))
      setUtbetalingApen(false)
      setUtbetalingBelop('')
      setUtbetalingNotat('')
      await hent(maanedTilbake)
    } catch (err) {
      setUtbetalingStatus(err instanceof Error ? err.message : t('payoutFailed'))
    } finally {
      setLagrer(false)
    }
  }

  const maanedNavn = (tilbake: number) => {
    const naa = new Date()
    const d = new Date(Date.UTC(naa.getUTCFullYear(), naa.getUTCMonth() - tilbake, 1))
    return d.toLocaleDateString(locale === 'en' ? 'en-GB' : 'nb-NO', { month: 'long', year: 'numeric', timeZone: 'UTC' })
  }

  return (
    <div className="min-h-screen bg-[var(--paper)]">
      <div className="max-w-4xl mx-auto px-4 sm:px-8 py-10">
        <Link href="/dashboard" className="text-[13px] text-[var(--text-muted)] hover:text-[var(--ink)]">
          {t('back')}
        </Link>
        <h1 className="mt-4 text-3xl font-bold text-[var(--ink)]">{t('title')}</h1>
        <p className="mt-2 text-[15px] text-[var(--text-muted)] max-w-[60ch]">
          {t('intro')}
        </p>

        <div className="mt-6 flex flex-wrap items-center gap-2">
          {/* Loepevariabelen het `t` og skygget for oversettelsesfunksjonen */}
          {[0, 1, 2].map((tb) => (
            <button
              key={tb}
              type="button"
              onClick={() => setMaanedTilbake(tb)}
              className={`px-3.5 py-2 rounded-lg border text-[13px] font-medium capitalize ${
                maanedTilbake === tb
                  ? 'bg-[var(--ember-deep)] text-[var(--on-ember)] border-[var(--ember-deep)]'
                  : 'bg-[var(--paper-raised)] text-[var(--text-muted)] border-[var(--ds-border-strong)] hover:border-[var(--ember-deep)]'
              }`}
            >
              {tb === 0 ? t('thisMonth') : maanedNavn(tb)}
            </button>
          ))}

          {/* Kun vi ser denne — en partner skal ikke vite at andre finnes. */}
          {data?.valgbareTenants && data.valgbareTenants.length > 0 && (
            <select
              value={valgtTenant}
              onChange={(e) => setValgtTenant(e.target.value)}
              className="ml-auto px-3 py-2 rounded-lg border border-[var(--ds-border-strong)] bg-[var(--paper-raised)] text-[13px] text-[var(--ink)]"
            >
              <option value="">{data.tenant.navn}</option>
              {data.valgbareTenants.map((v) => (
                <option key={v.slug} value={v.slug}>{v.navn}</option>
              ))}
            </select>
          )}
        </div>

        {laster && (
          <div className="mt-8 flex justify-center">
            <div className="w-7 h-7 border-4 border-[var(--ember-deep)] border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {feil && !laster && (
          <div className="mt-8 bg-[var(--paper-raised)] border border-red-200 rounded-2xl p-5 text-red-700 text-sm">{feil}</div>
        )}

        {data && !laster && (
          <>
            <div className="mt-8 grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="bg-[var(--paper-raised)] rounded-2xl border border-[var(--ds-border)] px-5 py-4">
                <p className="text-[12px] uppercase tracking-widest text-[var(--text-faint)]">{t('revenue')}</p>
                <p className="mt-1 text-2xl font-semibold text-[var(--ink)] tabular-nums">{fmtNok(data.omsetningNok)}</p>
                <p className="mt-1 text-[12px] text-[var(--text-faint)]">{t('revenueHint')}</p>
              </div>
              <div className="bg-[var(--paper-raised)] rounded-2xl border border-[var(--ds-border)] px-5 py-4">
                <p className="text-[12px] uppercase tracking-widest text-[var(--text-faint)]">{t('toPlatform')}</p>
                <p className="mt-1 text-2xl font-semibold text-[var(--ink)] tabular-nums">{fmtNok(data.tilContentForgeNok)}</p>
                <p className="mt-1 text-[12px] text-[var(--text-faint)]">{t('toPlatformHint')}</p>
              </div>
              <div className="bg-[var(--paper-raised)] rounded-2xl border-2 border-[var(--ember-deep)] px-5 py-4">
                <p className="text-[12px] uppercase tracking-widest text-[var(--ember-deep)]">{t('toYou')}</p>
                <p className="mt-1 text-2xl font-semibold text-[var(--ink)] tabular-nums">{fmtNok(data.tilWhiteLabelNok)}</p>
                <p className="mt-1 text-[12px] text-[var(--text-faint)]">{t('toYouHint')}</p>
              </div>
            </div>

            {/* Innkrevingsmodellen: kundene betaler oss, vi betaler deg videre.
                Opptjent andel og faktisk utbetaling er ikke samme tall — se
                kursjusteringen. Vises bare når serveren sender feltene. */}
            {typeof data.tilGodeNok === 'number' && (
              <div className="mt-5 bg-[var(--paper-raised)] rounded-2xl border border-[var(--ds-border)] overflow-hidden">
                <div className="px-5 py-3.5 border-b border-[var(--ds-border-faint)]">
                  <h2 className="text-base font-semibold text-[var(--ink)]">{t('payoutTitle')}</h2>
                </div>
                <div className="px-5 py-4 grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3 text-[14px]">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-[var(--text-muted)]">{t('collected')}</span>
                    <span className="tabular-nums text-[var(--ink)]">{fmtNok(data.innkrevdNok ?? 0)}</span>
                  </div>
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-[var(--text-muted)]">{t('discountFactor')}</span>
                    <span className="tabular-nums text-[var(--ink)]">
                      {((data.rabattfaktor ?? 1) * 100).toFixed(1).replace('.', ',')} %
                    </span>
                  </div>
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-[var(--text-muted)]">{t('alreadyPaid')}</span>
                    <span className="tabular-nums text-[var(--ink)]">{fmtNok(data.alleredeUtbetaltNok ?? 0)}</span>
                  </div>
                  <div className="flex items-baseline justify-between gap-3 border-t sm:border-t-0 border-[var(--ds-border-faint)] pt-3 sm:pt-0">
                    <span className="font-medium text-[var(--ember-deep)]">{t('due')}</span>
                    <span className="tabular-nums text-lg font-semibold text-[var(--ink)]">{fmtNok(data.tilGodeNok ?? 0)}</span>
                  </div>
                </div>
                <p className="px-5 pb-4 text-[12px] leading-relaxed text-[var(--text-faint)]">
                  {t('discountFactorHint')} {t('dueHint')}.
                </p>

                {/* Kun vi betaler ut. Serveren håndhever det samme. */}
                {data.erPlattformAdmin && (
                  <div className="px-5 pb-5 border-t border-[var(--ds-border-faint)] pt-4">
                    {utbetalingStatus && (
                      <p className="mb-3 text-[13px] text-[var(--ember-deep)]">{utbetalingStatus}</p>
                    )}
                    {!utbetalingApen ? (
                      <button
                        onClick={() => setUtbetalingApen(true)}
                        className="text-[13.5px] font-medium px-4 py-2 rounded-full border border-[var(--ds-border-strong)] text-[var(--ink)] hover:bg-[var(--paper-sunken)]"
                      >
                        {t('registerPayout')}
                      </button>
                    ) : (
                      <div className="flex flex-wrap items-end gap-3">
                        <label className="flex flex-col gap-1">
                          <span className="text-[12px] text-[var(--text-faint)]">{t('payoutAmount')}</span>
                          <input
                            type="text" inputMode="decimal" value={utbetalingBelop}
                            onChange={(e) => setUtbetalingBelop(e.target.value)}
                            placeholder={String(data.tilGodeNok ?? 0)}
                            className="w-32 px-3 py-2 rounded-lg border border-[var(--ds-border)] bg-[var(--paper)] text-[14px] text-[var(--ink)] tabular-nums"
                          />
                        </label>
                        <label className="flex flex-col gap-1 flex-1 min-w-[180px]">
                          <span className="text-[12px] text-[var(--text-faint)]">{t('payoutNote')}</span>
                          <input
                            type="text" value={utbetalingNotat}
                            onChange={(e) => setUtbetalingNotat(e.target.value)}
                            className="w-full px-3 py-2 rounded-lg border border-[var(--ds-border)] bg-[var(--paper)] text-[14px] text-[var(--ink)]"
                          />
                        </label>
                        <button
                          onClick={registrerUtbetaling} disabled={lagrer}
                          className="text-[13.5px] font-medium px-4 py-2 rounded-full bg-[var(--ember-deep)] text-white disabled:opacity-60"
                        >
                          {t('save')}
                        </button>
                        <button
                          onClick={() => { setUtbetalingApen(false); setUtbetalingStatus(null) }}
                          className="text-[13.5px] px-3 py-2 text-[var(--text-muted)]"
                        >
                          {t('cancel')}
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Hvem kjøpte og hvem produserte — ikke bare hvor mye (Lars 7/8) */}
            {data.perKunde && (
              <div className="mt-5 bg-[var(--paper-raised)] rounded-2xl border border-[var(--ds-border)] overflow-hidden">
                <div className="px-5 py-3.5 border-b border-[var(--ds-border-faint)]">
                  <h2 className="text-base font-semibold text-[var(--ink)]">{t('customers')}</h2>
                </div>
                {data.perKunde.length === 0 ? (
                  <p className="px-5 py-4 text-[14px] text-[var(--text-faint)]">{t('noCustomers')}</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-[14px]">
                      <thead>
                        <tr className="text-[12px] uppercase tracking-wider text-[var(--text-faint)] border-b border-[var(--ds-border-faint)]">
                          <th className="px-5 py-2.5 text-left font-medium">{t('colCustomer')}</th>
                          <th className="px-4 py-2.5 text-right font-medium">{t('colBought')}</th>
                          <th className="px-4 py-2.5 text-right font-medium">{t('colUsed')}</th>
                          <th className="px-5 py-2.5 text-right font-medium">{t('colBalance')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.perKunde.map((k) => (
                          <React.Fragment key={k.orgId}>
                          <tr
                            className="border-b border-[var(--ds-border-faint)] last:border-0 cursor-pointer hover:bg-[var(--paper-sunken)]"
                            onClick={() => setApenKunde(apenKunde === k.orgId ? null : k.orgId)}
                          >
                            <td className="px-5 py-2.5">
                              <span className="inline-flex items-center gap-1.5 text-[var(--ink)]">
                                <span aria-hidden="true" className="text-[11px] text-[var(--text-faint)]" style={{ display: 'inline-block', transition: 'transform 120ms', transform: apenKunde === k.orgId ? 'rotate(90deg)' : 'none' }}>▶</span>
                                {k.navn}
                              </span>
                              {k.epost && (
                                <span className="block pl-[19px] text-[12px] text-[var(--text-faint)]">{k.epost}</span>
                              )}
                            </td>
                            <td className="px-4 py-2.5 text-right tabular-nums text-[var(--text-muted)]">{fmtNok(k.kjoept)}</td>
                            <td className="px-4 py-2.5 text-right tabular-nums text-[var(--text-muted)]">{fmtNok(k.forbrukt)}</td>
                            <td className="px-5 py-2.5 text-right tabular-nums text-[var(--ink)]">
                              {k.saldo === null
                                ? <span className="text-[12.5px] text-[var(--text-faint)]">{t('noLimit')}</span>
                                : fmtNok(k.saldo)}
                            </td>
                          </tr>
                          {apenKunde === k.orgId && (
                            <tr className="border-b border-[var(--ds-border-faint)] last:border-0">
                              <td colSpan={4} className="px-5 pb-3 pt-0 bg-[var(--paper-sunken)]">
                                {(k.hendelser?.length ?? 0) === 0 ? (
                                  <p className="py-3 text-[13px] text-[var(--text-faint)]">{t('noOrders')}</p>
                                ) : (
                                  <table className="w-full text-[13px] mt-2">
                                    <thead>
                                      <tr className="text-[11px] uppercase tracking-wider text-[var(--text-faint)]">
                                        <th className="py-1.5 text-left font-medium">{t('colDate')}</th>
                                        <th className="py-1.5 text-left font-medium">{t('colWhat')}</th>
                                        <th className="py-1.5 text-right font-medium">{t('colAmount')}</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {k.hendelser!.map((h, i) => (
                                        <tr key={i} className="border-t border-[var(--ds-border-faint)]">
                                          <td className="py-1.5 pr-3 tabular-nums text-[var(--text-muted)] whitespace-nowrap">{new Date(h.dato).toLocaleDateString(locale === 'en' ? 'en-GB' : 'nb-NO', { day: 'numeric', month: 'short' })}</td>
                                          <td className="py-1.5 pr-3 text-[var(--ink)]">
                                            {t.has(`event_${h.type}`) ? t(`event_${h.type}`) : h.type}
                                            {h.produkt && <span className="text-[var(--text-faint)]"> · {h.produkt}</span>}
                                          </td>
                                          <td className="py-1.5 text-right tabular-nums text-[var(--text-muted)]">{fmtNok(h.beloep)}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                )}
                              </td>
                            </tr>
                          )}
                          </React.Fragment>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            <div className="mt-5 bg-[var(--paper-raised)] rounded-2xl border border-[var(--ds-border)] overflow-hidden">
              <div className="px-5 py-3.5 border-b border-[var(--ds-border-faint)] flex items-baseline justify-between gap-3">
                <h2 className="text-base font-semibold text-[var(--ink)]">{t('breakdown')}</h2>
                <span className="text-[12.5px] text-[var(--text-faint)]">{t('events', { count: data.antallHendelser })}</span>
              </div>
              {Object.keys(data.perType).length === 0 ? (
                <p className="px-5 py-6 text-[13.5px] text-[var(--text-muted)]">
                  {t('none')}
                </p>
              ) : (
                <table className="w-full text-[13.5px]">
                  <thead>
                    <tr className="text-left text-[var(--text-faint)] text-[12px] uppercase tracking-widest">
                      <th className="px-5 py-2 font-normal">{t('colType')}</th>
                      <th className="px-5 py-2 font-normal text-right">{t('colCount')}</th>
                      <th className="px-5 py-2 font-normal text-right">{t('colRevenue')}</th>
                      <th className="px-5 py-2 font-normal text-right">{t('colYours')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(data.perType)
                      .sort((a, b) => b[1].omsetning - a[1].omsetning)
                      .map(([type, v]) => (
                        <tr key={type} className="border-t border-[var(--ds-border-faint)]">
                          <td className="px-5 py-2.5 text-[var(--ink)]">{TYPE_NOKKEL[type] ? t(TYPE_NOKKEL[type]) : type}</td>
                          <td className="px-5 py-2.5 text-right text-[var(--text-muted)] tabular-nums">{v.antall}</td>
                          <td className="px-5 py-2.5 text-right text-[var(--text-muted)] tabular-nums">{fmtNok(v.omsetning)}</td>
                          <td className="px-5 py-2.5 text-right text-[var(--ink)] font-medium tabular-nums">
                            {fmtNok(Math.max(0, v.omsetning - v.engros))}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              )}
            </div>

            <p className="mt-4 text-[12.5px] text-[var(--text-faint)] max-w-[70ch]">
              {t('vat')}
            </p>
          </>
        )}
      </div>
    </div>
  )
}
