'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'

// «Har du allerede en ansiktsmodell?» på /min-stemme (23.10.2026).
// Reglene står i app/api/voice-bank/own-model. Her: skjemaet og statusen.
//
// 🔑 FILA GÅR RETT TIL LAGRINGEN (signert lenke, XHR for framdrift). En
// Flux-LoRA er 100–350 MB; uten «47 %» ser en opplasting på ti minutter ut som
// en henging.

interface Status {
  eligible: boolean; reason: string | null; maxMb: number; declaration: string; hasFace: boolean
  models: Array<{ id: string; status: string; approval: string | null; emailSent: boolean; error: string | null; createdAt: string; base: string }>
}

export default function EgenModellPanel({ actorId, bearer }: { actorId: string; bearer: string }) {
  const t = useTranslations('myLedger')
  const [s, setS] = useState<Status | null>(null)
  const [aapen, setAapen] = useState(false)
  const [fil, setFil] = useState<File | null>(null)
  const [trigger, setTrigger] = useState('')
  const [base, setBase] = useState<'flux1' | 'flux2'>('flux1')
  const [erklaert, setErklaert] = useState(false)
  const [framdrift, setFramdrift] = useState<number | null>(null)
  const [steg, setSteg] = useState<string | null>(null)
  const [feil, setFeil] = useState<string | null>(null)
  const filInput = useRef<HTMLInputElement>(null)

  const hent = useCallback(async () => {
    const r = await fetch(`/api/voice-bank/own-model?actorId=${actorId}`, { headers: { Authorization: `Bearer ${bearer}` } })
    if (r.ok) setS(await r.json())
  }, [actorId, bearer])
  useEffect(() => { hent() }, [hent])

  const post = async (body: Record<string, unknown>) => {
    const r = await fetch('/api/voice-bank/own-model', {
      method: 'POST', headers: { Authorization: `Bearer ${bearer}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ actorId, ...body }),
    })
    const j = await r.json().catch(() => ({}))
    if (!r.ok) throw new Error(j.error || `Feil (${r.status})`)
    return j
  }

  const lastOpp = (url: string, f: File) => new Promise<void>((ok, nei) => {
    const x = new XMLHttpRequest()
    x.open('PUT', url)
    x.setRequestHeader('Content-Type', 'application/octet-stream')
    x.upload.onprogress = (e) => { if (e.lengthComputable) setFramdrift(Math.round((e.loaded / e.total) * 100)) }
    x.onload = () => (x.status >= 200 && x.status < 300 ? ok() : nei(new Error(x.status === 413 ? t('own_err_too_big_storage') : `opplasting feilet (${x.status})`)))
    x.onerror = () => nei(new Error(t('own_err_network')))
    x.send(f)
  })

  const send = async () => {
    // Si hva som mangler, i stedet for å låse knappen.
    if (!fil) { setFeil(t('own_need_file')); return }
    if (!trigger.trim()) { setFeil(t('own_need_trigger')); return }
    if (!erklaert) { setFeil(t('own_need_declaration')); return }
    setFeil(null)
    try {
      setSteg(t('own_step_upload')); setFramdrift(0)
      const l = await post({ handling: 'lenke', filename: fil.name, size: fil.size })
      await lastOpp(l.uploadUrl, fil)
      setFramdrift(null); setSteg(t('own_step_check'))
      const ny = await post({ handling: 'registrer', path: l.path, triggerWord: trigger.trim(), base, erklaert: true })
      setS(ny); setAapen(false); setFil(null); setTrigger(''); setErklaert(false)
    } catch (e) { setFeil(e instanceof Error ? e.message : t('own_err_generic')) }
    finally { setSteg(null); setFramdrift(null) }
  }

  if (!s) return null
  const statusTekst = (m: Status['models'][number]) =>
    m.status === 'failed' ? t('own_st_failed', { reason: m.error || '—' })
    : m.approval === 'approved' ? t('own_st_approved')
    : m.approval === 'rejected' ? t('own_st_rejected')
    : m.emailSent ? t('own_st_waiting_you')
    : t('own_st_checking')

  return (
    <div className="mb-8">
      <h2 className="font-semibold mb-1">{t('own_h')}</h2>
      <p className="text-sm text-gray-600 mb-3 max-w-xl">{t('own_lead')}</p>

      {s.models.length > 0 && (
        <ul className="mb-3 text-sm space-y-1">
          {s.models.map((m) => (
            <li key={m.id} className={m.status === 'failed' || m.approval === 'rejected' ? 'text-red-700' : 'text-gray-700'}>
              {new Date(m.createdAt).toLocaleDateString('nb-NO')} · {m.base === 'flux2' ? 'Flux 2' : 'Flux 1'} · {statusTekst(m)}
            </li>
          ))}
        </ul>
      )}

      {!s.eligible ? (
        <p className="text-sm text-amber-800">{s.reason}</p>
      ) : !aapen ? (
        <button onClick={() => { setAapen(true); setFeil(null) }}
          className="px-4 py-2 text-sm font-semibold border border-gray-300 hover:border-gray-500">
          {t('own_open')}
        </button>
      ) : (
        <div className="grid gap-3 max-w-xl border border-gray-200 p-4 bg-[var(--paper-raised,#fff)]">
          {s.hasFace && <p className="text-xs text-gray-600">{t('own_has_face_note')}</p>}
          <div>
            <input ref={filInput} type="file" accept=".safetensors" hidden onChange={(e) => { setFil(e.target.files?.[0] || null); e.target.value = '' }} />
            <button type="button" disabled={!!steg} onClick={() => filInput.current?.click()}
              className="px-3 py-1.5 text-sm border border-gray-300 hover:border-gray-500">
              {fil ? t('own_file_chosen', { name: fil.name, mb: Math.round(fil.size / 1e6) }) : t('own_choose_file')}
            </button>
            <p className="text-xs text-gray-500 mt-1">{t('own_file_hint', { max: s.maxMb })}</p>
          </div>
          <label className="text-xs text-gray-600">
            {t('own_trigger')}
            <input value={trigger} maxLength={40} onChange={(e) => setTrigger(e.target.value)} placeholder={t('own_trigger_ph')}
              className="mt-1 block w-full text-sm border border-gray-300 px-2 py-1.5" />
            <span className="block mt-0.5 text-gray-500">{t('own_trigger_hint')}</span>
          </label>
          <label className="text-xs text-gray-600">
            {t('own_base')}
            <select value={base} onChange={(e) => setBase(e.target.value as 'flux1' | 'flux2')} className="mt-1 block w-full text-sm border border-gray-300 px-2 py-1.5 bg-white">
              <option value="flux1">Flux 1 (dev)</option>
              <option value="flux2">Flux 2</option>
            </select>
          </label>
          <label className="text-sm flex items-start gap-2">
            <input type="checkbox" checked={erklaert} onChange={(e) => setErklaert(e.target.checked)} className="mt-1" />
            <span>{s.declaration}</span>
          </label>
          {steg && (
            <div>
              <p className="text-xs text-gray-600">{steg}{framdrift != null ? ` ${framdrift} %` : ''}</p>
              {framdrift != null && <div className="h-1 bg-gray-200 mt-1"><div className="h-1 bg-gray-800" style={{ width: `${framdrift}%` }} /></div>}
            </div>
          )}
          <div className="flex gap-2">
            <button disabled={!!steg} onClick={send} className="px-4 py-2 text-sm font-semibold text-white bg-[var(--ink,#1C1A16)] disabled:opacity-50">{t('own_send')}</button>
            <button disabled={!!steg} onClick={() => { setAapen(false); setFeil(null) }} className="px-4 py-2 text-sm border border-gray-300">{t('own_cancel')}</button>
          </div>
          <p className="text-xs text-gray-500">{t('own_after')}</p>
        </div>
      )}
      {feil && <p className="text-sm text-red-700 mt-2">{feil}</p>}
    </div>
  )
}
