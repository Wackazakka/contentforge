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
import { MOTION_STYLES } from '@/lib/motionStyles'
import { uploadSegmentVideo, VIDEO_MAX_BYTES } from '@/lib/uploadSegmentVideo'
import { VOICES as VOICES_FALLBACK, voiceName, type VoiceOption, languageForGroup } from '@/lib/voices'
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
  motion_style?: string
  motion_prompt?: string
  // Slipp munnen fri for mimikk (smil, latter) — prating holdes ute
  allow_mouth?: boolean
  // Artistens egen video som scenebakgrunn (1/8)
  video_url?: string
  video_name?: string
  // Historikk over genererte klipp (Lars 1/8: «hadde vært fint om de gamle
  // blir lagret slik at man kan skifte tilbake»). Filene ligger allerede i
  // dropletens cache — vi husker bare hvilken oppskrift som ga hvilket klipp.
  clip_history?: Array<{ nonce: string; url: string; style?: string; prompt?: string; ts: number }>
  // Tidligere innlesninger av DENNE scenen (Lars 3/8). Teksten lagres med, så
  // man ser hva som faktisk ble lest — den kan ha endret seg siden.
  voice_history?: Array<{ url: string; voice_id: string; text: string; ts: number }>
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
  outro_config?: { message?: string | null; url?: string; imageUrl?: string | null } | null
  // Merkekort mot rabatt (1/8)
  brand_card?: boolean
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
  // Artistens saldo (Lars 1/8: «hvor mange credits artisten har igjen»)
  const [saldo, setSaldo] = useState<number | null>(null)
  const hentSaldo = async () => {
    try {
      const { data: sess } = await getSupabase().auth.getSession()
      const token = sess?.session?.access_token
      if (!token) return
      const d = await fetch('/api/org-balance', { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.json())
      if (typeof d.balance === 'number') setSaldo(d.balance)
    } catch { /* ingen saldo aa vise */ }
  }
  useEffect(() => { hentSaldo() }, [])

  const [musicLibrary, setMusicLibrary] = useState<MusicFile[]>([])
  const [openRow, setOpenRow] = useState<string | null>(null)
  const [musicDur, setMusicDur] = useState<number | null>(null)
  // Stemmeutvalget hentes fra ElevenLabs-kontoen (se gammel side)
  const [VOICES, setVoices] = useState<VoiceOption[]>(VOICES_FALLBACK)
  useEffect(() => {
    fetch('/api/voices')
      .then((r) => r.json())
      .then((d) => { if (Array.isArray(d.voices) && d.voices.length) setVoices(d.voices) })
      .catch(() => { /* beholder fallback */ })
  }, [])
  // Sceneverktøy (fase 3)
  const [imageLibrary, setImageLibrary] = useState<Array<{ url: string; name: string }>>([])
  const [imagePickerFor, setImagePickerFor] = useState<number | null>(null)
  const [libUploading, setLibUploading] = useState(false)
  const [videoUploading, setVideoUploading] = useState<Record<number, boolean>>({})
  // Artistens klippbibliotek — ALLE genererte klipp, uavhengig av hvilken
  // produksjon de tilhoerte (Lars 2/8: «klippene tilhoerer artisten»)
  const [klippBank, setKlippBank] = useState<Array<{ name: string; url: string; laget: string | null }>>([])
  const [klippVelgerFor, setKlippVelgerFor] = useState<number | null>(null)
  const hentKlipp = async () => {
    try {
      const { data: sess } = await getSupabase().auth.getSession()
      const token = sess?.session?.access_token
      if (!token) return
      const d = await fetch(`/api/products/clips?productId=${productId}`, { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.json())
      if (Array.isArray(d.clips)) setKlippBank(d.clips)
    } catch { /* biblioteket er valgfritt */ }
  }
  useEffect(() => { if (productId) hentKlipp() }, [productId]) // eslint-disable-line react-hooks/exhaustive-deps
  // Artistens stemmebibliotek — alle AI-innlesninger, uavhengig av produksjon
  // (Lars 3/8). Speiler klippbiblioteket.
  const [stemmeBank, setStemmeBank] = useState<Array<{ name: string; url: string; voiceId: string; scene: number | null; laget: string | null }>>([])
  const [stemmeVelgerFor, setStemmeVelgerFor] = useState<number | null>(null)
  const hentStemmer = async () => {
    try {
      const { data: sess } = await getSupabase().auth.getSession()
      const token = sess?.session?.access_token
      if (!token) return
      const d = await fetch(`/api/products/voices?productId=${productId}`, { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.json())
      if (Array.isArray(d.opptak)) setStemmeBank(d.opptak)
    } catch { /* biblioteket er valgfritt */ }
  }
  useEffect(() => { if (productId) hentStemmer() }, [productId]) // eslint-disable-line react-hooks/exhaustive-deps
  const slettStemme = async (navn: string) => {
    if (!confirm('Slette dette opptaket fra biblioteket ditt?')) return
    try {
      const { data: sess } = await getSupabase().auth.getSession()
      const token = sess?.session?.access_token
      await fetch(`/api/products/voices?productId=${productId}&name=${encodeURIComponent(navn)}`, {
        method: 'DELETE',
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      })
      await hentStemmer()
    } catch { alert('Sletting feilet') }
  }
  const slettKlipp = async (navn: string) => {
    if (!confirm('Slette dette klippet fra biblioteket ditt?')) return
    try {
      const { data: sess } = await getSupabase().auth.getSession()
      const token = sess?.session?.access_token
      await fetch(`/api/products/clips?productId=${productId}&name=${encodeURIComponent(navn)}`, {
        method: 'DELETE',
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      })
      await hentKlipp()
    } catch { alert('Sletting feilet') }
  }
  const [lagring, setLagring] = useState<{ brukteMB: number; grenseMB: number; prosent: number } | null>(null)
  const hentLagring = async () => {
    try {
      const { data: sess } = await getSupabase().auth.getSession()
      const token = sess?.session?.access_token
      if (!token) return
      const d = await fetch(`/api/storage-usage?productId=${productId}`, { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.json())
      if (typeof d.brukteMB === 'number') setLagring(d)
    } catch { /* maaling er valgfri */ }
  }
  useEffect(() => { if (productId) hentLagring() }, [productId]) // eslint-disable-line react-hooks/exhaustive-deps
  const [recordingFor, setRecordingFor] = useState<number | null>(null)
  const [ownVoiceBusy, setOwnVoiceBusy] = useState<Record<number, boolean>>({})
  const mediaRec = useRef<MediaRecorder | null>(null)
  const recChunks = useRef<BlobPart[]>([])
  const [motionPreview, setMotionPreview] = useState<
    Record<number, { status: 'starting' | 'generating' | 'ready' | 'failed'; url?: string; error?: string; startet?: number }>
  >({})
  // Tikker mens en animasjon lages, så «det skjer noe»-linja teller sekunder
  // (Lars 3/8: «jeg ser ikke at det blir laget noe»). Går bare når noe jobber.
  const [naa, setNaa] = useState(0)
  const jobberNoe = Object.values(motionPreview).some((m) => m.status === 'starting' || m.status === 'generating')
  useEffect(() => {
    if (!jobberNoe) return
    const t = setInterval(() => setNaa(Date.now()), 1000)
    return () => clearInterval(t)
  }, [jobberNoe])

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
  // ---- Sluttplakat (portert fra gammel side) ----
  const [outroBg, setOutroBg] = useState('#1a1a2e')
  const [outroText, setOutroText] = useState('#ffffff')
  const [outroDefaults, setOutroDefaults] = useState<{ url: string; logoUrl: string }>({ url: '', logoUrl: '' })
  const [outroMessage, setOutroMessage] = useState<string | null>(null)
  const [outroUrl, setOutroUrl] = useState('')
  const [outroImage, setOutroImage] = useState('')
  const [outroPickerOpen, setOutroPickerOpen] = useState(false)
  useEffect(() => {
    ;(async () => {
      try {
        const { data: p } = await getSupabase()
          .from('product_profiles')
          .select('primary_color, secondary_color, website_url, logo_url')
          .eq('product_id', productId)
          .single()
        if (p?.primary_color) setOutroBg(p.primary_color)
        if (p?.secondary_color) setOutroText(p.secondary_color)
        setOutroDefaults({ url: p?.website_url || '', logoUrl: p?.logo_url || '' })
      } catch { /* profilen er valgfri */ }
    })()
  }, [productId])
  useEffect(() => {
    const oc = draft?.outro_config
    if (oc && typeof oc === 'object') {
      if (oc.message !== undefined && oc.message !== null) setOutroMessage(String(oc.message))
      if (oc.url) setOutroUrl(String(oc.url))
      if (oc.imageUrl === null) setOutroImage('none')
      else if (oc.imageUrl) setOutroImage(String(oc.imageUrl))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft?.id])
  const persistOutro = async (next: { message?: string | null; url?: string; image?: string }) => {
    const msg = next.message !== undefined ? next.message : outroMessage
    const url = next.url !== undefined ? next.url : outroUrl
    const img = next.image !== undefined ? next.image : outroImage
    const oc: Record<string, unknown> = {}
    if (msg !== null) oc.message = msg
    if (url.trim()) oc.url = url.trim()
    if (img === 'none') oc.imageUrl = null
    else if (img) oc.imageUrl = img
    try {
      await getSupabase().from('production_drafts').update({ outro_config: oc }).eq('id', draftId)
    } catch (err) { console.warn('[v2] plakat-lagring feilet:', err) }
  }
  const updateOutroColors = async (bg: string, text: string) => {
    setOutroBg(bg); setOutroText(text)
    try {
      await getSupabase().from('product_profiles').update({ primary_color: bg, secondary_color: text }).eq('product_id', productId)
    } catch (err) { console.warn('[v2] fargelagring feilet:', err) }
  }

  // ---- Medley (portert fra gammel side) ----
  const [medleyPicks, setMedleyPicks] = useState<string[]>([])
  const [medleyClip, setMedleyClip] = useState<'full' | '10' | '15' | '20' | '30'>('15')
  const [medleyBuilding, setMedleyBuilding] = useState(false)
  const [medleyResult, setMedleyResult] = useState<{ filename: string; name: string } | null>(null)
  const buildMedley = async () => {
    if (medleyPicks.length < 2) return
    setMedleyBuilding(true)
    setMedleyResult(null)
    try {
      const now = new Date()
      const navn = `medley-${now.toISOString().slice(0, 10)}-kl-${String(now.getHours()).padStart(2, '0')}.${String(now.getMinutes()).padStart(2, '0')}.${String(now.getSeconds()).padStart(2, '0')}`
      const res = await fetch('/api/music/medley', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          files: medleyPicks.map((f) => ({ filename: f, startSec: 0, clipSec: medleyClip === 'full' ? undefined : Number(medleyClip) })),
          folder: tracksFolder(productId),
          name: navn,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Miksingen feilet')
      const lib = await fetch('/api/music').then((r) => r.json())
      setMusicLibrary(lib.files || [])
      setMedleyResult({ filename: data.file?.filename || '', name: data.file?.name || navn })
      if (data.file?.filename) updateDraftFields({ music_file: data.file.filename })
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Miksingen feilet')
    } finally {
      setMedleyBuilding(false)
    }
  }

  // ---- Legg til / fjern scener (Lars 31/7) ----
  // Indeksene renummereres alltid, ellers går rekkefølgen i produksjonen i
  // stykker (job-queue sorterer på index).
  const reindex = (arr: Segment[]) => arr.map((s, i) => ({ ...s, index: i }))

  const addSegment = (afterIndex?: number) => {
    if (!draft) return
    const ny: Segment = {
      index: 0, text: '', voiceover: '', image_url: '', approved: false,
      match_music: draft.segments[0]?.match_music === true,
      motion: draft.ai_motion ? 'move' : undefined,
    }
    const arr = [...draft.segments]
    const pos = typeof afterIndex === 'number' ? afterIndex + 1 : arr.length
    arr.splice(pos, 0, ny)
    const segments = reindex(arr)
    setDraft({ ...draft, segments })
    persistSegments(segments)
    setOpenIndex(pos)
  }

  const removeSegment = (index: number) => {
    if (!draft) return
    if (draft.segments.length <= 2) {
      alert('Videoen må ha minst to scener.')
      return
    }
    const seg = draft.segments[index]
    const harInnhold = (seg.text || '').trim() || (seg.voiceover || '').trim() || seg.image_url
    if (harInnhold && !confirm(`Fjerne scene ${index + 1}? Teksten og bildevalget forsvinner.`)) return
    const segments = reindex(draft.segments.filter((_, i) => i !== index))
    setDraft({ ...draft, segments })
    persistSegments(segments)
    setOpenIndex(-1)
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

  // Slett bilde fra biblioteket (Lars 1/8: «man kan ikke slette bilder»).
  // API-et fantes, men var aldri koblet til noe man kunne trykke paa.
  const slettBilde = async (img: { url: string; name: string }) => {
    if (!confirm(`Slette «${img.name}» fra biblioteket? Scener som bruker bildet beholder det til du velger et annet.`)) return
    try {
      const { data: sess } = await getSupabase().auth.getSession()
      const token = sess?.session?.access_token
      const res = await fetch(`/api/products/images?productId=${productId}&name=${encodeURIComponent(img.name)}`, {
        method: 'DELETE',
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.error || 'Sletting feilet')
      }
      await refreshImageLibrary()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Sletting feilet')
    }
  }

  const lastOppVideo = async (index: number, file: File) => {
    setVideoUploading((p) => ({ ...p, [index]: true }))
    try {
      const v = await uploadSegmentVideo(file, productId)
      updateSegment(index, { video_url: v.url, video_name: v.name, approved: false })
      hentLagring()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Opplastingen feilet')
    } finally {
      setVideoUploading((p) => ({ ...p, [index]: false }))
    }
  }
  const fjernVideo = (index: number) =>
    updateSegment(index, { video_url: undefined, video_name: undefined })

  // Sett et ferdig klipp fra biblioteket rett inn i scenen (Lars 2/8:
  // «hvordan velger jeg det for å erstatte det jeg allerede har?»). Klippet
  // legges i SAMME felt som egen opplastet video — serveren bruker fila som
  // den er og lager ingen animasjon. Derfor koster det ingenting.
  const brukKlippFraBiblioteket = (index: number, k: { name: string; url: string }) => {
    updateSegment(index, { video_url: k.url, video_name: k.name, approved: false })
    // Et gammelt «ingen animasjon laget ennå» ble staaende og pekte paa en
    // knapp som var graa — beskjeden gjelder ikke lenger naar scenen har klipp
    setMotionPreview((p) => { const n = { ...p }; delete n[index]; return n })
    setKlippVelgerFor(null)
  }
  // Bibliotek-klipp og egen opplasting deler felt, men skal ikke hete det
  // samme i grensesnittet
  const erBibliotekKlipp = (url?: string) => (url || '').includes('/artist-clips/')

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

  // Bevegelsesstil per scene (Lars 1/8) — ny stil = nytt klipp
  const setMotionStyle = (index: number, style: string) => {
    updateSegment(index, { motion_style: style, clip_nonce: String(Date.now()) })
    setMotionPreview((p) => { const n = { ...p }; delete n[index]; return n })
  }
  const setMotionPrompt = (index: number, tekst: string) =>
    updateSegment(index, { motion_prompt: tekst, clip_nonce: String(Date.now()) })

  // «Lag en ny»: forkast og generer med én gang. Nonce må være lagret først
  // (serveren leser draften), derfor liten pause før preview-kallet.
  const nyAnimasjon = async (index: number) => {
    if (!draft) return
    setMotionPreview((p) => { const n = { ...p }; delete n[index]; return n })
    // Lagre nonce FØR forhåndsvisningen — serveren leser draften, så en
    // pause hadde vært et sjansespill (kunne gitt det gamle klippet igjen)
    const segments = [...draft.segments]
    // «Lag en ny» sier hva den vil: da skal et ferdig klipp vike (Lars 3/8 —
    // knappen var sperret, og eneste vei ut var «Fjern», som ikke sto noe om).
    // Klippet blir liggende i biblioteket, så ingenting går tapt.
    segments[index] = { ...segments[index], clip_nonce: String(Date.now()), video_url: undefined, video_name: undefined }
    setDraft({ ...draft, segments })
    await persistSegments(segments)
    await previewMotion(index)
  }

  // Legg klippet i scenens historikk (nyeste først, maks 6 — nok til å
  // sammenligne varianter uten at raden drukner)
  const huskKlipp = (index: number, url: string) => {
    setDraft((prev) => {
      if (!prev) return prev
      const seg = prev.segments[index]
      const nonce = seg.clip_nonce || 'original'
      const uten = (seg.clip_history || []).filter((h) => h.nonce !== nonce)
      const historikk = [
        { nonce, url, style: seg.motion_style || 'push-in', prompt: seg.motion_prompt || '', ts: Date.now() },
        ...uten,
      ].slice(0, 6)
      const segments = [...prev.segments]
      segments[index] = { ...seg, clip_history: historikk }
      persistSegments(segments)
      return { ...prev, segments }
    })
  }

  // Bytt tilbake til et tidligere klipp: sett oppskriften (nonce + stil +
  // tekst) tilbake, så treffer fingeravtrykket det gamle klippet i cachen —
  // gratis, ingen ny generering.
  const brukTidligereKlipp = async (index: number, h: { nonce: string; url: string; style?: string; prompt?: string }) => {
    if (!draft) return
    const segments = [...draft.segments]
    segments[index] = {
      ...segments[index],
      clip_nonce: h.nonce === 'original' ? undefined : h.nonce,
      motion_style: h.style || 'push-in',
      motion_prompt: h.prompt || '',
    }
    setDraft({ ...draft, segments })
    await persistSegments(segments)
    setMotionPreview((p) => ({ ...p, [index]: { status: 'ready', url: h.url } }))
  }

  const previewMotion = async (index: number, viewOnly = false) => {
    setMotionPreview((p) => ({ ...p, [index]: { status: 'starting', startet: Date.now() } }))
    try {
      const res = await fetch('/api/content/preview-motion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ draftId, segmentIndex: index, viewOnly }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Kunne ikke starte forhåndsvisningen')
      if (Number(data.chargedNok) > 0) {
        setDraft((prev) => (prev ? { ...prev, cost_accumulated: (Number(prev.cost_accumulated) || 0) + Number(data.chargedNok) } : prev))
      }
      if (data.status === 'ready' && data.url) {
        setMotionPreview((p) => ({ ...p, [index]: { status: 'ready', url: data.url } }))
        // Bare NYE klipp skal i historikken. Ved ren visning ville en
        // oppdatering her tegnet siden paa nytt midt i avspillingen
        // (Lars 1/8: «et sekund foer jeg faar tid til aa velge en annen»).
        if (!viewOnly && !data.reused) huskKlipp(index, data.url)
        return
      }
      // Ingen animasjon laget ennå — «Se animasjonen» skal ikke sette i gang noe
      if (data.status === 'none') {
        setMotionPreview((p) => ({
          ...p,
          [index]: { status: 'failed', error: 'Ingen animasjon er laget for denne scenen ennå — trykk «↻ Lag en ny».' },
        }))
        return
      }
      setMotionPreview((p) => ({ ...p, [index]: { status: 'generating', startet: p[index]?.startet || Date.now() } }))
      const deadline = Date.now() + 10 * 60 * 1000
      while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 5000))
        const st = await fetch(`/api/content/preview-motion?fp=${encodeURIComponent(data.fp)}`).then((r) => r.json()).catch(() => null)
        if (st?.status === 'ready' && st.url) {
          setMotionPreview((p) => ({ ...p, [index]: { status: 'ready', url: st.url } }))
          huskKlipp(index, st.url)
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
        body: JSON.stringify({ text: seg.voiceover, voiceId: draft.voice_id || 'nhvaqgRyAq6BmFs3WcdX', draftId, segmentIndex: index, languageCode: languageForGroup((VOICES.find((v) => v.id === draft.voice_id) as any)?.gruppe) }),
      })
      const data = await res.json()
      if (data.url) {
        setVoicePreviews((p) => ({ ...p, [index]: data.url }))
        setDraft((prev) => {
          if (!prev) return prev
          const segments = [...prev.segments]
          const forrige = segments[index]
          // Nyeste først, maks 6 — nok til å sammenligne innlesninger uten at
          // raden drukner (samme grense som klipphistorikken)
          const historikk = [
            { url: data.url, voice_id: draft.voice_id || '', text: forrige.voiceover || '', ts: Date.now() },
            ...(forrige.voice_history || []).filter((h) => h.url !== data.url),
          ].slice(0, 6)
          segments[index] = { ...forrige, voiceover_url: data.url, own_voice: false, voice_used: draft.voice_id || '', voice_history: historikk }
          persistSegments(segments)
          hentStemmer()
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

  // Ta i bruk et tidligere opptak — gratis, fila finnes. voice_used må settes
  // til stemmen som FAKTISK lagde opptaket: produksjonen forkaster lyd den
  // ikke kan gå god for (stempelet fra 31/7).
  // Slår opp i den DYNAMISKE stemmelista (den fra ElevenLabs-kontoen), ikke
  // bare den hardkodede — ellers ville britiske og amerikanske stemmer stått
  // som «ukjent» i biblioteket.
  const voiceNavn = (id?: string | null) =>
    VOICES.find((v) => v.id === id)?.name || VOICES_FALLBACK.find((v) => v.id === id)?.name || 'ukjent stemme'

  const brukOpptak = (index: number, o: { url: string; voiceId: string }) => {
    updateSegment(index, { voiceover_url: o.url, own_voice: false, voice_used: o.voiceId, approved: false })
    setVoicePreviews((p) => ({ ...p, [index]: o.url }))
    setStemmeVelgerFor(null)
  }
  // Et opptak laget med en annen stemme enn den som er valgt nå, ville blitt
  // stille forkastet i produksjonen. Da er det bedre å si det.
  const passerStemmen = (voiceId: string) => !!draft && draft.voice_id !== 'own' && voiceId === draft.voice_id

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
            href={`/dashboard/products/${productId}/video/draft/${draftId}?classic=1`}
            className="text-[13px] text-gray-500 underline hover:text-[var(--ink)]"
          >
            Bruk den gamle sidevisningen
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
            {saldo !== null && (
              <p className="text-[13px] text-gray-500">
                Du har <span className="font-semibold text-gray-900 tabular-nums">{fmtCredits(saldo)}</span> igjen
              </p>
            )}
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
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setOpenIndex(-1)}
                  className="px-3 py-1.5 rounded-lg border border-gray-300 text-[13px] text-gray-600 hover:border-gray-400 hover:text-gray-900"
                >
                  Lukk alle
                </button>
                <button
                  type="button"
                  onClick={() => addSegment()}
                  className="px-3 py-1.5 rounded-lg border border-gray-300 text-[13px] text-gray-600 hover:border-gray-400 hover:text-gray-900"
                >
                  + Legg til scene
                </button>
              </div>
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
                        {!seg.approved && (
                          <span className="inline-flex items-center gap-1.5 text-[11.5px] text-amber-700">
                            <span className="w-[5px] h-[5px] rounded-full bg-amber-500" />
                            Til gjennomgang
                          </span>
                        )}
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
                              {/* Vis avspilleren for ALL lyd som finnes — ikke bare
                                  egne innspillinger. AI-stemmer fra en tidligere
                                  oekt laa der uten avspiller, saa man ikke kunne
                                  hoere dem uten aa lage nye (Lars 2/8). */}
                              {(voicePreviews[index] || seg.voiceover_url) && (
                                <audio controls src={voicePreviews[index] || seg.voiceover_url} className="mt-2 w-full h-8" />
                              )}
                            </div>
                          )}
                          <div className="flex flex-wrap items-center gap-2">
                            {/* Finnes lyden alt, ligger den i avspilleren over —
                                da skal knappen LAGE en ny, ikke «hoere» (Lars 2/8:
                                samme feil som paa animasjonen). */}
                            {seg.no_voice !== true && draft.voice_id !== 'own' && (
                              <button
                                type="button"
                                onClick={() => previewVoice(index)}
                                disabled={voiceLoading[index]}
                                className="px-3.5 py-2 rounded-lg border border-[var(--ember-tint-border)] bg-[var(--ember-tint-bg)] text-[13px] font-medium text-[var(--ember-deep)] hover:border-[var(--ember-deep)] disabled:opacity-50"
                              >
                                {voiceLoading[index]
                                  ? 'Lager stemmen…'
                                  : (voicePreviews[index] || seg.voiceover_url)
                                    ? `↻ Lag ny stemme (${fmtCredits(COSTS_NOK.voiceoverPreview * pf)})`
                                    : `▶ Lag stemmen (${fmtCredits(COSTS_NOK.voiceoverPreview * pf)})`}
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
                            {seg.no_voice !== true && stemmeBank.length > 0 && (
                              <button
                                type="button"
                                onClick={() => setStemmeVelgerFor(stemmeVelgerFor === index ? null : index)}
                                className="px-3 py-2 rounded-lg border border-gray-300 text-[13px] text-gray-600 hover:border-gray-400"
                                title="Alle innlesninger du har laget — gratis å bruke om igjen"
                              >
                                🎙️ Stemmene dine ({stemmeBank.length})
                              </button>
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

                          {/* Tidligere innlesninger av DENNE scenen — gratis å
                              bytte tilbake til (Lars 3/8) */}
                          {seg.no_voice !== true && (seg.voice_history || []).length > 1 && (
                            <div>
                              <p className="text-[11px] uppercase tracking-widest text-gray-400 mb-1.5">
                                Tidligere innlesninger ({(seg.voice_history || []).length})
                              </p>
                              <div className="space-y-1.5">
                                {(seg.voice_history || []).map((h) => {
                                  const aktiv = seg.voiceover_url === h.url
                                  const brukbar = passerStemmen(h.voice_id)
                                  return (
                                    <div key={h.url} className={`flex flex-wrap items-center gap-2 rounded-lg px-2 py-1.5 ${aktiv ? 'bg-[var(--ember-tint-bg)]' : 'bg-gray-50'}`}>
                                      <audio controls src={h.url} className="h-8 flex-1 min-w-[180px]" />
                                      <span className="text-[11px] text-gray-400">
                                        {voiceNavn(h.voice_id)} · {new Date(h.ts).toLocaleString('nb-NO', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                                      </span>
                                      {aktiv ? (
                                        <span className="text-[11.5px] font-medium text-[var(--ember-deep)]">i bruk</span>
                                      ) : (
                                        <button
                                          type="button"
                                          onClick={() => brukOpptak(index, { url: h.url, voiceId: h.voice_id })}
                                          disabled={!brukbar}
                                          title={brukbar ? '' : `Laget med ${voiceNavn(h.voice_id)} — bytt til den stemmen i sidepanelet for å bruke opptaket`}
                                          className="text-[11.5px] px-2 py-1 rounded-full border border-gray-300 text-gray-600 hover:border-[var(--ember-deep)] hover:text-[var(--ember-deep)] disabled:opacity-40 disabled:hover:border-gray-300 disabled:hover:text-gray-600"
                                        >
                                          {brukbar ? 'Bruk denne' : 'annen stemme'}
                                        </button>
                                      )}
                                      {h.text && h.text !== seg.voiceover && (
                                        <span className="w-full text-[11px] text-gray-400 italic truncate">Leste: «{h.text}»</span>
                                      )}
                                    </div>
                                  )
                                })}
                              </div>
                              <p className="text-[11px] text-gray-400 mt-1">
                                Gratis å bytte mellom — opptakene er allerede laget.
                              </p>
                            </div>
                          )}

                          {/* Artistens stemmebibliotek — ALT som er lest inn,
                              uansett hvilken produksjon det tilhørte */}
                          {stemmeVelgerFor === index && (
                            <div>
                              <p className="text-[11px] uppercase tracking-widest text-gray-400 mb-1.5">
                                Stemmene dine — gratis å bruke om igjen
                              </p>
                              <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
                                {stemmeBank.map((o) => {
                                  const aktiv = seg.voiceover_url === o.url
                                  const brukbar = passerStemmen(o.voiceId)
                                  return (
                                    <div key={o.name} className={`flex flex-wrap items-center gap-2 rounded-lg px-2 py-1.5 ${aktiv ? 'bg-[var(--ember-tint-bg)]' : 'bg-gray-50'}`}>
                                      <audio controls src={o.url} preload="none" className="h-8 flex-1 min-w-[180px]" />
                                      <span className="text-[11px] text-gray-400">
                                        {voiceNavn(o.voiceId)}
                                        {o.scene !== null ? ` · scene ${o.scene + 1}` : ''}
                                        {o.laget ? ` · ${new Date(o.laget).toLocaleString('nb-NO', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}` : ''}
                                      </span>
                                      {aktiv ? (
                                        <span className="text-[11.5px] font-medium text-[var(--ember-deep)]">i bruk</span>
                                      ) : (
                                        <button
                                          type="button"
                                          onClick={() => brukOpptak(index, o)}
                                          disabled={!brukbar}
                                          title={brukbar ? '' : `Laget med ${voiceNavn(o.voiceId)} — bytt til den stemmen i sidepanelet for å bruke opptaket`}
                                          className="text-[11.5px] px-2 py-1 rounded-full border border-gray-300 text-gray-600 hover:border-[var(--ember-deep)] hover:text-[var(--ember-deep)] disabled:opacity-40 disabled:hover:border-gray-300 disabled:hover:text-gray-600"
                                        >
                                          {brukbar ? 'Bruk i denne scenen' : 'annen stemme'}
                                        </button>
                                      )}
                                      <button
                                        type="button"
                                        onClick={() => slettStemme(o.name)}
                                        title="Slett fra biblioteket"
                                        className="text-[11px] text-gray-400 hover:text-red-600"
                                      >
                                        ✕
                                      </button>
                                    </div>
                                  )
                                })}
                              </div>
                              <p className="text-[11px] text-gray-400 mt-1">
                                Alt du har lest inn, nyeste først. Opptak laget med en annen stemme enn den
                                scenen bruker nå, kan ikke velges — bytt stemme i sidepanelet først, ellers
                                ville filmen fått to forskjellige røster.
                              </p>
                            </div>
                          )}

                          {/* Bildevelger */}
                          {imagePickerFor === index && (
                            <div className="border border-gray-200 rounded-xl p-3">
                              <div className="grid grid-cols-5 sm:grid-cols-8 gap-2 mb-2">
                                {imageLibrary.length === 0 && (
                                  <p className="col-span-full text-[12px] text-gray-400">Ingen bilder ennå — last opp under.</p>
                                )}
                                {imageLibrary.map((img) => (
                                  <div key={img.url} className="relative group">
                                    <button
                                      type="button"
                                      onClick={() => setSegmentImage(index, img.url)}
                                      className={`w-full aspect-square rounded-lg overflow-hidden border-2 ${seg.image_url === img.url ? 'border-[var(--ember-deep)]' : 'border-transparent hover:border-gray-300'}`}
                                    >
                                      <img src={img.url} alt={img.name} className="w-full h-full object-cover" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => slettBilde(img)}
                                      title="Slett fra biblioteket"
                                      className="absolute top-1 right-1 w-5 h-5 rounded-full bg-white/90 border border-gray-300 text-gray-500 text-[11px] leading-none opacity-0 group-hover:opacity-100 hover:text-red-600 hover:border-red-300"
                                    >
                                      ✕
                                    </button>
                                  </div>
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

                          {/* Egen video som scenebakgrunn — gratis, slaar AI-animasjon */}
                          <div className="flex flex-wrap items-center gap-2">
                            {seg.video_url ? (
                              <>
                                <span className="text-[12px] text-green-700">
                                  {erBibliotekKlipp(seg.video_url)
                                    ? '🎞️ Klipp fra biblioteket ditt'
                                    : `🎬 Egen video: ${seg.video_name || 'klipp'}`}
                                </span>
                                {klippBank.length > 0 && (
                                  <button
                                    type="button"
                                    onClick={() => setKlippVelgerFor(klippVelgerFor === index ? null : index)}
                                    className="text-[12px] text-gray-500 underline hover:text-gray-700"
                                  >
                                    Velg et annet
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() => fjernVideo(index)}
                                  className="text-[12px] text-gray-500 underline hover:text-gray-700"
                                >
                                  Fjern
                                </button>
                              </>
                            ) : (
                              <label className="text-[12px] text-gray-600 cursor-pointer">
                                <span className="underline hover:text-gray-900">
                                  {videoUploading[index] ? 'Laster opp klippet…' : '🎬 Bruk egen video i denne scenen'}
                                </span>
                                <input
                                  type="file"
                                  accept="video/mp4,video/quicktime,video/webm"
                                  className="hidden"
                                  disabled={!!videoUploading[index]}
                                  onChange={async (e) => {
                                    const f = e.currentTarget.files?.[0]
                                    e.currentTarget.value = ''
                                    if (f) await lastOppVideo(index, f)
                                  }}
                                />
                              </label>
                            )}
                            <span className="text-[11.5px] text-gray-400">
                              {seg.video_url
                                ? 'Brukes som den er, uten lyd — musikken spiller. Ingen animasjon lages, så det koster ingenting.'
                                : `Liveopptak e.l., maks ${Math.round(VIDEO_MAX_BYTES / 1024 / 1024)} MB. Gratis — ingen animasjon lages.`}
                            </span>
                          </div>

                          {/* Klippet scenen FAKTISK bruker skal alltid kunne
                              ses (Lars 3/8). Forhaandsvisningsruta under viser
                              bare klipp som er GENERERT i denne oekten — et
                              klipp hentet fra arkivet hadde ingen spiller,
                              bare en etikett. Samme feil som stemmen hadde. */}
                          {seg.video_url && (
                            <div>
                              <video
                                key={seg.video_url}
                                src={seg.video_url}
                                controls
                                playsInline
                                preload="metadata"
                                className="rounded-lg border border-gray-200 max-h-64 bg-black"
                              />
                              <p className="text-[11.5px] text-gray-400 mt-1">
                                Dette klippet står i scenen nå.
                              </p>
                            </div>
                          )}

                          {/* Bevegelse per scene. Et ferdig klipp overstyrer
                              animasjonen, men valgene skjules IKKE (Lars 3/8:
                              «redigeringsmulighetene forsvant») — de blir
                              dempet, saa scenen fortsatt kan stilles inn og
                              staar klar den dagen klippet fjernes. */}
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
                              {(seg.motion || (seg.animate === true ? 'move' : 'none')) === 'move' && (() => {
                                const st = motionPreview[index]?.status || ''
                                const jobber = ['starting', 'generating'].includes(st)
                                // «Se animasjonen» ville vist et klipp som
                                // uansett ikke havner i filmen — den sperres
                                // mens et ferdig klipp staar i scenen.
                                // «Lag en ny» er derimot et TYDELIG oenske, og
                                // rydder klippet av veien selv.
                                const harKlipp = !!seg.video_url
                                return (
                                  <>
                                    <select
                                      value={seg.motion_style || 'push-in'}
                                      onChange={(e) => setMotionStyle(index, e.target.value)}
                                      className="px-2.5 py-1.5 rounded-full border border-gray-300 text-[12px] bg-white text-gray-700"
                                      title="Hvordan kameraet skal bevege seg i denne scenen"
                                    >
                                      {MOTION_STYLES.map((m) => (
                                        <option key={m.v} value={m.v}>{m.label}</option>
                                      ))}
                                    </select>
                                    <button
                                      type="button"
                                      onClick={() => previewMotion(index, true)}
                                      disabled={jobber || harKlipp}
                                      className="px-3 py-1.5 rounded-full border border-[var(--ember-tint-border)] bg-[var(--ember-tint-bg)] text-[12px] font-medium text-[var(--ember-deep)] hover:border-[var(--ember-deep)] disabled:opacity-60"
                                      title={harKlipp
                                        ? 'Scenen bruker et ferdig klipp — det vises over'
                                        : 'Viser klippet som blir brukt i filmen. Er det laget fra før, er det gratis å se.'}
                                    >
                                      {st === 'starting' ? '▶ Starter…' : st === 'generating' ? '▶ Lager klippet… (1–3 min)' : '▶ Se animasjonen'}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => nyAnimasjon(index)}
                                      disabled={jobber}
                                      className="px-3 py-1.5 rounded-full border border-gray-300 text-[12px] font-medium text-gray-600 hover:border-gray-400 disabled:opacity-60"
                                      title={harKlipp
                                        ? 'Setter klippet fra biblioteket til side og lager en ny animasjon. Klippet blir liggende i biblioteket.'
                                        : 'Forkaster dagens klipp og lager et helt nytt'}
                                    >
                                      {/* Fremdriften maa staa paa knappen som
                                          ble trykket (Lars 3/8) — foer laa den
                                          paa NABOKNAPPEN, saa «Lag en ny» bare
                                          ble graa og stille. */}
                                      {jobber
                                        ? '↻ Lager animasjonen…'
                                        : `↻ Lag en ny (${fmtCredits(COSTS_NOK.animate5s * pf)})`}
                                    </button>
                                    {klippBank.length > 0 && (
                                      <button
                                        type="button"
                                        onClick={() => setKlippVelgerFor(klippVelgerFor === index ? null : index)}
                                        className="px-3 py-1.5 rounded-full border border-gray-300 text-[12px] font-medium text-gray-600 hover:border-gray-400"
                                        title="Alle klipp du har laget — gratis å bruke om igjen"
                                      >
                                        🎞️ Klippene dine ({klippBank.length})
                                      </button>
                                    )}
                                  </>
                                )
                              })()}
                              {/* «Hvordan vet jeg når den er ferdig?» (Lars 3/8):
                                  en linje som teller, og som sier hva som skjer
                                  til slutt. Uten den var eneste tegn at en knapp
                                  ble graa. */}
                              {['starting', 'generating'].includes(motionPreview[index]?.status || '') && (() => {
                                const s = Math.max(0, Math.round(((naa || Date.now()) - (motionPreview[index]?.startet || Date.now())) / 1000))
                                const tid = s < 60 ? `${s} sek` : `${Math.floor(s / 60)} min ${s % 60} sek`
                                return (
                                  <span className="w-full flex items-center gap-2 text-[12px] text-[var(--ember-deep)]">
                                    <span className="w-3.5 h-3.5 border-2 border-[var(--ember-deep)] border-t-transparent rounded-full animate-spin" />
                                    Lager animasjonen — {tid}. Den pleier å ta 1–3 minutter, og dukker opp
                                    som en avspiller her nede når den er ferdig. Du kan jobbe videre i andre scener imens.
                                  </span>
                                )
                              })()}
                              {seg.video_url && (
                                <span className="w-full text-[11.5px] text-gray-400">
                                  Scenen bruker et ferdig klipp, så innstillingene her venter.
                                  Trykk «↻ Lag en ny» hvis du heller vil animere bildet —
                                  klippet settes til side, men blir liggende i biblioteket ditt.
                                </span>
                              )}
                            </div>
                          )}
                          {seg.motion_style === 'custom' && (seg.motion || (seg.animate === true ? 'move' : 'none')) === 'move' && (
                            <div>
                              <input
                                type="text"
                                defaultValue={seg.motion_prompt || ''}
                                onBlur={(e) => setMotionPrompt(index, e.target.value)}
                                placeholder="F.eks. slow drift to the right, dust in the air, flickering neon behind him"
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-[13px] focus:outline-none focus:ring-2 focus:ring-[var(--ember-deep)]"
                              />
                              <label className="flex items-center gap-2 mt-2 text-[12px] text-gray-600 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={seg.allow_mouth === true}
                                  onChange={(e) => {
                                    updateSegment(index, { allow_mouth: e.currentTarget.checked, clip_nonce: String(Date.now()) })
                                    setMotionPreview((p) => { const n = { ...p }; delete n[index]; return n })
                                  }}
                                  className="w-4 h-4"
                                />
                                <span>Tillat smil og latter (åpen munn)</span>
                              </label>
                              <p className="text-[11.5px] text-gray-400 mt-1">
                                Skriv på engelsk — det er språket generatoren forstår best.
                                {seg.allow_mouth === true
                                  ? ' Ansiktsuttrykk er tillatt; prating og synging holdes fortsatt ute.'
                                  : ' Munnen holdes lukket — kryss av over hvis du vil ha smil eller latter.'}
                              </p>
                            </div>
                          )}
                          {/* Artistens klippbibliotek — ALT som er laget, uansett
                              hvilken produksjon det tilhoerte (Lars 2/8) */}
                          {klippVelgerFor === index && (
                            <div>
                              <p className="text-[11px] uppercase tracking-widest text-gray-400 mb-1.5">
                                Klippene dine — gratis å bruke om igjen
                              </p>
                              {/* Spillbare direkte (Lars 2/8: «ingen av dem
                                  spiller») — miniatyrene hadde ingen kontroller */}
                              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                {klippBank.map((k) => {
                                  const iBruk = seg.video_url === k.url
                                  return (
                                    <div key={k.name} className="relative group">
                                      <video
                                        src={`${k.url}#t=0.1`}
                                        controls
                                        muted
                                        playsInline
                                        preload="metadata"
                                        className={`w-full rounded-lg bg-black ${iBruk ? 'ring-2 ring-[var(--ember-deep)]' : ''}`}
                                      />
                                      <button
                                        type="button"
                                        onClick={() => brukKlippFraBiblioteket(index, k)}
                                        disabled={iBruk}
                                        className={`w-full mt-1 px-2 py-1 rounded-full text-[11.5px] font-medium ${
                                          iBruk
                                            ? 'bg-[var(--ember-tint-bg)] text-[var(--ember-deep)] cursor-default'
                                            : 'border border-gray-300 text-gray-600 hover:border-[var(--ember-deep)] hover:text-[var(--ember-deep)]'
                                        }`}
                                      >
                                        {iBruk ? '✓ i bruk i denne scenen' : 'Bruk i denne scenen'}
                                      </button>
                                      <div className="flex items-center justify-between gap-2 mt-1">
                                        <span className="text-[10.5px] text-gray-400 truncate">
                                          {k.laget ? new Date(k.laget).toLocaleString('nb-NO', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''}
                                        </span>
                                        <button
                                          type="button"
                                          onClick={() => slettKlipp(k.name)}
                                          title="Slett fra biblioteket"
                                          className="text-[11px] text-gray-400 hover:text-red-600 flex-shrink-0"
                                        >
                                          ✕
                                        </button>
                                      </div>
                                    </div>
                                  )
                                })}
                              </div>
                              <p className="text-[11px] text-gray-400 mt-1">
                                Alt du har laget, nyeste først. «Bruk i denne scenen» setter klippet rett inn — gratis,
                                ingen ny animasjon. Er klippet kortere enn scenen, fyller filmen ut resten.
                              </p>
                            </div>
                          )}

                          {motionPreview[index]?.status === 'ready' && motionPreview[index]?.url && (
                            <div>
                              <video key={motionPreview[index].url} src={motionPreview[index].url} controls playsInline className="rounded-lg border border-gray-200 max-h-64 bg-black" />
                              <p className="text-[11.5px] text-gray-400 mt-1">
                                Slik blir bevegelsen i filmen. Ikke fornøyd? Bytt stil, eller trykk «↻ Lag en ny».
                              </p>
                            </div>
                          )}
                          {motionPreview[index]?.status === 'failed' && (
                            <p className="text-[12px] text-red-700">{motionPreview[index].error}</p>
                          )}

                          {/* Tidligere klipp for denne scenen — bytt tilbake
                              gratis (filene ligger i cachen, Lars 1/8) */}
                          {(seg.clip_history || []).length > 1 && (
                            <div>
                              <p className="text-[11px] uppercase tracking-widest text-gray-400 mb-1.5">
                                Tidligere klipp ({(seg.clip_history || []).length})
                              </p>
                              <div className="flex gap-2 flex-wrap">
                                {(seg.clip_history || []).map((h) => {
                                  const aktiv = (seg.clip_nonce || 'original') === h.nonce
                                  const stil = MOTION_STYLES.find((m) => m.v === h.style)?.label || h.style
                                  return (
                                    <button
                                      key={h.nonce}
                                      type="button"
                                      onClick={() => brukTidligereKlipp(index, h)}
                                      className={`rounded-lg border-2 overflow-hidden text-left ${
                                        aktiv ? 'border-[var(--ember-deep)]' : 'border-transparent hover:border-gray-300'
                                      }`}
                                      title={`${stil}${h.prompt ? ` — ${h.prompt}` : ''}`}
                                    >
                                      <video src={`${h.url}#t=0.1`} muted playsInline preload="metadata" tabIndex={-1} className="w-20 h-32 object-cover bg-black pointer-events-none" />
                                      <span className={`block px-1 py-0.5 text-[10px] text-center ${aktiv ? 'text-[var(--ember-deep)] font-medium' : 'text-gray-400'}`}>
                                        {aktiv ? 'i bruk' : 'bruk denne'}
                                      </span>
                                    </button>
                                  )
                                })}
                              </div>
                              <p className="text-[11px] text-gray-400 mt-1">
                                Gratis å bytte mellom — klippene er allerede laget.
                              </p>
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Radkontroller */}
                    <div className="flex flex-col items-end gap-2">
                      {/* Godkjenning er porten til produksjon. Endrer du noe i
                          scenen, settes den automatisk tilbake til gjennomgang —
                          derfor trengs ingen «ta tilbake»-knapp (Lars 1/8:
                          «jeg skjoenner rett og slett ikke poenget»). */}
                      {seg.approved ? (
                        <span className="min-w-[104px] px-3.5 py-2 text-[13px] text-green-700 text-center">
                          ✓ Godkjent
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => toggleApproved(index)}
                          className="min-w-[104px] px-3.5 py-2 rounded-lg border text-[13px] font-medium transition-colors border-[var(--ember-deep)] bg-[var(--ember-deep)] text-white hover:bg-[var(--ink)]"
                        >
                          Godkjenn
                        </button>
                      )}
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => addSegment(index)}
                          className="w-[34px] h-[34px] rounded-lg border border-gray-300 text-gray-500 hover:border-gray-400 hover:text-gray-900 text-sm"
                          title="Legg til en scene rett under denne"
                        >
                          +
                        </button>
                        <button
                          type="button"
                          onClick={() => removeSegment(index)}
                          className="w-[34px] h-[34px] rounded-lg border border-gray-300 text-gray-400 hover:border-red-300 hover:text-red-600 text-sm"
                          title="Fjern denne scenen"
                        >
                          ✕
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
                </div>
              )
            })}
          </div>

          {/* Start produksjon også NEDERST: man er ved siste scene når alt er
              godkjent, og skal ikke måtte scrolle til toppen (Lars 31/7) */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-1">
            <p className={`text-[13px] font-medium ${allApproved ? 'text-green-700' : 'text-amber-700'}`}>
              {allApproved
                ? `Alle ${segments.length} scenene er godkjent — klar for produksjon`
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

          {/* Sidepanel: alt globalt samlet (design-handoffens hovedgrep).
              Kreditt-kortet er sticky INNE i panelet, så det følger deg
              nedover i scenelista (Lars 31/7: «savner taxameteret som er med
              overalt … nå har det en låst plass») — uten å dekke innholdet
              slik det gamle flytende taxameteret gjorde. */}
          <aside className="space-y-4">
            <div className="bg-white rounded-2xl border border-gray-200 px-5 py-4 lg:sticky lg:top-24 lg:z-10 shadow-sm">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-[13.5px] text-gray-500">Påløpt på utkastet</span>
                <span className="text-xl font-semibold text-gray-900 tabular-nums">{fmtCredits(paaloptNok)}</span>
              </div>
              {(() => {
                // Scener med ferdig klipp (opplastet eller fra biblioteket)
                // genererer ingenting og skal ikke telle med i anslaget
                const ms = draft.ai_motion
                  ? segments.filter((s) => !s.video_url).map((s) => s.motion || (s.animate === true ? 'move' : 'none'))
                  : []
                const nMove = ms.filter((m) => m === 'move').length
                const nTalk = ms.filter((m) => m === 'talk').length
                const nImg = segments.filter((s) => !s.image_url || !s.image_url.trim()).length
                const est = (nMove * COSTS_NOK.animate5s + nTalk * COSTS_NOK.lipsyncTypical + nImg * COSTS_NOK.imageStandard) * pf
                const nok = saldo
                const dekning = nok !== null && est > 0 ? nok >= est : null
                const linjer = [
                  { navn: `AI-bilder som mangler × ${nImg}`, verdi: nImg * COSTS_NOK.imageStandard * pf },
                  { navn: `Bevegelse × ${nMove}`, verdi: nMove * COSTS_NOK.animate5s * pf },
                  { navn: `Lip-sync × ${nTalk}`, verdi: nTalk * COSTS_NOK.lipsyncTypical * pf },
                ].filter((l) => l.verdi > 0)
                return (
                  <>
                    {/* Spesifisert igjen (Lars 2/8) — en sum uten forklaring
                        sier ikke hva man betaler for */}
                    {linjer.length > 0 && (
                      <div className="mt-2 pt-2 border-t border-gray-100 space-y-1">
                        {linjer.map((l) => (
                          <div key={l.navn} className="flex items-baseline justify-between gap-3">
                            <span className="text-[12px] text-gray-500">{l.navn}</span>
                            <span className="text-[12px] text-gray-600 tabular-nums">~{fmtCredits(l.verdi)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    {est > 0 && (
                      <div className="mt-2 pt-2 border-t border-gray-100 flex items-baseline justify-between gap-3">
                        <span className="text-[13px] text-gray-500">Neste produksjon</span>
                        <span className="text-[15px] font-medium text-gray-900 tabular-nums">~{fmtCredits(est)}</span>
                      </div>
                    )}
                    {nok !== null && (
                      <div className={`mt-2 pt-2 border-t border-gray-100 flex items-baseline justify-between gap-3 ${dekning === false ? 'text-red-600' : 'text-green-700'}`}>
                        <span className="text-[13px]">Du har igjen</span>
                        <span className="text-[15px] font-semibold tabular-nums">{fmtCredits(nok)}</span>
                      </div>
                    )}
                    {dekning === false && (
                      <p className="mt-1 text-[11.5px] text-red-600">
                        Ikke nok til denne produksjonen.{' '}
                        <Link href="/for-deg/kreditt" className="underline">Kjøp flere kreditter</Link>
                      </p>
                    )}
                  </>
                )
              })()}
              <p className="mt-2 text-[11.5px] text-gray-400">
                Det du lager selv — egne bilder, egen stemme — er gratis. Scener du ikke har endret gjenbrukes uten kostnad.
              </p>
            </div>
            {lagring && lagring.prosent >= 50 && (
              <div className={`rounded-2xl border px-5 py-4 ${lagring.prosent >= 90 ? 'border-red-300 bg-red-50' : 'border-gray-200 bg-white'}`}>
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-[13px] text-gray-500">Lagringsplass</span>
                  <span className="text-[13px] font-medium text-gray-900 tabular-nums">
                    {lagring.brukteMB} av {lagring.grenseMB} MB
                  </span>
                </div>
                <div className="mt-2 h-1.5 rounded-full bg-gray-200 overflow-hidden">
                  <div
                    className={`h-full ${lagring.prosent >= 90 ? 'bg-red-500' : 'bg-[var(--ember-deep)]'}`}
                    style={{ width: `${lagring.prosent}%` }}
                  />
                </div>
                {lagring.prosent >= 90 && (
                  <p className="mt-2 text-[11.5px] text-red-700">
                    Nesten fullt. Slett bilder, låter eller klipp du ikke trenger.
                  </p>
                )}
              </div>
            )}

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
                  {(() => {
                    const grupper = new Map<string, VoiceOption[]>()
                    for (const v of VOICES) {
                      const navn = (v as any).gruppe || 'Stemmer'
                      if (!grupper.has(navn)) grupper.set(navn, [])
                      grupper.get(navn)!.push(v)
                    }
                    if (grupper.size <= 1) {
                      return VOICES.map((v) => (
                        <option key={v.id} value={v.id}>{v.name}{v.desc ? ` — ${v.desc}` : ''}</option>
                      ))
                    }
                    const RANG = ['Norske stemmer', 'Britiske stemmer', 'Amerikanske stemmer', 'Andre engelske', 'Australske stemmer', 'Kanadiske stemmer', 'Andre nordiske', 'Andre stemmer']
                    const sortert = [...grupper.entries()].sort((a, b) => (RANG.indexOf(a[0]) + 1 || 99) - (RANG.indexOf(b[0]) + 1 || 99))
                    return sortert.map(([navn, liste]) => (
                      <optgroup key={navn} label={navn}>
                        {liste.map((v) => (
                          <option key={v.id} value={v.id}>{v.name}{v.desc ? ` — ${v.desc}` : ''}</option>
                        ))}
                      </optgroup>
                    ))
                  })()}
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
                {/* Medley-verksted */}
                <div className="mt-3 pt-3 border-t border-gray-100">
                  <p className="text-[12px] font-medium text-gray-700 mb-1.5">Lag medley av låtene dine</p>
                  {(() => {
                    const kandidater = ownTracks(musicLibrary, productId).filter((m) => !isMedleyFile(m.filename))
                    if (kandidater.length < 2) {
                      return <p className="text-[11.5px] text-gray-400">Du trenger minst to egne låter. Last opp på den gamle siden inntil videre.</p>
                    }
                    return (
                      <>
                        <div className="space-y-1 max-h-40 overflow-y-auto">
                          {kandidater.map((m) => {
                            const valgt = medleyPicks.indexOf(m.filename)
                            return (
                              <button
                                key={m.filename}
                                type="button"
                                onClick={() => setMedleyPicks((p) => valgt >= 0 ? p.filter((f) => f !== m.filename) : [...p, m.filename])}
                                className={`w-full text-left px-2.5 py-1.5 rounded-lg border text-[12.5px] flex items-center gap-2 ${
                                  valgt >= 0 ? 'border-[var(--ember-deep)] bg-[var(--ember-tint-bg)]' : 'border-gray-200 hover:border-gray-300'
                                }`}
                              >
                                <span className={`w-5 text-center ${valgt >= 0 ? 'text-[var(--ember-deep)] font-semibold' : 'text-gray-300'}`}>
                                  {valgt >= 0 ? valgt + 1 : '+'}
                                </span>
                                <span className="truncate">{m.name}</span>
                              </button>
                            )
                          })}
                        </div>
                        {medleyPicks.length > 0 && (
                          <>
                            <div className="flex items-center gap-2 mt-2">
                              <span className="text-[11.5px] text-gray-500">Lengde per låt:</span>
                              <select
                                value={medleyClip}
                                onChange={(e) => setMedleyClip(e.target.value as typeof medleyClip)}
                                className="px-2 py-1 border border-gray-300 rounded text-[12px] bg-white"
                              >
                                <option value="10">10 sek</option>
                                <option value="15">15 sek</option>
                                <option value="20">20 sek</option>
                                <option value="30">30 sek</option>
                                <option value="full">Hele låten</option>
                              </select>
                            </div>
                            {medleyClip !== 'full' && medleyPicks.length >= 2 && (() => {
                              const bit = Number(medleyClip)
                              const skjoter = medleyPicks.length - 1
                              const ferdig = medleyPicks.length * bit - skjoter * 2.5
                              return (
                                <p className="mt-1.5 text-[11.5px] text-[var(--ember-deep)]">
                                  {medleyPicks.length} × {bit} sek = {medleyPicks.length * bit} sek, men de {skjoter} overtoningene
                                  spiser 2,5 sek hver → <strong>ferdig ca. {Math.round(ferdig)} sek</strong>.
                                </p>
                              )
                            })()}
                            <button
                              type="button"
                              onClick={buildMedley}
                              disabled={medleyPicks.length < 2 || medleyBuilding}
                              className="mt-2 w-full px-3 py-2 rounded-lg bg-[var(--ember-deep)] text-white text-[13px] font-medium hover:bg-[var(--ink)] disabled:opacity-40"
                            >
                              {medleyBuilding ? 'Mikser låtene…' : `Lag medley (${medleyPicks.length} låter)`}
                            </button>
                          </>
                        )}
                        {medleyResult && (
                          <p className="mt-2 text-[11.5px] text-green-700">✓ {medleyResult.name} er laget og valgt som bakgrunnsmusikk.</p>
                        )}
                      </>
                    )
                  })()}
                </div>
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

            {/* Sluttplakat med forhåndsvisning */}
            <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
              <div className="px-5 py-3.5 border-b border-gray-100">
                <h3 className="text-sm font-semibold text-gray-900">Sluttplakaten</h3>
                <p className="text-[12px] text-gray-400 mt-0.5">Siste bildet i videoen</p>
              </div>
              <div className="px-5 py-4 space-y-3">
                {(() => {
                  const effMsg = outroMessage !== null ? outroMessage : (draft.cta || '')
                  const effUrl = (outroUrl || outroDefaults.url).replace(/^https?:\/\//, '').replace(/\/$/, '')
                  const effImg = outroImage === 'none' ? '' : (outroImage || outroDefaults.logoUrl)
                  const urlInMsg = !!effUrl && effMsg.toLowerCase().includes(effUrl.toLowerCase())
                  return (
                    <>
                      <div
                        className="w-24 aspect-[9/16] mx-auto rounded-lg border border-gray-200 overflow-hidden flex flex-col items-center justify-center px-1.5 text-center"
                        style={{ backgroundColor: outroBg, color: outroText }}
                      >
                        {effImg ? <img src={effImg} alt="" className="max-h-[45%] max-w-[85%] object-contain mb-1" /> : null}
                        {effMsg ? <p className="text-[7px] leading-snug mb-0.5">{effMsg}</p> : null}
                        {effUrl && !urlInMsg ? <p className="text-[8px] font-bold break-all">{effUrl}</p> : null}
                      </div>
                      <div>
                        <label className="block text-[11px] uppercase tracking-widest text-gray-400 mb-1">Budskap</label>
                        <textarea
                          value={effMsg}
                          onChange={(e) => setOutroMessage(e.target.value)}
                          onBlur={() => persistOutro({ message: outroMessage })}
                          rows={2}
                          placeholder="F.eks. Forhåndslagre på Spotify"
                          className="w-full px-2.5 py-1.5 border border-gray-300 rounded-lg text-[12.5px] focus:outline-none focus:ring-2 focus:ring-[var(--ember-deep)]"
                        />
                        {urlInMsg && <p className="text-[11px] text-gray-400 mt-0.5">Lenken står i budskapet — vises ikke to ganger.</p>}
                      </div>
                      <div>
                        <label className="block text-[11px] uppercase tracking-widest text-gray-400 mb-1">Lenke</label>
                        <input
                          type="text"
                          value={outroUrl}
                          onChange={(e) => setOutroUrl(e.target.value)}
                          onBlur={() => persistOutro({ url: outroUrl })}
                          placeholder={outroDefaults.url || 'dittband.no'}
                          className="w-full px-2.5 py-1.5 border border-gray-300 rounded-lg text-[12.5px] focus:outline-none focus:ring-2 focus:ring-[var(--ember-deep)]"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] uppercase tracking-widest text-gray-400 mb-1">Bilde</label>
                        <div className="flex flex-wrap gap-1.5">
                          {([
                            { v: '', label: 'Artistbilde' },
                            { v: 'pick', label: 'Fra biblioteket' },
                            { v: 'none', label: 'Uten bilde' },
                          ]).map((o) => {
                            const aktiv = o.v === 'pick' ? (!!outroImage && outroImage !== 'none') : outroImage === o.v
                            return (
                              <button
                                key={o.v}
                                type="button"
                                onClick={() => {
                                  if (o.v === 'pick') { setOutroPickerOpen((v) => !v); return }
                                  setOutroImage(o.v); setOutroPickerOpen(false); persistOutro({ image: o.v })
                                }}
                                className={`px-2.5 py-1 rounded-full border text-[11.5px] font-medium ${
                                  aktiv ? 'bg-[var(--ember-deep)] text-white border-[var(--ember-deep)]' : 'bg-white text-gray-600 border-gray-300 hover:border-gray-400'
                                }`}
                              >
                                {o.label}
                              </button>
                            )
                          })}
                        </div>
                        {outroPickerOpen && (
                          <div className="mt-2 grid grid-cols-4 gap-1.5">
                            {imageLibrary.length === 0 && <p className="col-span-full text-[11.5px] text-gray-400">Ingen bilder ennå.</p>}
                            {imageLibrary.map((img) => (
                              <button
                                key={img.url}
                                type="button"
                                onClick={() => { setOutroImage(img.url); setOutroPickerOpen(false); persistOutro({ image: img.url }) }}
                                className={`aspect-square rounded-lg overflow-hidden border-2 ${outroImage === img.url ? 'border-[var(--ember-deep)]' : 'border-transparent hover:border-gray-300'}`}
                              >
                                <img src={img.url} alt={img.name} className="w-full h-full object-cover" />
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                      {/* Merkekort mot rabatt (Lars 1/8) — kommer ETTER
                          artistens plakat, aldri i stedet for */}
                      {tenant.vertical === 'music' && (
                        <label className="flex items-start gap-2 pt-2 border-t border-gray-100 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={draft.brand_card === true}
                            onChange={(e) => updateDraftFields({ brand_card: e.currentTarget.checked } as any)}
                            className="w-4 h-4 mt-0.5"
                          />
                          <span className="min-w-0">
                            <span className="block text-[12.5px] text-gray-900">
                              Avslutt med «{tenant.app_name || 'IndigoBoom'} VideoMaker» — få rabatt
                            </span>
                            <span className="block text-[11.5px] text-gray-400 leading-relaxed mt-0.5">
                              Et lite kort på 2 sekunder helt til slutt, etter din egen sluttplakat.
                              Du betaler mindre for produksjonen. Fjerner du kortet senere, går prisen tilbake til full.
                            </span>
                          </span>
                        </label>
                      )}

                      <div className="flex items-center gap-3 flex-wrap">
                        <label className="flex items-center gap-1.5 text-[11.5px] text-gray-500">
                          Bakgrunn
                          <input type="color" value={outroBg} onChange={(e) => updateOutroColors(e.target.value, outroText)} className="h-7 w-10 rounded border border-gray-300 cursor-pointer" />
                        </label>
                        <label className="flex items-center gap-1.5 text-[11.5px] text-gray-500">
                          Tekst
                          <input type="color" value={outroText} onChange={(e) => updateOutroColors(outroBg, e.target.value)} className="h-7 w-10 rounded border border-gray-300 cursor-pointer" />
                        </label>
                      </div>
                    </>
                  )
                })()}
              </div>
            </div>
          </aside>
        </div>
      </div>

      {/* Mobil: sidepanelet ligger under scenene, så taxameteret får en liten
          flytende visning der i stedet (Lars 31/7) */}
      <div className="lg:hidden fixed bottom-4 right-4 z-40 bg-white/95 backdrop-blur border border-gray-200 shadow-lg rounded-xl px-3 py-2 text-[12.5px]">
        <span className="text-gray-500">Påløpt </span>
        <span className="font-semibold text-gray-900 tabular-nums">{fmtCredits(paaloptNok)}</span>
        {saldo !== null && (
          <>
            <span className="text-gray-300"> · </span>
            <span className="text-gray-500">igjen </span>
            <span className="font-semibold text-gray-900 tabular-nums">{fmtCredits(saldo)}</span>
          </>
        )}
      </div>
    </div>
  )
}
