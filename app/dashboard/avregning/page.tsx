'use client'

import { useState, useEffect } from 'react'
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
      const res = await fetch(`/api/settlement?fra=${fra.toISOString()}&til=${til.toISOString()}`, {
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

  useEffect(() => { hent(maanedTilbake) }, [maanedTilbake])

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
