'use client'

import { useEffect, useState } from 'react'
import { useTranslations, useLocale } from 'next-intl'

// Sangmodellen på /min-stemme (127): rettighetshaveren hører prøven og svarer.
//
// 🔑 INGEN MODELL TAS I BRUK FØR HUN HAR SAGT JA. Det gjelder en sanger og
// eieren av en virtuell artist likt. Svaret kan bare gis når det finnes en
// prøve å høre — et ja til noe man ikke har hørt, er ikke et ja.

interface Modell {
  id: string; status: string; source: string; sourceNote: string | null
  sample: 'none' | 'running' | 'ready'; sampleUrl: string | null
  approval: string; approvedAt: string | null; createdAt: string; active: boolean
}

const BCP47: Record<string, string> = { no: 'nb-NO', en: 'en-GB' }

export default function SangGodkjenning({ actorId, bearer, virtuell }: { actorId: string; bearer: string; virtuell: boolean }) {
  const t = useTranslations('myLedger')
  const bcp = BCP47[useLocale()] || 'en-GB'
  const dato = (s: string) => new Date(s).toLocaleDateString(bcp, { day: 'numeric', month: 'short', year: 'numeric' })
  const [modeller, setModeller] = useState<Modell[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [feil, setFeil] = useState<string | null>(null)

  useEffect(() => {
    let avbrutt = false
    fetch(`/api/voice-bank/singing/me?actorId=${encodeURIComponent(actorId)}`, { headers: { Authorization: `Bearer ${bearer}` } })
      .then((r) => r.json())
      .then((d) => { if (!avbrutt) setModeller(d.enabled ? d.models || [] : null) })
      .catch(() => { if (!avbrutt) setModeller(null) })
    return () => { avbrutt = true }
  }, [actorId, bearer])

  const svar = async (m: Modell, decision: 'approved' | 'rejected') => {
    if (!window.confirm(t(decision === 'approved' ? 'sing_approve_confirm' : 'sing_reject_confirm'))) return
    setBusy(true); setFeil(null)
    try {
      const r = await fetch('/api/voice-bank/singing/me', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${bearer}` },
        body: JSON.stringify({ actorId, modelId: m.id, decision }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || t('sing_answer_failed'))
      setModeller(d.models || [])
    } catch (e) { setFeil(e instanceof Error ? e.message : t('sing_answer_failed')) } finally { setBusy(false) }
  }

  if (modeller === null) return null
  // Modellene hun kan forholde seg til: de som er ferdige, eller underveis.
  const synlige = modeller.filter((m) => m.status === 'ready' || m.status === 'training')

  return (
    <div className="mb-8">
      <h2 className="font-semibold mb-1">{t('sing_h')}</h2>
      <p className="text-sm text-gray-600 mb-3">{t(virtuell ? 'sing_intro_virtual' : 'sing_intro')}</p>
      {feil && <p className="text-sm text-red-700 mb-2">{feil}</p>}
      {synlige.length === 0 && <p className="text-sm text-gray-500">{t('sing_none')}</p>}
      {synlige.map((m) => (
        <div key={m.id} className="border border-gray-200 p-4 mb-3 text-sm">
          <p className="font-medium mb-1">
            {m.status === 'training' ? t('sing_training')
              : m.active ? t('sing_in_use')
              : m.approval === 'approved' ? t('sing_approved_short', { date: m.approvedAt ? dato(m.approvedAt) : '' })
              : m.approval === 'rejected' ? t('sing_rejected_short')
              : m.sample === 'ready' ? t('sing_listen') : t('sing_sample_coming')}
          </p>
          {m.sampleUrl && <audio controls src={m.sampleUrl} className="w-full max-w-md my-2" />}
          {m.status === 'ready' && m.approval === 'pending' && m.sample === 'ready' && (
            <div className="flex flex-wrap gap-2 mt-2">
              <button type="button" disabled={busy} onClick={() => svar(m, 'approved')}
                className="px-4 py-2 font-semibold text-[var(--on-ember)] bg-[var(--ember-deep)] hover:opacity-90 disabled:opacity-50">
                {t('sing_approve')}
              </button>
              <button type="button" disabled={busy} onClick={() => svar(m, 'rejected')}
                className="px-4 py-2 font-semibold border border-gray-300 hover:border-gray-500 disabled:opacity-50">
                {t('sing_reject')}
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
