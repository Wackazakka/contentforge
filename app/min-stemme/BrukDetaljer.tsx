'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'

// Hva tvillingen ble brukt til, under én rad i hovedboken (128): teksten som
// ble lest og resultatet. Serveren har allerede fjernet det byrået holder
// tilbake; her vises bare det som kom.
//
// Resultatet hentes først når hun trykker (/api/voice-bank/me/resultat):
// lenken varer i minutter, og nivået sjekkes på nytt.

export interface BrukInnhold {
  id: string | number
  insight: 'production' | 'script' | 'full'
  text: string | null
  textKind: 'spoken' | 'prompt' | 'line' | null
  output: { kind: 'audio' | 'video' | 'image'; ready: boolean } | null
}

/** Er det noe å folde ut? Uten det skal raden ikke se klikkbar ut. */
export const harInnhold = (e: BrukInnhold) => !!e.text || !!e.output || e.insight !== 'full'

export function BrukDetaljer({ e, bearer, agency }: { e: BrukInnhold; bearer: string; agency: boolean }) {
  const t = useTranslations('myLedger')
  const [lenke, setLenke] = useState<string | null>(null)
  const [henter, setHenter] = useState(false)
  const [feil, setFeil] = useState(false)

  const hent = async () => {
    setHenter(true); setFeil(false)
    try {
      const res = await fetch(`/api/voice-bank/me/resultat?event=${encodeURIComponent(String(e.id))}`, { headers: { Authorization: `Bearer ${bearer}` } })
      const d = await res.json().catch(() => ({}))
      if (!res.ok || !d.url) setFeil(true)
      else setLenke(d.url)
    } catch { setFeil(true) } finally { setHenter(false) }
  }

  return (
    <div className="space-y-3 text-sm">
      {e.insight !== 'production' && (
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">{t(`use_text_${e.textKind ?? 'spoken'}`)}</div>
          {e.text
            ? <p className="whitespace-pre-wrap text-gray-800 bg-[var(--paper,#F7F5F0)] border border-gray-200 rounded p-3 max-h-64 overflow-y-auto">{e.text}</p>
            : <p className="text-gray-500">{t('use_text_none')}</p>}
        </div>
      )}

      {e.output && (
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">{t('use_output_h')}</div>
          {!e.output.ready ? (
            <p className="text-gray-500">{t('use_output_pending')}</p>
          ) : lenke ? (
            <div className="space-y-1">
              {e.output.kind === 'audio' && <audio controls src={lenke} className="w-full max-w-md" />}
              {e.output.kind === 'video' && <video controls src={lenke} className="w-full max-w-md rounded border border-gray-200" />}
              {e.output.kind === 'image' && <img src={lenke} alt="" className="max-h-80 w-auto rounded border border-gray-200" />}
              <a href={lenke} target="_blank" rel="noreferrer" className="text-xs text-[var(--ember-deep,#B4532A)] hover:underline">{t('use_output_open')}</a>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <button onClick={hent} disabled={henter}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-gray-300 text-gray-800 hover:border-[var(--ember-deep,#B4532A)] disabled:opacity-50">
                {henter ? t('use_output_loading') : t(`use_output_get_${e.output.kind}`)}
              </button>
              {feil && <span className="text-xs text-red-700">{t('use_output_error')}</span>}
            </div>
          )}
        </div>
      )}

      {agency && e.insight !== 'full' && (
        <p className="text-xs text-gray-500">{t(e.insight === 'production' ? 'use_held_back_production' : 'use_held_back_script')}</p>
      )}
    </div>
  )
}
