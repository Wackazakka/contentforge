'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { getSupabase } from '@/lib/supabaseClient'
import { COSTS_NOK, fmtCredits } from '@/lib/costs'

// Partnerens eget påslag (Lars 3/8). Prosent, ikke kroner — ContentForge kan
// endre innprisen når som helst, og da skal påslaget følge med av seg selv i
// stedet for å bli et tall som stille blir feil.
//
// Eksempelet under regner likevel om til kroner mens du skriver, for «200 %»
// sier ingenting før man ser hva artisten faktisk betaler.

// Typisk 20-sekunders promo: 4 animerte scener + 4 innlesninger.
// LISTEPRIS — den ekte innprisen er denne ganget med innprisfaktoren fra
// avtalen (vaart paaslag mot nettopp denne partneren).
const EKSEMPEL_LISTE = COSTS_NOK.animate5s * 4 + COSTS_NOK.voiceoverPreview * 4

export default function PaaslagPage() {
  const t = useTranslations('markup')
  const [navn, setNavn] = useState<string>('')
  const [verdi, setVerdi] = useState<string>('')
  const [lagret, setLagret] = useState<number | null>(null)
  const [innprisFaktor, setInnprisFaktor] = useState(1)
  const [laster, setLaster] = useState(true)
  const [lagrer, setLagrer] = useState(false)
  const [feil, setFeil] = useState<string | null>(null)
  const [kvittering, setKvittering] = useState(false)

  const token = async () => (await getSupabase().auth.getSession()).data.session?.access_token || ''

  useEffect(() => {
    ;(async () => {
      try {
        const res = await fetch('/api/my-markup', { headers: { Authorization: `Bearer ${await token()}` } })
        const d = await res.json()
        if (!res.ok) throw new Error(d.error || t('loadError'))
        setNavn(d.navn || '')
        if (Number.isFinite(Number(d.innprisFaktor))) setInnprisFaktor(Number(d.innprisFaktor))
        setVerdi(String(d.markupPercent))
        setLagret(Number(d.markupPercent))
      } catch (err) {
        setFeil(err instanceof Error ? err.message : 'Noe gikk galt')
      } finally {
        setLaster(false)
      }
    })()
  }, [])

  const lagre = async () => {
    setLagrer(true); setFeil(null); setKvittering(false)
    try {
      const res = await fetch('/api/my-markup', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await token()}` },
        body: JSON.stringify({ markupPercent: Number(verdi) }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || t('saveError'))
      setLagret(Number(d.markupPercent))
      setVerdi(String(d.markupPercent))
      setKvittering(true)
    } catch (err) {
      setFeil(err instanceof Error ? err.message : t('saveError'))
    } finally {
      setLagrer(false)
    }
  }

  const tall = Number(verdi)
  const gyldig = Number.isFinite(tall) && tall >= 0 && tall <= 500
  const grunnlag = EKSEMPEL_LISTE * innprisFaktor
  const utpris = gyldig ? grunnlag * (1 + tall / 100) : 0
  const margin = utpris - grunnlag
  const endret = lagret !== null && gyldig && tall !== lagret

  return (
    <div className="min-h-screen bg-[var(--paper)]">
      <div className="max-w-2xl mx-auto px-4 sm:px-8 py-10">
        <Link href="/dashboard" className="text-[13px] text-[var(--text-muted)] hover:text-[var(--ink)]">
          {t('back')}
        </Link>
        <h1 className="mt-4 text-3xl font-bold text-[var(--ink)]">{t('title')}</h1>
        <p className="mt-2 text-[15px] text-[var(--text-muted)] max-w-[60ch]">
          {t('intro')}
        </p>

        {laster && (
          <div className="mt-8 flex justify-center">
            <div className="w-7 h-7 border-4 border-[var(--ember-deep)] border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {feil && !laster && (
          <div className="mt-6 bg-[var(--paper-raised)] border border-red-300 rounded-2xl p-4 text-red-700 text-sm">{feil}</div>
        )}

        {!laster && lagret !== null && (
          <>
            <div className="mt-6 rounded-2xl border bg-[var(--paper-raised)] border-[var(--ds-border)] px-5 py-5">
              {navn && <p className="text-[12px] uppercase tracking-widest text-[var(--text-faint)] mb-3">{navn}</p>}
              <label className="block text-sm font-medium text-[var(--ink)] mb-1">{t('label')}</label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={0}
                  max={500}
                  step={5}
                  value={verdi}
                  onChange={(e) => setVerdi(e.target.value)}
                  className="w-32 px-3 py-2 border border-[var(--ds-border-strong)] rounded-lg text-lg tabular-nums bg-[var(--paper)] text-[var(--ink)] focus:outline-none focus:ring-2 focus:ring-[var(--ember-deep)]"
                />
                <span className="text-[var(--text-muted)]">%</span>
              </div>
              {!gyldig && verdi !== '' && (
                <p className="mt-2 text-[12.5px] text-red-600">
                  {t('range')}
                </p>
              )}

              {/* Prosent er tallet som lagres, men ingen forstår prosent uten
                  et beløp ved siden av */}
              <div className="mt-4 rounded-xl bg-[var(--paper-sunken)] border border-[var(--ds-border-faint)] px-4 py-3 text-[13.5px]">
                <p className="text-[var(--text-muted)] mb-2">
                  {t('example')}
                </p>
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-[var(--text-muted)]">{t('cost')}</span>
                  <span className="tabular-nums text-[var(--ink)]">{fmtCredits(grunnlag, t('unit'))}</span>
                </div>
                <div className="flex items-baseline justify-between gap-3 mt-1">
                  <span className="text-[var(--text-muted)]">{t('customerPays')}</span>
                  <span className="tabular-nums font-semibold text-[var(--ink)]">{gyldig ? fmtCredits(utpris, t('unit')) : '—'}</span>
                </div>
                <div className="flex items-baseline justify-between gap-3 mt-1 pt-2 border-t border-[var(--ds-border)]">
                  <span className="text-[var(--ember-deep)]">{t('youKeep')}</span>
                  <span className="tabular-nums font-semibold text-[var(--ember-deep)]">{gyldig ? fmtCredits(margin, t('unit')) : '—'}</span>
                </div>
                {gyldig && tall === 0 && (
                  <p className="mt-2 text-[12.5px] text-[var(--text-muted)]">
                    {t('zero')}
                  </p>
                )}
              </div>

              <button
                type="button"
                onClick={lagre}
                disabled={!endret || lagrer}
                /* Var nedtonet med opacity-40, som bleker BAADE flaten og
                   teksten samtidig — hvit tekst paa lys lilla, nesten uleselig
                   (Lars 3/8). Av-tilstanden har naa egne farger i stedet for
                   gjennomsiktighet, saa kontrasten holder i begge tilstander. */
                className={`mt-4 w-full px-4 py-2.5 rounded-lg font-medium ${
                  !endret || lagrer
                    ? 'bg-transparent text-[var(--ink)] border border-[var(--ds-border-strong)] cursor-default'
                    : 'bg-[var(--ember-deep)] text-[var(--on-ember)]'
                }`}
              >
                {lagrer ? t('saving') : endret ? t('save') : t('saved')}
              </button>
              {kvittering && (
                <p className="mt-2 text-[13px] text-green-700">
                  {t('receipt')}
                </p>
              )}
            </div>

            <p className="mt-4 text-[12.5px] text-[var(--text-faint)] leading-relaxed">
              {t('why')} <Link href="/dashboard/avregning" className="underline">{t('settlementLink')}</Link>.
            </p>
          </>
        )}
      </div>
    </div>
  )
}
