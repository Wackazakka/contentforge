'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { getSupabase } from '@/lib/supabaseClient'

// Nivå og vurdering (123) på skuespillersida i admin.
//
// To avgjørelser, ikke én: NIVÅET sier hvem hun er for kunden (nytt ansikt,
// profesjonell, kjent navn), VURDERINGEN sier om vi vil bruke penger på en
// modell av henne. Et nytt ansikt kan godtas og forbli et nytt ansikt.
//
// 🔑 Avslag tar profilen ned i samme kall (ruta setter is_public=false), og
// kontoen og det hun har levert, blir stående. Begrunnelsen vises for henne
// på /min-stemme — skriv den som til henne.

type Nivaa = 'new' | 'pro' | 'star'
type Vurdering = 'pending' | 'accepted' | 'declined'

export default function NivaaPanel({ actorId, tier, intake, decidedBy, decidedAt, note, onEndret }: {
  actorId: string
  tier: Nivaa
  intake: Vurdering
  decidedBy: string | null
  decidedAt: string | null
  note: string | null
  onEndret?: () => void
}) {
  const t = useTranslations('tierAdmin')
  const [busy, setBusy] = useState(false)
  const [feil, setFeil] = useState<string | null>(null)
  const [begrunnelse, setBegrunnelse] = useState(note || '')

  const send = async (body: Record<string, unknown>) => {
    setBusy(true); setFeil(null)
    try {
      const { data: s } = await getSupabase().auth.getSession()
      const token = s?.session?.access_token
      if (!token) throw new Error(t('err_login'))
      const r = await fetch('/api/voice-bank/admin', {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ actorId, ...body }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(j.error || t('err_generic'))
      onEndret?.()
    } catch (e) {
      setFeil(e instanceof Error ? e.message : t('err_generic'))
    } finally {
      setBusy(false)
    }
  }

  const vurder = (v: Vurdering) => {
    if (v === 'declined' && !confirm(t('confirm_decline'))) return
    send({ intake: v, intakeNote: begrunnelse.trim() || null })
  }

  const hvem = (decidedBy || '').startsWith('admin:') ? decidedBy!.slice(6)
    : (decidedBy || '').startsWith('agent:') ? t('by_agency')
    : decidedBy === 'migrasjon:123' ? t('by_migration')
    : null

  return (
    <div className="bg-[var(--paper-raised)] rounded-lg border border-gray-200 p-6 mb-8">
      <h2 className="font-semibold text-gray-900 mb-1">{t('h')}</h2>
      <p className="text-xs text-gray-500 mb-4">{t('hint')}</p>

      <div className="flex items-center justify-between gap-4 mb-4">
        <div>
          <div className="font-medium text-gray-900 text-sm">{t('tier_label')}</div>
          <p className="text-xs text-gray-500 mt-0.5">{t(`tier_${tier}_note`)}</p>
        </div>
        <div className="flex gap-1.5 flex-none" role="radiogroup" aria-label={t('tier_label')}>
          {(['new', 'pro', 'star'] as Nivaa[]).map((n) => (
            <button key={n} role="radio" aria-checked={tier === n} disabled={busy || tier === n}
              onClick={() => send({ tier: n })}
              className={`px-3 py-1.5 rounded-lg text-sm font-semibold border transition-colors ${tier === n
                ? 'bg-[var(--ink)] text-[var(--on-ember)] border-[var(--ink)]'
                : 'border-gray-300 text-gray-700 hover:border-[var(--ember-deep)] hover:text-[var(--ember-deep)]'}`}>
              {t(`tier_${n}`)}
            </button>
          ))}
        </div>
      </div>

      <div className="pt-4 border-t border-gray-200">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className={`font-medium text-sm ${intake === 'accepted' ? 'text-green-800' : intake === 'declined' ? 'text-red-700' : 'text-amber-800'}`}>
              {t(`intake_${intake}`)}
            </div>
            <p className="text-xs text-gray-500 mt-0.5">
              {intake === 'pending' ? t('intake_pending_note')
                : hvem && decidedAt ? t('intake_decided', { who: hvem, date: new Date(decidedAt).toLocaleDateString('nb-NO') })
                : null}
            </p>
          </div>
          <div className="flex gap-1.5 flex-none">
            {intake !== 'accepted' && (
              <button disabled={busy} onClick={() => vurder('accepted')}
                className="px-3 py-1.5 rounded-lg text-sm font-semibold border border-gray-300 text-gray-700 hover:border-green-700 hover:text-green-800 transition-colors">
                {t('accept')}
              </button>
            )}
            {intake !== 'declined' && (
              <button disabled={busy} onClick={() => vurder('declined')}
                className="px-3 py-1.5 rounded-lg text-sm font-semibold border border-gray-300 text-gray-700 hover:border-red-700 hover:text-red-700 transition-colors">
                {t('decline')}
              </button>
            )}
          </div>
        </div>
        <label className="block text-xs text-gray-600 mt-3">
          {t('note_label')}
          <textarea value={begrunnelse} rows={2} maxLength={1000} onChange={(e) => setBegrunnelse(e.target.value)}
            placeholder={t('note_ph')}
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
        </label>
      </div>

      {feil && <p className="text-sm text-red-700 mt-3">{feil}</p>}
    </div>
  )
}
