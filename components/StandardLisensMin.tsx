'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'

// Standardlisensen på /min-stemme (128): hva rettighetshaveren har sagt ja til
// på forhånd, og en bryter hun alltid kan slå av.

type Svar = { enabled?: boolean; terms?: { assets: string[]; media: string[]; territories: string[]; maxTermMonths: number }; blocker?: string | null; notEnabled?: boolean }

export default function StandardLisensMin({ actorId, bearer }: { actorId: string; bearer: string }) {
  const t = useTranslations('myLedger')
  const [svar, setSvar] = useState<Svar | null>(null)
  const [busy, setBusy] = useState(false)
  const [feil, setFeil] = useState<string | null>(null)

  useEffect(() => {
    let avbrutt = false
    fetch(`/api/voice-bank/standard-terms/me?actorId=${encodeURIComponent(actorId)}`, { headers: { Authorization: `Bearer ${bearer}` } })
      .then((r) => r.json()).then((d) => { if (!avbrutt) setSvar(d) }).catch(() => undefined)
    return () => { avbrutt = true }
  }, [actorId, bearer])

  if (!svar || svar.notEnabled || !svar.terms) return null
  // Kjente navn og testprofiler kan ikke ha standardlisens — da er det ingenting å vise.
  if (svar.blocker && !svar.enabled) return null

  const bytt = async () => {
    const neste = !svar.enabled
    if (!window.confirm(t(neste ? 'std_on_confirm' : 'std_off_confirm'))) return
    setBusy(true); setFeil(null)
    try {
      const r = await fetch('/api/voice-bank/standard-terms/me', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${bearer}` },
        body: JSON.stringify({ actorId, enabled: neste }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || t('std_failed'))
      setSvar(d)
    } catch (e) { setFeil(e instanceof Error ? e.message : t('std_failed')) } finally { setBusy(false) }
  }

  const liste = (verdier: string[], prefiks: string) => verdier.map((v) => t(`${prefiks}_${v}`)).join(', ')
  const v = svar.terms
  return (
    <div className="mb-8">
      <h2 className="font-semibold mb-1">{t('std_h')}</h2>
      <p className="text-sm text-gray-600 mb-2">{t(svar.enabled ? 'std_on' : 'std_off')}</p>
      <p className="text-sm text-gray-700 mb-3">
        {t('std_scope', { what: liste(v.assets, 'std_asset'), media: liste(v.media, 'std_media'), where: liste(v.territories, 'std_terr'), months: v.maxTermMonths })}
      </p>
      {feil && <p className="text-sm text-red-700 mb-2">{feil}</p>}
      <button type="button" disabled={busy} onClick={bytt}
        className="px-4 py-2 text-sm font-semibold border border-gray-300 hover:border-gray-500 disabled:opacity-50">
        {t(svar.enabled ? 'std_turn_off' : 'std_turn_on')}
      </button>
    </div>
  )
}
