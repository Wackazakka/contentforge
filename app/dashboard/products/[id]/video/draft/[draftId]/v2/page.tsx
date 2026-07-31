'use client'

// Segmentside V2 (design-handoff 31/7, «Godkjenn video-draft»):
// segmentene er hovedinnholdet (trekkspill, én åpen), alt globalt samles i
// sidepanelet (fase 2), kreditter som kort i stedet for flytende taxameter.
// Bygges VED SIDEN AV den gamle siden og byttes når den er komplett.
// Farger går via tenant-tokenene — ingen hardkodede design-hexer (Lars 31/7:
// «dagens lyse drakt, mottakelig for fargeendringer som de andre sidene»).

import { useState, useEffect, useRef } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { getSupabase } from '@/lib/supabaseClient'
import { useTenant } from '@/lib/tenantContext'
import { COSTS_NOK, fmtCredits } from '@/lib/costs'
import { VOICES, voiceName } from '@/lib/voices'
import { ownTracks, sharedMusic, tracksFolder, isMedleyFile, type MusicFile } from '@/lib/musicLibrary'

interface Segment {
  index: number
  text: string
  voiceover: string
  image_url: string
  approved: boolean
  voiceover_url?: string
  own_voice?: boolean
  hold_seconds?: number
  match_music?: boolean
  image_prompt?: string
  animate?: boolean
  motion?: 'none' | 'move' | 'talk'
  no_voice?: boolean
  clip_nonce?: string
  voice_used?: string
}

interface Draft {
  id: string
  product_id: string
  campaign_id: string
  title?: string
  cta?: string
  segments: Segment[]
  voice_id?: string
  music_file?: string | null
  video_format?: string
  ai_motion?: boolean
  ai_motion_engine?: string
  image_style?: string
  include_outro_card?: boolean
  outro_jingle?: string | null
  character_id?: string | null
  cost_accumulated?: number | null
}

// Sidepanel-rad: «nåværende verdi + Endre», utvider seg til velgeren
// (design-handoffen bruker sheets/popovers; inline utvidelse gir samme ro
// med langt mindre maskineri — og fungerer likt på mobil).
function SettingRow({
  label, value, empty, open, onToggle, last, children,
}: {
  label: string
  value: string
  empty?: boolean
  open: boolean
  onToggle: () => void
  last?: boolean
  children: React.ReactNode
}) {
  return (
    <div className={last ? '' : 'border-b border-gray-100'}>
      <button
        type="button"
        onClick={onToggle}
        className="w-full text-left px-5 py-3 hover:bg-gray-50/70 flex items-start justify-between gap-3"
      >
        <span className="min-w-0">
          <span className="block text-[11px] uppercase tracking-widest text-gray-400">{label}</span>
          <span className={`block text-[13.5px] mt-0.5 truncate ${empty ? 'text-gray-400' : 'text-gray-900'}`}>{value}</span>
        </span>
        <span className="flex-shrink-0 text-[12px] text-gray-400 mt-3">{open ? 'Lukk' : 'Endre'}</span>
      </button>
      {open && <div className="px-5 pb-4">{children}</div>}
    </div>
  )
}

export default function DraftV2Page() {
  const params = useParams()
  const router = useRouter()
  const searchParams = useSearchParams()
  const tenant = useTenant()
  const productId = params?.id as string
  const draftId = params?.draftId as string

  const [draft, setDraft] = useState<Draft | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [openIndex, setOpenIndex] = useState(0) // -1 = alle lukket
  const [voicePreviews, setVoicePreviews] = useState<Record<number, string>>({})
  const [voiceLoading, setVoiceLoading] = useState<Record<number, boolean>>({})
  const [starting, setStarting] = useState(false)
  const [productName, setProductName] = useState('')
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Sidepanel (fase 2): musikkbibliotek + hvilken rad som er åpen for endring
  const [musicLibrary, setMusicLibrary] = useState<MusicFile[]>([])
  const [openRow, setOpenRow] = useState<string | null>(null)
  const [musicDur, setMusicDur] = useState<number | null>(null)
  // Sceneverktøy (fase 3)
  const [imageLibrary, setImageLibrary] = useState<Array<{ url: string; name: string }>>([])
  const [imagePickerFor, setImagePickerFor] = useState<number | null>(null)
  const [libUploading, setLibUploading] = useState(false)
  const [recordingFor, setRecordingFor] = useState<number | null>(null)
  const [ownVoiceBusy, setOwnVoiceBusy] = useState<Record<number, boolean>>({})
  const mediaRec = useRef<MediaRecorder | null>(null)
  const recChunks = useRef<BlobPart[]>([])
  const [motionPreview, setMotionPreview] = useState<
    Record<number, { status: 'starting' | 'generating' | 'ready' | 'failed'; url?: string; error?: string }>
  >({})

  // Utpris-faktor (white-label): kunden ser priser med partnerens margin
  const pf = tenant.price_multiplier || 1

  useEffect(() => {
    ;(async () => {
      try {
        const supabase = getSupabase()
        const [{ data, error: dErr }, { data: prod }] = await Promise.all([
          supabase.from('production_drafts').select('*').eq('id', draftId).single(),
          supabase.from('products').select('name').eq('id', productId).single(),
        ])
        if (dErr || !data) throw new Error(dErr?.message || 'Fant ikke utkastet')
        setDraft(data as Draft)
        setProductName(prod?.name || '')
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Noe gikk galt')
      } finally {
        setLoading(false)
      }
    })()
  }, [draftId, productId])

  // Musikkbiblioteket (sidepanelets musikk-/jinglevelgere)
  useEffect(() => {
    fetch('/api/music')
      .then((r) => r.json())
      .then((d) => setMusicLibrary(d.files || []))
      .catch(() => { /* biblioteket er valgfritt */ })
  }, [])

  // Musikklengden driver tidslinjen og scene-anbefalingen
  useEffect(() => {
    const f = draft?.music_file
    if (!f) { setMusicDur(null); return }
    const a = new Audio(`/api/music/${encodeURIComponent(f)}`)
    a.preload = 'metadata'
    a.onloadedmetadata = () => setMusicDur(Number.isFinite(a.duration) ? a.duration : null)
    a.onerror = () => setMusicDur(null)
    return () => { a.onloadedmetadata = null; a.onerror = null }
  }, [draft?.music_file])

  // Oppsett-endringer lagres direkte på utkastet
  const updateDraftFields = async (patch: Partial<Draft>) => {
    setDraft((prev) => (prev ? { ...prev, ...patch } : prev))
    try {
      await getSupabase().from('production_drafts').update(patch).eq('id', draftId)
    } catch (err) {
      console.warn('[v2] lagring av oppsett feilet:', err)
    }
  }
  // ---- Sceneverktøy (fase 3): bilde, egen stemme, bevegelse, animasjon ----
  const refreshImageLibrary = async () => {
    try {
      const { data: sess } = await getSupabase().auth.getSession()
      const token = sess?.session?.access_token
      const d = await fetch(`/api/products/images?productId=${productId}`, token ? { headers: { Authorization: `Bearer ${token}` } } : undefined).then((r) => r.json())
      if (d.images) setImageLibrary(d.images)
    } catch { /* biblioteket er valgfritt */ }
  }
  useEffect(() => { if (productId) refreshImageLibrary() }, [productId]) // eslint-disable-line react-hooks/exhaustive-deps

  const setSegmentImage = (index: number, url: string) => {
    updateSegment(index, { image_url: url, approved: false })
    setImagePickerFor(null)
  }

  const uploadLibraryImage = async (file: File): Promise<string | null> => {
    setLibUploading(true)
    try {
      const { data: sess } = await getSupabase().auth.getSession()
      const fd = new FormData()
      fd.append('file', file)
      fd.append('productId', productId)
      const res = await fetch('/api/products/images', {
        method: 'POST',
        headers: sess?.session?.access_token ? { Authorization: `Bearer ${sess.session.access_token}` } : undefined,
        body: fd,
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Opplastingen feilet')
      await refreshImageLibrary()
      return data.url as string
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Opplastingen feilet')
      return null
    } finally {
      setLibUploading(false)
    }
  }

  const uploadOwnVoice = async (index: number, blob: Blob, mimeType: string, filename: string) => {
    setOwnVoiceBusy((p) => ({ ...p, [index]: true }))
    try {
      const { data: sess } = await getSupabase().auth.getSession()
      const fd = new FormData()
      fd.append('file', new File([blob], filename, { type: mimeType }))
      fd.append('draftId', draftId)
      fd.append('productId', productId)
      fd.append('segmentIndex', String(index))
      const res = await fetch('/api/content/own-voice', {
        method: 'POST',
        headers: sess?.session?.access_token ? { Authorization: `Bearer ${sess.session.access_token}` } : undefined,
        body: fd,
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Opplastingen feilet')
      updateSegment(index, { voiceover_url: data.url, own_voice: true })
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Opplastingen feilet')
    } finally {
      setOwnVoiceBusy((p) => ({ ...p, [index]: false }))
    }
  }

  const startRecording = async (index: number) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const rec = new MediaRecorder(stream)
      recChunks.current = []
      rec.ondataavailable = (e) => { if (e.data.size > 0) recChunks.current.push(e.data) }
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop())
        const blob = new Blob(recChunks.current, { type: rec.mimeType || 'audio/webm' })
        setRecordingFor(null)
        await uploadOwnVoice(index, blob, rec.mimeType || 'audio/webm', `scene-${index + 1}.webm`)
      }
      mediaRec.current = rec
      rec.start()
      setRecordingFor(index)
    } catch {
      alert('Fikk ikke tilgang til mikrofonen.')
    }
  }
  const stopRecording = () => mediaRec.current?.stop()

  const setNoVoice = (index: number, on: boolean) => {
    if (!draft) return
    const patch: Partial<Segment> = { no_voice: on }
    if (on && draft.segments[index].motion === 'talk') patch.motion = 'move'
    updateSegment(index, patch)
  }

  const updateMotion = (index: number, value: 'none' | 'move' | 'talk') =>
    updateSegment(index, { motion: value, animate: value === 'move' })

  const regenerateMotion = (index: number) =>
    updateSegment(index, { clip_nonce: String(Date.now()) })

  const previewMotion = async (index: number) => {
    setMotionPreview((p) => ({ ...p, [index]: { status: 'starting' } }))
    try {
      const res = await fetch('/api/content/preview-motion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ draftId, segmentIndex: index }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Kunne ikke starte forhåndsvisningen')
      if (Number(data.chargedNok) > 0) {
        setDraft((prev) => (prev ? { ...prev, cost_accumulated: (Number(prev.cost_accumulated) || 0) + Number(data.chargedNok) } : prev))
      }
      if (data.status === 'ready' && data.url) {
        setMotionPreview((p) => ({ ...p, [index]: { status: 'ready', url: data.url } }))
        return
      }
      setMotionPreview((p) => ({ ...p, [index]: { status: 'generating' } }))
      const deadline = Date.now() + 10 * 60 * 1000
      while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 5000))
        const st = await fetch(`/api/content/preview-motion?fp=${encodeURIComponent(data.fp)}`).then((r) => r.json()).catch(() => null)
        if (st?.status === 'ready' && st.url) {
          setMotionPreview((p) => ({ ...p, [index]: { status: 'ready', url: st.url } }))
          return
        }
        if (st?.status === 'failed') throw new Error(st.error || 'Genereringen feilet')
      }
      throw new Error('Tidsavbrudd — prøv igjen')
    } catch (err) {
      setMotionPreview((p) => ({ ...p, [index]: { status: 'failed', error: err instanceof Error ? err.message : 'Noe gikk galt' } }))
    }
  }

  // Bytte av stemme kaster de gamle AI-opptakene (se kommentar i gammel side):
  // ellers vinner de over den nye stemmen i produksjonen. Egne innspillinger
  // (own_voice) er artistens egen røst og beholdes.
  const changeVoice = async (voiceId: string) => {
    if (!draft) return
    const segments = draft.segments.map((s) => (s.own_voice ? s : { ...s, voiceover_url: undefined }))
    setDraft({ ...draft, voice_id: voiceId, segments })
    setVoicePreviews({})
    try {
      await getSupabase()
        .from('production_drafts')
        .update({ voice_id: voiceId, segments })
        .eq('id', draftId)
    } catch (err) {
      console.warn('[v2] stemmebytte feilet:', err)
    }
  }

  // «Film = musikkens lengde» ligger på hvert segment (som i gammel side)
  const setMatchMusic = (on: boolean) => {
    if (!draft) return
    const segments = draft.segments.map((s) => ({ ...s, match_music: on }))
    setDraft({ ...draft, segments })
    persistSegments(segments)
  }

  // Lagre segmentene (debounced ved tekstredigering, umiddelbart ellers)
  const persistSegments = async (segments: Segment[]) => {
    try {
      await getSupabase().from('production_drafts').update({ segments }).eq('id', draftId)
    } catch (err) {
      console.warn('[v2] lagring av segmenter feilet:', err)
    }
  }
  const updateSegment = (index: number, patch: Partial<Segment>, opts?: { debounce?: boolean }) => {
    setDraft((prev) => {
      if (!prev) return prev
      const segments = [...prev.segments]
      segments[index] = { ...segments[index], ...patch }
      if (saveTimer.current) clearTimeout(saveTimer.current)
      if (opts?.debounce) {
        saveTimer.current = setTimeout(() => persistSegments(segments), 800)
      } else {
        persistSegments(segments)
      }
      return { ...prev, segments }
    })
  }

  // Redigert innhold sender scenen tilbake til gjennomgang (design-handoff:
  // endret tekst skal aldri seile gjennom som «godkjent»)
  const editText = (index: number, field: 'text' | 'voiceover', value: string) => {
    updateSegment(index, { [field]: value, approved: false } as Partial<Segment>, { debounce: true })
  }
  const toggleApproved = (index: number) => {
    if (!draft) return
    updateSegment(index, { approved: !draft.segments[index].approved })
  }

  const previewVoice = async (index: number) => {
    if (!draft || draft.voice_id === 'own') return
    const seg = draft.segments[index]
    setVoiceLoading((p) => ({ ...p, [index]: true }))
    try {
      const res = await fetch('/api/content/preview-voiceover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: seg.voiceover, voiceId: draft.voice_id || 'nhvaqgRyAq6BmFs3WcdX', draftId, segmentIndex: index }),
      })
      const data = await res.json()
      if (data.url) {
        setVoicePreviews((p) => ({ ...p, [index]: data.url }))
        setDraft((prev) => {
          if (!prev) return prev
          const segments = [...prev.segments]
          segments[index] = { ...segments[index], voiceover_url: data.url, own_voice: false, voice_used: draft.voice_id || '' }
          persistSegments(segments)
          const paalopt = (Number(prev.cost_accumulated) || 0) + COSTS_NOK.voiceoverPreview + (Number(data.actorExtraNok) || 0)
          return { ...prev, segments, cost_accumulated: paalopt }
        })
      }
    } catch (err) {
      console.error('[v2] stemme-forhåndsvisning feilet:', err)
    } finally {
      setVoiceLoading((p) => ({ ...p, [index]: false }))
    }
  }

  const startProduction = async () => {
    if (!draft) return
    setStarting(true)
    try {
      const { data: sess } = await getSupabase().auth.getSession()
      const res = await fetch('/api/start-production', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          draftId,
          userId: sess?.session?.user?.id || null,
          // Valgene er persistert på utkastet (image_style, ai_motion, …) —
          // startProductionForDraft leser dem derfra når opts uteblir
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Produksjonen kunne ikke starte')
      const fmt = draft.video_format || '9:16'
      window.location.href = `/dashboard/products/${productId}/video/status/${data.jobId}?format=${encodeURIComponent(fmt)}&motion=${draft.ai_motion ? '1' : '0'}`
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Noe gikk galt')
      setStarting(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--paper)] flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-[var(--ember-deep)] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }
  if (error || !draft) {
    return (
      <div className="min-h-screen bg-[var(--paper)] flex items-center justify-center">
        <p className="text-red-700">{error || 'Fant ikke utkastet'}</p>
      </div>
    )
  }

  const segments = draft.segments || []
  const approvedCount = segments.filter((s) => s.approved).length
  const allApproved = approvedCount === segments.length && segments.length > 0
  const pendingCount = segments.length - approvedCount
  const paaloptNok = (Number(draft.cost_accumulated) || 0) * pf

  return (
    <div className="min-h-screen bg-[var(--paper)]">
      <div className="max-w-6xl mx-auto px-4 sm:px-8 pt-10 pb-20">
        {/* Sidehode */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link
            href={`/dashboard/products/${productId}`}
            className="text-[13px] text-gray-500 hover:text-[var(--ink)]"
          >
            ← Tilbake til artisten
          </Link>
          {/* Veien tilbake til den gamle siden mens V2 bygges ferdig */}
          <Link
            href={`/dashboard/products/${productId}/video/draft/${draftId}`}
            className="text-[13px] text-gray-500 underline hover:text-[var(--ink)]"
          >
            Tilbake til den gamle sidevisningen
          </Link>
        </div>
        <div className="mt-4 flex flex-col sm:flex-row sm:items-end gap-5 sm:gap-8">
          <div className="flex-1 min-w-0">
            <h1 className="text-4xl font-bold text-gray-900 tracking-tight">Godkjenn video-utkastet</h1>
            <p className="mt-3 text-[15px] text-gray-500 max-w-[52ch]">
              {productName ? `${productName}${draft.title ? ' — ' + draft.title : ''}. ` : ''}
              Gå gjennom hver scene, juster oppsettet, og send videoen i produksjon.
            </p>
          </div>
          <div className="flex flex-col items-start sm:items-end gap-2">
            <p className={`text-[13px] font-medium ${allApproved ? 'text-green-700' : 'text-amber-700'}`}>
              {allApproved
                ? `Alle ${segments.length} scenene er godkjent`
                : `${pendingCount} scene${pendingCount === 1 ? '' : 'r'} venter på godkjenning`}
            </p>
            <button
              type="button"
              onClick={startProduction}
              disabled={!allApproved || starting}
              className="px-6 py-3 rounded-xl text-[14.5px] font-semibold text-white bg-[var(--ember-deep)] hover:bg-[var(--ink)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {starting ? 'Starter…' : 'Start produksjon'}
            </button>
          </div>
        </div>

        {/* To kolonner: scener + (fase 2: sidepanel — nå kun kreditt-kortet) */}
        <div className="mt-9 grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px] gap-7 items-start">
          <div className="space-y-5">
          {/* Tidslinje — viser hvordan musikken deles på scenene (klikk åpner scenen) */}
          {musicDur !== null && musicDur > 1 && segments.length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-200 px-5 py-4">
              <div className="flex items-baseline justify-between gap-3 mb-3">
                <span className="text-[12px] uppercase tracking-widest text-gray-400">Tidslinje</span>
                <span className="text-[12.5px] text-gray-500">
                  {Math.round(musicDur)} sek musikk · {segments.length} scener · ca. {(musicDur / segments.length).toFixed(1)} sek per bilde
                </span>
              </div>
              <div className="flex gap-1">
                {segments.map((seg, i) => {
                  const start = (musicDur / segments.length) * i
                  const mm = Math.floor(start / 60)
                  const ss = Math.round(start % 60).toString().padStart(2, '0')
                  return (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setOpenIndex(openIndex === i ? -1 : i)}
                      className="flex-1 min-w-0 group"
                      title={`Scene ${i + 1}`}
                    >
                      <span
                        className={`block h-9 rounded-md border text-left px-1.5 pt-1 text-[11px] ${
                          openIndex === i
                            ? 'border-[var(--ember-deep)] bg-[var(--ember-tint-bg)] text-[var(--ember-deep)]'
                            : seg.approved
                              ? 'border-green-200 bg-green-50 text-green-800'
                              : 'border-gray-200 bg-gray-50 text-gray-500 group-hover:border-gray-300'
                        }`}
                      >
                        {i + 1}
                      </span>
                      <span className="block mt-1 text-[10.5px] text-gray-400 tabular-nums">{mm}:{ss}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* Scene-kortet */}
          <div className="bg-white rounded-2xl border border-gray-200">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between gap-3">
              <div className="flex items-baseline gap-3 min-w-0">
                <h2 className="text-base font-semibold text-gray-900">Scener</h2>
                <span className="text-[12.5px] text-gray-400 whitespace-nowrap">
                  {approvedCount} av {segments.length} godkjent
                </span>
              </div>
              <button
                type="button"
                onClick={() => setOpenIndex(-1)}
                className="px-3 py-1.5 rounded-lg border border-gray-300 text-[13px] text-gray-600 hover:border-gray-400 hover:text-gray-900"
              >
                Lukk alle
              </button>
            </div>

            {segments.map((seg, index) => {
              const open = openIndex === index
              return (
                <div
                  key={index}
                  className={`px-6 py-4 ${index < segments.length - 1 ? 'border-b border-gray-100' : ''} hover:bg-gray-50/60`}
                >
                  <div className="grid grid-cols-[64px_minmax(0,1fr)_auto] gap-4 items-start">
                    {/* Minibilde 9:16 */}
                    <button
                      type="button"
                      onClick={() => setOpenIndex(open ? -1 : index)}
                      className="w-16 rounded-lg overflow-hidden border border-gray-200 bg-black aspect-[9/16] flex-shrink-0"
                      title={open ? 'Lukk scenen' : 'Åpne scenen'}
                    >
                      {seg.image_url ? (
                        <img
                          src={seg.image_url}
                          alt=""
                          className={tenant.vertical === 'music' ? 'w-full h-full object-contain' : 'w-full h-full object-cover'}
                        />
                      ) : (
                        <div className="w-full h-full bg-gray-100" />
                      )}
                    </button>

                    {/* Innhold */}
                    <div className="min-w-0">
                      <div className="flex items-center gap-2.5 mb-1.5">
                        <span className="text-[11px] uppercase tracking-widest text-gray-400 whitespace-nowrap">
                          Scene {index + 1}
                        </span>
                        <span className={`inline-flex items-center gap-1.5 text-[11.5px] ${seg.approved ? 'text-green-700' : 'text-amber-700'}`}>
                          <span className={`w-[5px] h-[5px] rounded-full ${seg.approved ? 'bg-green-600' : 'bg-amber-500'}`} />
                          {seg.approved ? 'Godkjent' : 'Til gjennomgang'}
                        </span>
                        {seg.no_voice === true && (
                          <span className="text-[11.5px] text-gray-400">🔇 uten tale</span>
                        )}
                      </div>
                      {/* Teksten på skjermen — redigeres rett i lista */}
                      <textarea
                        value={seg.text}
                        onChange={(e) => editText(index, 'text', e.target.value)}
                        onFocus={() => setOpenIndex(index)}
                        rows={open ? 2 : 1}
                        className="w-full resize-none bg-transparent text-[16px] leading-snug text-gray-900 focus:outline-none focus:ring-2 focus:ring-[var(--ember-deep)] rounded-md px-1 -mx-1"
                      />

                      {/* Utvidet innhold */}
                      {open && (
                        <div className="mt-3 space-y-3">
                          {seg.no_voice !== true && (
                            <div className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3">
                              <p className="text-[11px] uppercase tracking-widest text-gray-400 mb-1.5">Voiceover</p>
                              <textarea
                                value={seg.voiceover}
                                onChange={(e) => editText(index, 'voiceover', e.target.value)}
                                rows={2}
                                className="w-full resize-none bg-transparent text-[14px] leading-relaxed text-gray-700 focus:outline-none"
                              />
                              {(voicePreviews[index] || (seg.own_voice && seg.voiceover_url)) && (
                                <audio controls src={voicePreviews[index] || seg.voiceover_url} className="mt-2 w-full h-8" />
                              )}
                            </div>
                          )}
                          <div className="flex flex-wrap items-center gap-2">
                            {seg.no_voice !== true && draft.voice_id !== 'own' && (
                              <button
                                type="button"
                                onClick={() => previewVoice(index)}
                                disabled={voiceLoading[index]}
                                className="px-3.5 py-2 rounded-lg border border-[var(--ember-tint-border)] bg-[var(--ember-tint-bg)] text-[13px] font-medium text-[var(--ember-deep)] hover:border-[var(--ember-deep)] disabled:opacity-50"
                              >
                                {voiceLoading[index] ? 'Genererer…' : '▶ Hør stemmen'}
                              </button>
                            )}
                            {/* Egen stemme */}
                            {seg.no_voice !== true && (
                              seg.own_voice && seg.voiceover_url ? (
                                <button
                                  type="button"
                                  onClick={() => updateSegment(index, { voiceover_url: undefined, own_voice: false })}
                                  className="px-3 py-2 rounded-lg border border-gray-300 text-[13px] text-gray-600 hover:border-gray-400"
                                >
                                  Fjern innspillingen
                                </button>
                              ) : ownVoiceBusy[index] ? (
                                <span className="text-[12.5px] text-gray-500">Laster opp…</span>
                              ) : recordingFor === index ? (
                                <button
                                  type="button"
                                  onClick={stopRecording}
                                  className="px-3 py-2 rounded-lg bg-red-600 text-white text-[13px] font-medium animate-pulse"
                                >
                                  ⏹ Stopp opptaket
                                </button>
                              ) : (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => startRecording(index)}
                                    disabled={recordingFor !== null}
                                    className="px-3 py-2 rounded-lg border border-gray-300 text-[13px] text-gray-600 hover:border-gray-400 disabled:opacity-40"
                                  >
                                    🎙 Les inn selv
                                  </button>
                                  <label className="text-[12.5px] text-gray-500 underline cursor-pointer hover:text-gray-700">
                                    eller last opp lyd
                                    <input
                                      type="file"
                                      accept="audio/mpeg,audio/mp4,audio/x-m4a,audio/wav,audio/webm"
                                      className="hidden"
                                      onChange={async (e) => {
                                        const f = e.currentTarget.files?.[0]
                                        e.currentTarget.value = ''
                                        if (!f) return
                                        if (f.size > 20 * 1024 * 1024) { alert('Fila er for stor (maks 20 MB).'); return }
                                        await uploadOwnVoice(index, f, f.type || 'audio/mpeg', f.name)
                                      }}
                                    />
                                  </label>
                                </>
                              )
                            )}
                            <button
                              type="button"
                              onClick={() => setImagePickerFor(imagePickerFor === index ? null : index)}
                              className="px-3 py-2 rounded-lg border border-gray-300 text-[13px] text-gray-600 hover:border-gray-400"
                            >
                              📸 Bytt bilde
                            </button>
                            <label className="flex items-center gap-2 text-[13px] text-gray-600 cursor-pointer ml-auto">
                              <input
                                type="checkbox"
                                checked={seg.no_voice === true}
                                onChange={(e) => setNoVoice(index, e.currentTarget.checked)}
                                className="w-4 h-4"
                              />
                              Uten tale
                            </label>
                          </div>

                          {/* Bildevelger */}
                          {imagePickerFor === index && (
                            <div className="border border-gray-200 rounded-xl p-3">
                              <div className="grid grid-cols-5 sm:grid-cols-8 gap-2 mb-2">
                                {imageLibrary.length === 0 && (
                                  <p className="col-span-full text-[12px] text-gray-400">Ingen bilder ennå — last opp under.</p>
                                )}
                                {imageLibrary.map((img) => (
                                  <button
                                    key={img.url}
                                    type="button"
                                    onClick={() => setSegmentImage(index, img.url)}
                                    className={`aspect-square rounded-lg overflow-hidden border-2 ${seg.image_url === img.url ? 'border-[var(--ember-deep)]' : 'border-transparent hover:border-gray-300'}`}
                                  >
                                    <img src={img.url} alt={img.name} className="w-full h-full object-cover" />
                                  </button>
                                ))}
                              </div>
                              <label className="text-[12.5px] text-gray-600 cursor-pointer underline">
                                {libUploading ? 'Laster opp…' : '+ Last opp nytt bilde (maks 8 MB)'}
                                <input
                                  type="file"
                                  accept="image/png,image/jpeg,image/webp"
                                  className="hidden"
                                  disabled={libUploading}
                                  onChange={async (e) => {
                                    const f = e.currentTarget.files?.[0]
                                    e.currentTarget.value = ''
                                    if (!f) return
                                    const url = await uploadLibraryImage(f)
                                    if (url) setSegmentImage(index, url)
                                  }}
                                />
                              </label>
                            </div>
                          )}

                          {/* Bevegelse per scene */}
                          {draft.ai_motion && (
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-[12px] text-gray-400">Bevegelse:</span>
                              {([
                                { v: 'none' as const, label: 'Stillbilde', cost: 'gratis' },
                                { v: 'move' as const, label: 'Bevegelse', cost: fmtCredits(COSTS_NOK.animate5s * pf) },
                                { v: 'talk' as const, label: 'Snakk (lip-sync)', cost: `${fmtCredits(COSTS_NOK.lipsyncPerSec * pf)}/sek` },
                              ]).filter((o) => !(seg.no_voice === true && o.v === 'talk')).map((opt) => {
                                const current = seg.motion || (seg.animate === true ? 'move' : 'none')
                                return (
                                  <button
                                    key={opt.v}
                                    type="button"
                                    onClick={() => updateMotion(index, opt.v)}
                                    className={`px-3 py-1.5 rounded-full border text-[12px] font-medium ${
                                      current === opt.v
                                        ? 'bg-[var(--ember-deep)] text-white border-[var(--ember-deep)]'
                                        : 'bg-white text-gray-600 border-gray-300 hover:border-gray-400'
                                    }`}
                                  >
                                    {opt.label} <span className="opacity-70">({opt.cost})</span>
                                  </button>
                                )
                              })}
                              {(seg.motion || (seg.animate === true ? 'move' : 'none')) !== 'none' && (
                                <button
                                  type="button"
                                  onClick={() => regenerateMotion(index)}
                                  className={`px-3 py-1.5 rounded-full border text-[12px] font-medium ${
                                    seg.clip_nonce ? 'bg-amber-50 text-amber-800 border-amber-300' : 'bg-white text-gray-500 border-gray-300 hover:border-gray-400'
                                  }`}
                                  title="Neste produksjon lager denne animasjonen på nytt. De andre scenene gjenbrukes gratis."
                                >
                                  {seg.clip_nonce ? '↻ Lages på nytt' : '↻ Lag på nytt'}
                                </button>
                              )}
                              {(seg.motion || (seg.animate === true ? 'move' : 'none')) === 'move' && (
                                <button
                                  type="button"
                                  onClick={() => previewMotion(index)}
                                  disabled={['starting', 'generating'].includes(motionPreview[index]?.status || '')}
                                  className="px-3 py-1.5 rounded-full border border-[var(--ember-tint-border)] bg-[var(--ember-tint-bg)] text-[12px] font-medium text-[var(--ember-deep)] hover:border-[var(--ember-deep)] disabled:opacity-60"
                                >
                                  {motionPreview[index]?.status === 'starting' && '▶ Starter…'}
                                  {motionPreview[index]?.status === 'generating' && '▶ Lager klippet… (1–3 min)'}
                                  {!['starting', 'generating'].includes(motionPreview[index]?.status || '') && '▶ Se animasjonen'}
                                </button>
                              )}
                            </div>
                          )}
                          {motionPreview[index]?.status === 'ready' && motionPreview[index]?.url && (
                            <div>
                              <video src={motionPreview[index].url} controls playsInline className="rounded-lg border border-gray-200 max-h-64 bg-black" />
                              <p className="text-[11.5px] text-gray-400 mt-1">
                                Slik blir bevegelsen. Ikke fornøyd? «Lag på nytt» og se igjen.
                              </p>
                            </div>
                          )}
                          {motionPreview[index]?.status === 'failed' && (
                            <p className="text-[12px] text-red-700">{motionPreview[index].error}</p>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Radkontroller */}
                    <div className="flex flex-col items-end gap-2">
                      <button
                        type="button"
                        onClick={() => toggleApproved(index)}
                        className={`min-w-[104px] px-3.5 py-2 rounded-lg border text-[13px] font-medium transition-colors ${
                          seg.approved
                            ? 'border-gray-300 text-gray-600 hover:border-gray-400'
                            : 'border-[var(--ember-deep)] bg-[var(--ember-deep)] text-white hover:bg-[var(--ink)]'
                        }`}
                      >
                        {seg.approved ? 'Angre' : 'Godkjenn'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setOpenIndex(open ? -1 : index)}
                        className="w-[34px] h-[34px] rounded-lg border border-gray-300 text-gray-500 hover:border-gray-400 hover:text-gray-900 text-xs"
                        title={open ? 'Lukk' : 'Åpne'}
                      >
                        {open ? '▲' : '▼'}
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
          </div>

          {/* Sidepanel: alt globalt samlet (design-handoffens hovedgrep) */}
          <aside className="lg:sticky lg:top-6 space-y-4">
            <div className="bg-white rounded-2xl border border-gray-200 px-5 py-4">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-[13.5px] text-gray-500">Påløpt på utkastet</span>
                <span className="text-xl font-semibold text-gray-900 tabular-nums">{fmtCredits(paaloptNok)}</span>
              </div>
              <p className="mt-2 text-[11.5px] text-gray-400">
                Bilder og stemmer betales mens du jobber; animasjon ved produksjonsstart. Scener som er generert før gjenbrukes gratis.
              </p>
            </div>
            {/* Lyd — stemme, musikk, jingle */}
            <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
              <div className="px-5 py-3.5 border-b border-gray-100">
                <h3 className="text-sm font-semibold text-gray-900">Lyd</h3>
                <p className="text-[12px] text-gray-400 mt-0.5">Gjelder hele videoen</p>
              </div>

              {/* Stemme */}
              <SettingRow
                label="Stemme"
                value={voiceName(draft.voice_id)}
                open={openRow === 'voice'}
                onToggle={() => setOpenRow(openRow === 'voice' ? null : 'voice')}
              >
                <select
                  value={draft.voice_id || ''}
                  onChange={(e) => { changeVoice(e.target.value); setOpenRow(null) }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-[13px] bg-white"
                >
                  <option value="own">Din egen stemme — du leser inn selv</option>
                  {VOICES.map((v) => (
                    <option key={v.id} value={v.id}>{v.name}{v.desc ? ` — ${v.desc}` : ''}</option>
                  ))}
                </select>
                {draft.voice_id === 'own' && (
                  <p className="mt-1.5 text-[11.5px] text-gray-400">
                    Alle scener med tale må ha innlest lyd før produksjon.
                  </p>
                )}
              </SettingRow>

              {/* Bakgrunnsmusikk */}
              <SettingRow
                label="Bakgrunnsmusikk"
                value={
                  draft.music_file
                    ? `${(musicLibrary.find((m) => m.filename === draft.music_file)?.name) || draft.music_file.split('/').pop()}${musicDur ? ` · ${Math.round(musicDur)} sek` : ''}`
                    : 'Ingen musikk'
                }
                empty={!draft.music_file}
                open={openRow === 'music'}
                onToggle={() => setOpenRow(openRow === 'music' ? null : 'music')}
              >
                <select
                  value={draft.music_file || ''}
                  onChange={(e) => { updateDraftFields({ music_file: e.target.value || null }); setOpenRow(null) }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-[13px] bg-white"
                >
                  <option value="">Ingen musikk</option>
                  {(() => {
                    const egne = ownTracks(musicLibrary, productId)
                    const medleyer = egne.filter((m) => isMedleyFile(m.filename))
                    const laater = egne.filter((m) => !isMedleyFile(m.filename))
                    return (
                      <>
                        {medleyer.length > 0 && (
                          <optgroup label="Medleyene dine">
                            {medleyer.map((m) => <option key={m.filename} value={m.filename}>{m.name}</option>)}
                          </optgroup>
                        )}
                        {laater.length > 0 && (
                          <optgroup label="Låtene dine">
                            {laater.map((m) => <option key={m.filename} value={m.filename}>{m.name}</option>)}
                          </optgroup>
                        )}
                        {tenant.vertical !== 'music' && sharedMusic(musicLibrary).length > 0 && (
                          <optgroup label="Delt bibliotek">
                            {sharedMusic(musicLibrary).map((m) => <option key={m.filename} value={m.filename}>{m.name}</option>)}
                          </optgroup>
                        )}
                      </>
                    )
                  })()}
                </select>
                {draft.music_file && (
                  <audio controls preload="none" src={`/api/music/${encodeURIComponent(draft.music_file)}`} className="mt-2 w-full h-8" />
                )}
                <p className="mt-1.5 text-[11.5px] text-gray-400">
                  Laste opp låter eller bygge medley?{' '}
                  <Link href={`/dashboard/products/${productId}/video/draft/${draftId}`} className="underline hover:text-gray-600">
                    Gjøres på den gamle siden
                  </Link>{' '}
                  inntil videre.
                </p>
              </SettingRow>

              {/* Jingle */}
              <SettingRow
                label="Jingle (sluttplakat)"
                value={draft.outro_jingle ? (musicLibrary.find((m) => m.filename === draft.outro_jingle)?.name || draft.outro_jingle) : 'Ingen — musikken fortsetter'}
                empty={!draft.outro_jingle}
                open={openRow === 'jingle'}
                onToggle={() => setOpenRow(openRow === 'jingle' ? null : 'jingle')}
                last
              >
                <select
                  value={draft.outro_jingle || ''}
                  onChange={(e) => { updateDraftFields({ outro_jingle: e.target.value || null }); setOpenRow(null) }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-[13px] bg-white"
                >
                  <option value="">Ingen jingle — musikken fortsetter under plakaten</option>
                  {musicLibrary.filter((m) => (m.folder || '').startsWith('jingles')).map((m) => (
                    <option key={m.filename} value={m.filename}>{m.name}</option>
                  ))}
                </select>
              </SettingRow>
            </div>

            {/* Bilde og bevegelse */}
            <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
              <div className="px-5 py-3.5 border-b border-gray-100">
                <h3 className="text-sm font-semibold text-gray-900">Bilde og bevegelse</h3>
              </div>
              <div className="px-5 py-1">
                <label className="flex items-start gap-3 py-3 cursor-pointer border-b border-gray-100">
                  <input
                    type="checkbox"
                    checked={segments[0]?.match_music === true}
                    onChange={(e) => setMatchMusic(e.currentTarget.checked)}
                    className="w-4 h-4 mt-0.5"
                  />
                  <span className="min-w-0">
                    <span className="block text-[13.5px] text-gray-900">Film = musikkens lengde</span>
                    <span className="block text-[12px] text-gray-400 leading-relaxed mt-0.5">
                      Hvert bilde står til neste del av låten. Stemmen får alltid plass.
                    </span>
                  </span>
                </label>
                <label className="flex items-start gap-3 py-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={draft.ai_motion === true}
                    onChange={(e) => updateDraftFields({ ai_motion: e.currentTarget.checked })}
                    className="w-4 h-4 mt-0.5"
                  />
                  <span className="min-w-0">
                    <span className="block text-[13.5px] text-gray-900">AI-bevegelse (ekte video)</span>
                    <span className="block text-[12px] text-gray-400 leading-relaxed mt-0.5">
                      Bildene blir levende klipp i scenens lengde. Lengre render, koster per scene.
                    </span>
                  </span>
                </label>
                {draft.ai_motion && (
                  <div className="pb-3 pl-7">
                    <select
                      value={draft.ai_motion_engine || 'kling'}
                      onChange={(e) => updateDraftFields({ ai_motion_engine: e.target.value })}
                      className="px-2 py-1.5 border border-gray-300 rounded-lg text-[12.5px] bg-white"
                    >
                      <option value="kling">Kling (anbefalt)</option>
                      <option value="pixverse">PixVerse (rask/billig)</option>
                    </select>
                  </div>
                )}
              </div>
            </div>

            {/* Anbefaling — samme regnestykke som gammel side, men med handling */}
            {segments[0]?.match_music === true && musicDur !== null && musicDur > 1 && (() => {
              const anbefalt = Math.max(2, Math.round(musicDur / 5))
              const perScene = musicDur / segments.length
              if (Math.abs(anbefalt - segments.length) <= 1) return null
              return (
                <div className="rounded-2xl border border-amber-300 bg-amber-50 px-5 py-4">
                  <p className="text-[12px] uppercase tracking-widest text-amber-700 mb-1.5">Anbefaling</p>
                  <p className="text-[13px] text-amber-900 leading-relaxed">
                    Musikken er {Math.round(musicDur)} sek. Med {segments.length} scener står hvert bilde i ca. {Math.round(perScene)} sek.
                    Vi anbefaler rundt {anbefalt} scener (~5 sek per bilde). Scener uten tale er helt fint — da bærer musikken.
                  </p>
                </div>
              )
            })()}

            <div className="bg-white rounded-2xl border border-gray-200 px-5 py-4">
              <p className="text-[12px] uppercase tracking-widest text-gray-400 mb-2">Sluttplakat</p>
              <p className="text-[13px] text-gray-500 leading-relaxed">
                Budskap, lenke, bilde og farger{' '}
                <Link
                  href={`/dashboard/products/${productId}/video/draft/${draftId}`}
                  className="text-[var(--ember-deep)] underline hover:text-[var(--ink)]"
                >
                  endres på den gamle siden
                </Link>
                . Medley-verkstedet ligger også der.
              </p>
            </div>
          </aside>
        </div>
      </div>
    </div>
  )
}
