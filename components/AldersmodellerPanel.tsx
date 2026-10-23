'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { getSupabase } from '@/lib/supabaseClient'

// Aldersmodellene (082) på skuespillersida i admin. Se
// app/api/voice-bank/age-models for reglene: modellen må være godkjent av
// henne, kilden skal stå på raden, og klareringen er en port. Hver endring som
// berører hva som kan selges, gir en ny versjon av tvillingen (113) — derfor
// kalles onEndret, så versjonen øverst på sida oppdateres.

interface Modell {
  id: string; character_id: string; label: string; age_from: number | null; age_to: number | null
  source_note: string | null; source_cleared: boolean; is_default: boolean; is_active: boolean
  consent_at: string | null; characterName: string | null; approval: string | null; withdrawn: boolean
}
interface Kandidat { id: string; name: string | null; trainer: string | null; approval: string | null; blocked: string | null }

export default function AldersmodellerPanel({ actorId, onEndret }: { actorId: string; onEndret?: () => void }) {
  const t = useTranslations('actorAdmin')
  const [modeller, setModeller] = useState<Modell[]>([])
  const [kandidater, setKandidater] = useState<Kandidat[]>([])
  const [feil, setFeil] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [aapen, setAapen] = useState(false)
  const [skjema, setSkjema] = useState({ characterId: '', label: '', ageFrom: '', ageTo: '', sourceNote: '', sourceCleared: false })

  const kall = useCallback(async (init?: RequestInit) => {
    const { data: s } = await getSupabase().auth.getSession()
    const token = s?.session?.access_token
    if (!token) throw new Error('Ikke innlogget')
    const url = init?.method && init.method !== 'GET' ? '/api/voice-bank/age-models' : `/api/voice-bank/age-models?actorId=${actorId}`
    const r = await fetch(url, { ...init, headers: { ...(init?.headers || {}), Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } })
    const j = await r.json().catch(() => ({}))
    if (!r.ok) throw new Error(j.error || `Feil (${r.status})`)
    setModeller(j.models || [])
    setKandidater(j.candidates || [])
    return j
  }, [actorId])

  useEffect(() => { kall().catch((e) => setFeil(e.message)) }, [kall])

  const endre = async (body: Record<string, unknown>, method: 'POST' | 'PATCH') => {
    setBusy(true); setFeil(null)
    try {
      await kall({ method, body: JSON.stringify({ actorId, ...body }) })
      onEndret?.()
      return true
    } catch (e) { setFeil(e instanceof Error ? e.message : 'Noe gikk galt'); return false }
    finally { setBusy(false) }
  }

  const leggTil = async () => {
    // Si hva som mangler, i stedet for å låse knappen.
    if (!skjema.characterId) { setFeil(t('ages_need_model')); return }
    if (!skjema.label.trim()) { setFeil(t('ages_need_label')); return }
    if (skjema.sourceNote.trim().length < 5) { setFeil(t('ages_need_source')); return }
    const ok = await endre({ ...skjema }, 'POST')
    if (ok) { setSkjema({ characterId: '', label: '', ageFrom: '', ageTo: '', sourceNote: '', sourceCleared: false }); setAapen(false) }
  }

  const spenn = (m: Modell) => m.age_from != null && m.age_to != null ? `${m.age_from}–${m.age_to}` : m.age_from != null ? `${m.age_from}+` : m.age_to != null ? `–${m.age_to}` : null
  const egne = modeller.filter((m) => !m.is_default)
  const brukbare = kandidater.filter((k) => !k.blocked)

  return (
    <div className="rounded-lg p-5 mb-8" style={{ background: 'var(--paper-raised)', border: '1px solid var(--ds-border-strong, #D8CDB8)' }}>
      <div className="font-medium text-gray-900 text-sm">{t('ages_h')}</div>
      <p className="text-xs text-gray-500 mt-0.5 max-w-xl">
        {t('ages_hint')} <Link href="/dashboard/characters" className="underline underline-offset-2">{t('ages_link_characters')}</Link>
      </p>

      {egne.length === 0 ? (
        <p className="text-xs text-gray-500 mt-3">{t('ages_empty')}</p>
      ) : (
        <ul className="mt-3 divide-y divide-gray-200 border-y border-gray-200">
          {egne.map((m) => (
            <li key={m.id} className="py-2.5 flex items-start justify-between gap-3 flex-wrap">
              <div className="min-w-0">
                <div className={`text-sm font-medium ${m.is_active ? 'text-gray-900' : 'text-gray-400 line-through'}`}>
                  {m.label}{spenn(m) && <span className="ml-2 text-xs font-normal text-gray-500">{t('ages_span', { span: spenn(m)! })}</span>}
                </div>
                <div className="text-xs text-gray-500 mt-0.5">
                  {m.characterName || m.character_id}
                  {' · '}
                  <span className={m.source_cleared ? 'text-green-800' : 'text-amber-800'}>{m.source_cleared ? t('ages_cleared') : t('ages_not_cleared')}</span>
                  {!m.is_active && <> · {t('ages_inactive')}</>}
                  {m.withdrawn && <> · <span className="text-red-700">{t('ages_withdrawn')}</span></>}
                </div>
                {m.source_note && <div className="text-xs text-gray-500 mt-0.5 max-w-xl">{t('ages_source')}: {m.source_note}</div>}
              </div>
              <div className="flex gap-2 flex-none">
                <button disabled={busy} onClick={() => endre({ id: m.id, sourceCleared: !m.source_cleared }, 'PATCH')}
                  className="text-xs px-2.5 py-1 rounded-lg border border-gray-300 text-gray-600 hover:border-[var(--ember-deep)] hover:text-[var(--ember-deep)] disabled:opacity-40">
                  {m.source_cleared ? t('ages_unclear') : t('ages_clear')}
                </button>
                <button disabled={busy} onClick={() => endre({ id: m.id, isActive: !m.is_active }, 'PATCH')}
                  className="text-xs px-2.5 py-1 rounded-lg border border-gray-300 text-gray-600 hover:border-[var(--ember-deep)] hover:text-[var(--ember-deep)] disabled:opacity-40">
                  {m.is_active ? t('ages_deactivate') : t('ages_activate')}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {!aapen ? (
        <button onClick={() => { setAapen(true); setFeil(null) }}
          className="mt-3 px-4 py-2 rounded-lg text-sm font-semibold text-white bg-[var(--ink,#1C1A16)] hover:opacity-90">
          {t('ages_add')}
        </button>
      ) : (
        <div className="mt-4 grid gap-3 max-w-xl">
          <label className="text-xs text-gray-600">
            {t('ages_f_model')}
            <select value={skjema.characterId} onChange={(e) => setSkjema({ ...skjema, characterId: e.target.value })}
              className="mt-1 block w-full text-sm border border-gray-300 rounded px-2 py-1.5 bg-white">
              <option value="">{brukbare.length ? t('ages_f_model_ph') : t('ages_none_candidates')}</option>
              {kandidater.map((k) => (
                <option key={k.id} value={k.id} disabled={!!k.blocked}>
                  {(k.name || k.id)}{k.trainer?.includes('flux-2') ? ' · Flux 2' : ''}{k.blocked ? ` — ${k.blocked}` : ''}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-gray-600">
            {t('ages_f_label')}
            <input value={skjema.label} maxLength={60} onChange={(e) => setSkjema({ ...skjema, label: e.target.value })} placeholder={t('ages_f_label_ph')}
              className="mt-1 block w-full text-sm border border-gray-300 rounded px-2 py-1.5" />
          </label>
          <div className="flex gap-3">
            <label className="text-xs text-gray-600 flex-1">
              {t('ages_f_from')}
              <input inputMode="numeric" value={skjema.ageFrom} onChange={(e) => setSkjema({ ...skjema, ageFrom: e.target.value.replace(/\D/g, '') })}
                className="mt-1 block w-full text-sm border border-gray-300 rounded px-2 py-1.5" />
            </label>
            <label className="text-xs text-gray-600 flex-1">
              {t('ages_f_to')}
              <input inputMode="numeric" value={skjema.ageTo} onChange={(e) => setSkjema({ ...skjema, ageTo: e.target.value.replace(/\D/g, '') })}
                className="mt-1 block w-full text-sm border border-gray-300 rounded px-2 py-1.5" />
            </label>
          </div>
          <label className="text-xs text-gray-600">
            {t('ages_f_source')}
            <textarea value={skjema.sourceNote} rows={2} onChange={(e) => setSkjema({ ...skjema, sourceNote: e.target.value })} placeholder={t('ages_f_source_ph')}
              className="mt-1 block w-full text-sm border border-gray-300 rounded px-2 py-1.5" />
          </label>
          <label className="text-xs text-gray-700 flex items-start gap-2">
            <input type="checkbox" checked={skjema.sourceCleared} onChange={(e) => setSkjema({ ...skjema, sourceCleared: e.target.checked })} className="mt-0.5" />
            <span>{t('ages_f_cleared')}</span>
          </label>
          <div className="flex gap-2">
            <button disabled={busy} onClick={leggTil}
              className="px-4 py-2 rounded-lg text-sm font-semibold text-white bg-[var(--ink,#1C1A16)] hover:opacity-90 disabled:opacity-50">
              {busy ? '…' : t('ages_save')}
            </button>
            <button disabled={busy} onClick={() => { setAapen(false); setFeil(null) }}
              className="px-4 py-2 rounded-lg text-sm border border-gray-300 text-gray-600">
              {t('ages_cancel')}
            </button>
          </div>
        </div>
      )}
      {feil && <p className="text-xs text-red-700 mt-2">{feil}</p>}
    </div>
  )
}
