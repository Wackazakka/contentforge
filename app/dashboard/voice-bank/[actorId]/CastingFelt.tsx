'use client'

import { useState } from 'react'
import { useTranslations, useLocale } from 'next-intl'
import {
  FASETTER, KJOENN, KREVER_SAMTYKKE, VOKABULAR, type Fasett,
} from '@/lib/castingAttributes'

// Castingfeltene på skuespillerraden (Lars 20.09.2026).
//
// Uten dette skjemaet er filteret i Audition tomt: kolonnene finnes (083), men
// ingen kan fylle dem. Og et tomt felt er ikke «alle» — det er USYNLIG.
// Derfor står det som en advarsel i ingressen, ikke som en fotnote.
//
// ⚠️ ART. 9-PORTEN. Spilleområde (etnisitet) er særlige kategorier. Chipene er
// låst til samtykket er krysset av, og trekkes samtykket, tømmes verdiene i
// samme lagring (ruta gjør det samme server-side — porten står begge steder,
// så den ikke kan omgås ved å poste direkte).

const kant = { borderColor: 'var(--ds-border, #E2D9C8)' }

export interface CastingVerdier {
  gender: string | null
  playingAgeFrom: number | null
  playingAgeTo: number | null
  heightCm: number | null
  attributes: Record<string, string[]>
  appearanceConsentAt: string | null
}

export default function CastingFelt({ actorId, start, onLagret }: {
  actorId: string
  start: CastingVerdier
  onLagret?: () => void
}) {
  const t = useTranslations('casting')
  const locale = useLocale()
  const [kjoenn, setKjoenn] = useState(start.gender ?? '')
  const [aldFra, setAldFra] = useState(start.playingAgeFrom?.toString() ?? '')
  const [aldTil, setAldTil] = useState(start.playingAgeTo?.toString() ?? '')
  const [hoyde, setHoyde] = useState(start.heightCm?.toString() ?? '')
  const [attr, setAttr] = useState<Record<string, string[]>>(start.attributes || {})
  const [samtykke, setSamtykke] = useState(!!start.appearanceConsentAt)
  const [busy, setBusy] = useState(false)
  const [melding, setMelding] = useState<string | null>(null)
  const [ok, setOk] = useState(false)

  const veksle = (f: Fasett, v: string) => setAttr((p) => {
    const naa = p[f] ?? []
    return { ...p, [f]: naa.includes(v) ? naa.filter((x) => x !== v) : [...naa, v] }
  })

  // Trekkes samtykket i skjemaet, skal chipene tømmes med det samme — ikke
  // først ved lagring. Ellers ser det ut som verdiene fortsatt gjelder.
  const settSamtykke = (paa: boolean) => {
    setSamtykke(paa)
    if (!paa) setAttr((p) => {
      const n = { ...p }
      for (const f of KREVER_SAMTYKKE) delete n[f]
      return n
    })
  }

  const lagre = async () => {
    setBusy(true); setMelding(null); setOk(false)
    try {
      const { getSupabase } = await import('@/lib/supabaseClient')
      const { data: sess } = await getSupabase().auth.getSession()
      const token = sess?.session?.access_token
      if (!token) throw new Error('401')
      const res = await fetch('/api/voice-bank/admin', {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          actorId,
          gender: kjoenn || null,
          playingAgeFrom: aldFra === '' ? null : Number(aldFra),
          playingAgeTo: aldTil === '' ? null : Number(aldTil),
          heightCm: hoyde === '' ? null : Number(hoyde),
          // Samtykket sendes FØR attributtene leses server-side, så et nytt
          // samtykke og spilleområdet kan settes i samme lagring.
          appearanceConsent: samtykke,
          attributes: attr,
        }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || t('admin_err'))
      setMelding(t('admin_saved')); setOk(true)
      onLagret?.()
    } catch (e) {
      setMelding(e instanceof Error ? e.message : t('admin_err'))
    } finally {
      setBusy(false)
    }
  }

  const Chip = ({ f, v }: { f: Fasett; v: string }) => {
    const laast = KREVER_SAMTYKKE.includes(f) && !samtykke
    const paa = (attr[f] ?? []).includes(v)
    return (
      <button type="button" disabled={laast} onClick={() => veksle(f, v)} aria-pressed={paa}
        className="px-3 py-1.5 rounded-full text-sm border transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        style={paa
          ? { borderColor: 'var(--ember-deep)', color: 'var(--ember-deep)', background: 'var(--ember-tint-bg)', fontWeight: 600 }
          : { ...kant, color: 'var(--text-muted, #6B6358)' }}>
        {t(`${f}_${v}`)}
      </button>
    )
  }

  return (
    <div className="bg-[var(--paper-raised)] rounded-lg border border-gray-200 p-6 mb-8">
      <p className="text-xs text-gray-400 mb-4 max-w-2xl">{t('admin_intro')}</p>

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <span className="text-sm font-medium text-gray-700 w-32">{t('f_gender')}</span>
        <select value={kjoenn} onChange={(e) => setKjoenn(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-[var(--paper-raised)]">
          <option value="">—</option>
          {KJOENN.map((g) => <option key={g} value={g}>{t(`gender_${g}`)}</option>)}
        </select>
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-1">
        <span className="text-sm font-medium text-gray-700 w-32">{t('f_age')}</span>
        <input value={aldFra} onChange={(e) => setAldFra(e.target.value)} inputMode="numeric" placeholder={t('age_from')}
          className="w-20 px-2 py-1.5 border border-gray-300 rounded-lg text-sm" />
        <span className="text-gray-400">–</span>
        <input value={aldTil} onChange={(e) => setAldTil(e.target.value)} inputMode="numeric" placeholder={t('age_to')}
          className="w-20 px-2 py-1.5 border border-gray-300 rounded-lg text-sm" />
        <span className="text-sm text-gray-500">{t('admin_years')}</span>
      </div>
      <p className="text-xs text-gray-400 mb-4 ml-32 max-w-xl">{t('admin_age_hint')}</p>

      <div className="flex flex-wrap items-center gap-2 mb-5">
        <span className="text-sm font-medium text-gray-700 w-32">{t('f_height')}</span>
        <input value={hoyde} onChange={(e) => setHoyde(e.target.value)} inputMode="numeric"
          className="w-24 px-2 py-1.5 border border-gray-300 rounded-lg text-sm" />
        <span className="text-sm text-gray-500">{t('admin_cm')}</span>
      </div>

      {/* Art. 9-porten står FØR feltet den låser opp, så den leses først. */}
      <label className="flex items-start gap-2 mb-2 max-w-2xl text-sm text-gray-700 rounded-lg border p-3"
        style={{ ...kant, background: samtykke ? 'var(--ember-tint-bg)' : 'transparent' }}>
        <input type="checkbox" checked={samtykke} onChange={(e) => settSamtykke(e.target.checked)} className="mt-0.5" />
        <span>
          {t('admin_consent_label')}
          <span className="block text-xs text-gray-500 mt-0.5">{t('admin_consent_hint')}</span>
          {start.appearanceConsentAt && (
            <span className="block text-xs text-gray-400 mt-1">
              {t('admin_consent_given', {
                date: new Date(start.appearanceConsentAt).toLocaleDateString(locale === 'no' ? 'nb-NO' : 'en-GB'),
              })}
            </span>
          )}
        </span>
      </label>

      {FASETTER.map((f) => (
        <div key={f} className="mb-4">
          <p className="text-sm font-medium text-gray-700 mb-1.5">{t(`f_${f}`)}</p>
          <div className="flex flex-wrap gap-2">
            {VOKABULAR[f].map((v) => <Chip key={v} f={f} v={v} />)}
          </div>
        </div>
      ))}

      {melding && (
        <div className={`mb-3 p-3 rounded-lg text-sm ${ok ? 'bg-green-50 border border-green-200 text-green-700' : 'bg-red-50 border border-red-200 text-red-700'}`}>
          {melding}
        </div>
      )}
      <button onClick={lagre} disabled={busy}
        className="px-5 py-2.5 rounded-lg font-semibold text-[var(--on-ember)] bg-[var(--ember-deep)] hover:opacity-90 disabled:opacity-50">
        {busy ? t('admin_saving') : t('admin_save')}
      </button>
    </div>
  )
}
