'use client'

import { useCallback, useEffect, useState } from 'react'
import { useTranslations, useLocale } from 'next-intl'
import { getSupabase } from '@/lib/supabaseClient'
import { datasettNavn } from '@/lib/sang'

// Sangstemmen på skuespillerkortet (127, 28.10.2026).
//
// Gangen: opptakene velges her → nettleseren pakker dem i en zip
// (dataset/<navn>/*.wav, slik treneren vil ha dem) og laster den rett til den
// private bøtta → treningen startes hos Replicate → modellen kopieres hit når
// den er ferdig → en vokal gjøres om som prøve → rettighetshaveren hører den og
// svarer på /min-stemme → modellen tas i bruk.
//
// 🔑 FRAMFØRINGEN KOMMER FRA DEN SOM SYNGER FORSANGEN. Modellen gir klangen.
// Prøven bør derfor være en vokal i sangerens toneleie, gjerne sunget av noen
// andre — det er slik modellen skal brukes.

type Kilde = 'recorded' | 'generated'
interface Modell {
  id: string; status: string; source: Kilde; sourceNote: string | null; declaration: string
  declaredBy: string; declaredAt: string; trainingSeconds: number | null; modelBytes: number | null
  lastError: string | null; sample: 'none' | 'running' | 'ready'; sampleUrl: string | null
  approval: string; approvedAt: string | null; createdAt: string; active: boolean
}
interface Kort {
  enabled: boolean; configured: boolean; artistKind?: 'human' | 'virtual'; offersSinging?: boolean
  virtualDeclaration?: string | null; virtualDeclaredAt?: string | null; activeModelId?: string | null
  sources?: Array<{ source: Kilde; declaration: string }>; intakeAccepted?: boolean; models?: Modell[]
}

const BCP47: Record<string, string> = { no: 'nb-NO', en: 'en-GB' }

/** Lengden på en lydfil, lest av nettleseren. 0 hvis den ikke kan leses. */
function varighet(f: File): Promise<number> {
  return new Promise((ok) => {
    const url = URL.createObjectURL(f)
    const a = new Audio()
    const ferdig = (s: number) => { URL.revokeObjectURL(url); ok(Number.isFinite(s) ? s : 0) }
    a.preload = 'metadata'
    a.onloadedmetadata = () => ferdig(a.duration)
    a.onerror = () => ferdig(0)
    a.src = url
  })
}

async function sha256(blob: Blob): Promise<string> {
  const h = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer())
  return Array.from(new Uint8Array(h)).map((b) => b.toString(16).padStart(2, '0')).join('')
}

export default function SangstemmeBoks({ actorId, actorName }: { actorId: string; actorName: string }) {
  const t = useTranslations('actorAdmin')
  const bcp = BCP47[useLocale()] || 'en-GB'
  const dato = (s: string) => new Date(s).toLocaleDateString(bcp, { day: 'numeric', month: 'short', year: 'numeric' })
  const min = (sek: number) => `${Math.floor(sek / 60)}:${String(Math.round(sek % 60)).padStart(2, '0')}`

  const [kort, setKort] = useState<Kort | null>(null)
  const [feil, setFeil] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('')
  const [filer, setFiler] = useState<File[]>([])
  const [sekunder, setSekunder] = useState(0)
  const [kilde, setKilde] = useState<Kilde | ''>('')
  const [notat, setNotat] = useState('')
  const [proeveFil, setProeveFil] = useState<Record<string, File | null>>({})
  const [halvtoner, setHalvtoner] = useState<Record<string, string>>({})

  const kall = useCallback(async (init?: RequestInit) => {
    const { data: sess } = await getSupabase().auth.getSession()
    const token = sess?.session?.access_token
    if (!token) throw new Error('Ikke innlogget')
    const res = await fetch(`/api/voice-bank/singing${init ? '' : `?actorId=${encodeURIComponent(actorId)}`}`, {
      ...init, headers: { ...(init?.headers || {}), Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    })
    const d = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(d.error || t('sing_err'))
    return d
  }, [actorId, t])

  useEffect(() => {
    let avbrutt = false
    kall().then((d) => { if (!avbrutt && 'enabled' in d) setKort(d as Kort) }).catch((e) => { if (!avbrutt) setFeil(e.message) })
    return () => { avbrutt = true }
  }, [kall])

  // Mens noe trener eller en prøve lages: se etter hvert halve minutt. Kallet
  // fullfører også treningen og prøven på serveren (lib/sangServer).
  const venter = !!kort?.models?.some((m) => m.status === 'training' || m.sample === 'running')
  useEffect(() => {
    if (!venter) return
    const id = setInterval(() => {
      kall().then((d) => { if ('enabled' in d) setKort(d as Kort) }).catch(() => undefined)
    }, 30000)
    return () => clearInterval(id)
  }, [venter, kall])

  const gjoer = async (init: RequestInit, sporsmaal?: string) => {
    if (sporsmaal && !window.confirm(sporsmaal)) return
    setBusy(true); setFeil(null)
    try { const d = await kall(init); if ('enabled' in d) setKort(d as Kort) }
    catch (e) { setFeil(e instanceof Error ? e.message : t('sing_err')) } finally { setBusy(false) }
  }

  const velgFiler = async (liste: FileList | null) => {
    const f = Array.from(liste || []).filter((x) => /\.(wav|flac|mp3|m4a|ogg)$/i.test(x.name))
    setFiler(f)
    let sum = 0
    for (const x of f) sum += await varighet(x)
    setSekunder(sum)
  }

  const lastOpp = async (kind: 'datasett' | 'inn', blob: Blob, ext: string, type: string) => {
    const up = await kall({ method: 'POST', body: JSON.stringify({ action: 'upload-url', actorId, kind, ext }) })
    if (!up.uploadUrl || !up.path) throw new Error(up.error || 'Fikk ikke opplastingslenke')
    const put = await fetch(up.uploadUrl, { method: 'PUT', body: blob, headers: { 'Content-Type': type } })
    if (!put.ok) throw new Error(`Opplastingen feilet (${put.status})`)
    return String(up.path)
  }

  const tren = async () => {
    if (!kilde || filer.length === 0) return
    setBusy(true); setFeil(null)
    try {
      const JSZip = (await import('jszip')).default
      const zip = new JSZip()
      // Treneren vil ha dataset/<navn>/*.wav (Replicate, train-rvc-model).
      const mappe = zip.folder('dataset')!.folder(datasettNavn(actorName))!
      filer.forEach((f, i) => {
        setStatus(t('sing_packing', { n: i + 1, of: filer.length }))
        mappe.file(`${String(i + 1).padStart(3, '0')}-${f.name.replace(/[^\w.-]+/g, '_')}`, f)
      })
      setStatus(t('sing_zipping'))
      // Lyd er alt komprimert eller stor uansett — STORE er raskest.
      const zipBlob = await zip.generateAsync({ type: 'blob', compression: 'STORE' })
      setStatus(t('sing_fingerprint'))
      const fingeravtrykk = await sha256(zipBlob)
      setStatus(t('sing_uploading'))
      const sti = await lastOpp('datasett', zipBlob, 'zip', 'application/zip')
      setStatus(t('sing_starting'))
      const d = await kall({ method: 'POST', body: JSON.stringify({ action: 'train', actorId, path: sti, sha256: fingeravtrykk, seconds: sekunder, source: kilde, sourceNote: notat }) })
      setKort(d as Kort)
      setFiler([]); setSekunder(0); setNotat('')
    } catch (e) { setFeil(e instanceof Error ? e.message : t('sing_err')) } finally { setBusy(false); setStatus('') }
  }

  const lagProeve = async (m: Modell) => {
    const f = proeveFil[m.id]
    if (!f) return
    setBusy(true); setFeil(null)
    try {
      const ext = (f.name.split('.').pop() || '').toLowerCase()
      setStatus(t('sing_uploading'))
      const sti = await lastOpp('inn', f, ext, f.type || 'audio/mpeg')
      setStatus(t('sing_converting'))
      const d = await kall({ method: 'POST', body: JSON.stringify({ action: 'sample', modelId: m.id, path: sti, semitones: Number(halvtoner[m.id] || 0) }) })
      setKort(d as Kort)
    } catch (e) { setFeil(e instanceof Error ? e.message : t('sing_err')) } finally { setBusy(false); setStatus('') }
  }

  if (!kort && !feil) return null
  const virtuell = kort?.artistKind === 'virtual'
  const erklaering = kort?.sources?.find((s) => s.source === kilde)?.declaration

  return (
    <div className="bg-[var(--paper-raised)] rounded-lg border border-gray-200 p-6 mb-6">
      <div className="flex flex-wrap items-center gap-2 mb-1">
        <h2 className="font-semibold text-gray-900">{t('sing_h')}</h2>
        {virtuell && <span className="text-xs px-2 py-0.5 rounded-full bg-violet-100 text-violet-800">{t('sing_virtual_badge')}</span>}
      </div>
      <p className="text-sm text-gray-600 mb-4 max-w-2xl">{t('sing_intro')}</p>

      {feil && <p className="mb-3 text-sm text-red-700">{feil}</p>}
      {kort && !kort.enabled && <p className="text-sm text-amber-700">{t('sing_not_enabled')}</p>}

      {kort?.enabled && (<>
        {virtuell && kort.virtualDeclaration && (
          <div className="mb-4 p-3 rounded-lg border border-violet-200 bg-violet-50 text-xs text-violet-900 max-w-2xl">
            <p className="font-semibold mb-1">{t('sing_virtual_decl', { date: kort.virtualDeclaredAt ? dato(kort.virtualDeclaredAt) : '—' })}</p>
            <p>{kort.virtualDeclaration}</p>
          </div>
        )}
        {!kort.configured && <p className="mb-4 text-sm text-amber-700">{t('sing_not_configured')}</p>}

        <label className="flex items-center gap-2 text-sm text-gray-700 mb-4">
          <input type="checkbox" checked={!!kort.offersSinging} disabled={busy}
            onChange={(e) => gjoer({ method: 'PATCH', body: JSON.stringify({ actorId, offersSinging: e.target.checked }) })} />
          {t('sing_offers')}
        </label>

        {/* Modellene, nyeste først */}
        {(kort.models || []).length > 0 && (
          <div className="space-y-3 mb-5">
            {(kort.models || []).map((m) => (
              <div key={m.id} className={`rounded-lg border p-4 text-sm ${m.active ? 'border-green-300 bg-green-50' : 'border-gray-200 bg-[var(--paper)]'}`}>
                <div className="flex flex-wrap items-center gap-2 mb-1">
                  <span className="font-medium text-gray-900">{t(`sing_status_${m.status}`)}</span>
                  {m.active && <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-800">{t('sing_active')}</span>}
                  <span className="text-xs text-gray-500">
                    {dato(m.createdAt)} · {t(m.source === 'generated' ? 'sing_src_generated' : 'sing_src_recorded')}
                    {m.sourceNote ? ` (${m.sourceNote})` : ''}
                    {m.trainingSeconds ? ` · ${min(m.trainingSeconds)}` : ''}
                  </span>
                </div>
                {m.lastError && <p className="text-xs text-red-700 mb-1">{m.lastError}</p>}
                {m.status === 'training' && <p className="text-xs text-gray-500">{t('sing_training_hint')}</p>}

                {m.status === 'ready' && (<>
                  <p className="text-xs text-gray-600 mt-1">
                    {m.approval === 'approved' ? t('sing_approved', { date: m.approvedAt ? dato(m.approvedAt) : '' })
                      : m.approval === 'rejected' ? t('sing_rejected')
                      : m.sample === 'ready' ? t('sing_waiting_answer') : t('sing_needs_sample')}
                  </p>
                  {m.sampleUrl && <audio controls src={m.sampleUrl} className="mt-2 w-full max-w-md" />}
                  {m.sample === 'running' && <p className="text-xs text-gray-500 mt-1">{t('sing_sample_running')}</p>}
                  {m.approval !== 'rejected' && m.sample !== 'running' && (
                    <div className="mt-3 flex flex-wrap items-end gap-2">
                      <label className="text-xs text-gray-600">{t('sing_sample_file')}
                        <input type="file" accept="audio/*" disabled={busy} className="block mt-1 text-xs"
                          onChange={(e) => setProeveFil((p) => ({ ...p, [m.id]: e.target.files?.[0] || null }))} />
                      </label>
                      <label className="text-xs text-gray-600">{t('sing_semitones')}
                        <select value={halvtoner[m.id] || '0'} disabled={busy}
                          onChange={(e) => setHalvtoner((p) => ({ ...p, [m.id]: e.target.value }))}
                          className="block mt-1 px-2 py-1 border border-gray-300 rounded text-xs bg-[var(--paper-raised)]">
                          <option value="-12">{t('sing_oct_down')}</option>
                          <option value="0">{t('sing_oct_none')}</option>
                          <option value="12">{t('sing_oct_up')}</option>
                        </select>
                      </label>
                      <button type="button" disabled={busy || !proeveFil[m.id] || !kort.configured} onClick={() => lagProeve(m)}
                        className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-gray-300 text-gray-700 disabled:opacity-50">
                        {t('sing_make_sample')}
                      </button>
                    </div>
                  )}
                  {m.approval === 'approved' && !m.active && (
                    <button type="button" disabled={busy} onClick={() => gjoer({ method: 'PATCH', body: JSON.stringify({ action: 'activate', modelId: m.id }) }, t('sing_activate_confirm'))}
                      className="mt-3 mr-2 px-3 py-1.5 rounded-lg text-xs font-semibold text-[var(--on-ember)] bg-[var(--ember-deep)] disabled:opacity-50">
                      {t('sing_activate')}
                    </button>
                  )}
                </>)}
                {(m.status === 'ready' || m.status === 'training') && (
                  <button type="button" disabled={busy} onClick={() => gjoer({ method: 'PATCH', body: JSON.stringify({ action: 'withdraw', modelId: m.id }) }, t('sing_withdraw_confirm'))}
                    className="mt-3 px-3 py-1.5 rounded-lg text-xs font-semibold border border-gray-300 text-gray-700 disabled:opacity-50">
                    {t('sing_withdraw')}
                  </button>
                )}
                <details className="mt-2 text-xs text-gray-500">
                  <summary className="cursor-pointer">{t('sing_declaration_show')}</summary>
                  <p className="mt-1">{m.declaration}</p>
                  <p className="mt-1">{t('sing_declared_by', { who: m.declaredBy, date: dato(m.declaredAt) })}</p>
                </details>
              </div>
            ))}
          </div>
        )}

        {/* Ny trening */}
        <div className="border-t border-gray-200 pt-4">
          <p className="text-sm font-medium text-gray-700 mb-1">{t('sing_new_h')}</p>
          <p className="text-xs text-gray-500 mb-3 max-w-2xl">{t('sing_new_hint')}</p>
          {!kort.intakeAccepted && <p className="text-xs text-amber-700 mb-3">{t('sing_intake_pending')}</p>}
          <div className="grid gap-3 max-w-xl">
            <label className="text-xs text-gray-600">{t('sing_source')}
              <select value={kilde} disabled={busy} onChange={(e) => setKilde(e.target.value as Kilde)}
                className="block w-full mt-1 px-3 py-2 border border-gray-300 rounded-lg text-sm bg-[var(--paper-raised)]">
                <option value="">—</option>
                {(kort.sources || []).map((s) => (
                  <option key={s.source} value={s.source}>
                    {t(s.source === 'generated' ? 'sing_src_generated' : virtuell ? 'sing_src_session' : 'sing_src_own')}
                  </option>
                ))}
              </select>
            </label>
            {kilde && (kilde === 'generated' || virtuell) && (
              <label className="text-xs text-gray-600">{t(kilde === 'generated' ? 'sing_note_tool' : 'sing_note_singer')}
                <input value={notat} onChange={(e) => setNotat(e.target.value)} disabled={busy} maxLength={200}
                  placeholder={kilde === 'generated' ? 'Suno v5.5' : ''}
                  className="block w-full mt-1 px-3 py-2 border border-gray-300 rounded-lg text-sm" />
              </label>
            )}
            {erklaering && <p className="text-xs text-gray-600 p-3 rounded-lg border border-gray-200 bg-[var(--paper)]">{erklaering}</p>}
            <label className="text-xs text-gray-600">{t('sing_files')}
              <input type="file" multiple accept=".wav,.flac,.mp3,.m4a,.ogg,audio/*" disabled={busy}
                onChange={(e) => velgFiler(e.target.files)} className="block mt-1 text-xs" />
            </label>
            {filer.length > 0 && (
              <p className={`text-xs ${sekunder > 0 && sekunder < 600 ? 'text-amber-700' : 'text-gray-600'}`}>
                {t('sing_files_summary', { n: filer.length, len: min(sekunder) })}
                {sekunder > 0 && sekunder < 600 ? ` ${t('sing_too_short')}` : ''}
              </p>
            )}
            <div>
              <button type="button" disabled={busy || !kilde || filer.length === 0 || !kort.configured || !kort.intakeAccepted} onClick={tren}
                className="px-4 py-2 rounded-lg text-sm font-semibold text-[var(--on-ember)] bg-[var(--ember-deep)] disabled:opacity-50">
                {busy && status ? status : t('sing_train')}
              </button>
            </div>
          </div>
        </div>
      </>)}
    </div>
  )
}
