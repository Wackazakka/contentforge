'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter, useParams, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { getSupabase } from '@/lib/supabaseClient'
import { useTranslations } from 'next-intl'
import { COSTS_NOK, fmtNok, fmtCredits } from '@/lib/costs'
import { VOICES } from '@/lib/voices'
import CostMeter from '@/components/CostMeter'
import { useTenant } from '@/lib/tenantContext'
import { ownTracks, sharedMusic, tracksFolder, isMedleyFile, TRACK_MAX_BYTES } from '@/lib/musicLibrary'
import { uploadTrack } from '@/lib/uploadTrack'

// Tilgjengelige stemmer (speiler draft/new-siden). Preview spilles direkte fra ElevenLabs.

interface MusicFile { filename: string; name: string; folder?: string; url: string; size: number }

interface Segment {
  index: number
  text: string
  voiceover: string
  image_url: string
  approved: boolean
  voiceover_url?: string
  // «Les inn selv»: voiceover_url peker på artistens egen innspilling
  // (dropleten bruker den i stedet for TTS — transkoderer ved behov)
  own_voice?: boolean
  // Musikkdrevet tempo: hviletid (sek) etter stemmen — bildet står, musikken løftes
  hold_seconds?: number
  // «Film = musikkens lengde»: serverberegnet hviletid (musikk / antall segmenter)
  match_music?: boolean
  image_prompt?: string
  animate?: boolean
  motion?: 'none' | 'move' | 'talk'
  // «Uten tale» (31/7): scenen bæres av bilde + musikk — ingen voiceover
  no_voice?: boolean
  // «Lag animasjonen på nytt»: nytt fingeravtrykk → dropletens cache omgås
  clip_nonce?: string
}

interface Draft {
  id: string
  product_id: string
  campaign_id: string
  status: string
  segments: Segment[]
  voice_id?: string
  tone?: string
  cta?: string
  video_format?: string
  music_style?: string
  music_file?: string | null
  outro_jingle?: string | null
  cost_accumulated?: number | null
  // Sluttplakat-kontroll (31/7): artistens valg vinner over automatikken
  outro_config?: { message?: string | null; url?: string; imageUrl?: string | null } | null
  // AI-bevegelse huskes på utkastet (var kun øktstate før 31/7)
  ai_motion?: boolean
  ai_motion_engine?: string
}

// Split a text roughly in half — at the sentence boundary nearest the midpoint,
// falling back to a word-count split when there's only one sentence.
function splitTextInTwo(input: string): [string, string] {
  const t = (input || '').trim()
  if (!t) return ['', '']
  const sentences = t.match(/[^.!?]+[.!?]+(\s|$)|[^.!?]+$/g)?.map((s) => s.trim()).filter(Boolean) || [t]
  if (sentences.length <= 1) {
    const words = t.split(/\s+/)
    const mid = Math.max(1, Math.ceil(words.length / 2))
    return [words.slice(0, mid).join(' '), words.slice(mid).join(' ')]
  }
  const half = t.length / 2
  let acc = 0
  let splitAt = 1
  for (let i = 0; i < sentences.length; i++) {
    acc += sentences[i].length
    if (acc >= half) { splitAt = i + 1; break }
  }
  splitAt = Math.max(1, Math.min(sentences.length - 1, splitAt))
  return [sentences.slice(0, splitAt).join(' '), sentences.slice(splitAt).join(' ')]
}

export default function DraftPage() {
  const router = useRouter()
  const params = useParams()
  const searchParams = useSearchParams()
  const t = useTranslations('draftApproval')
  const productId = params?.id as string
  const draftId = params?.draftId as string

  const [draft, setDraft] = useState<Draft | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [regeneratingIndex, setRegeneratingIndex] = useState<number | null>(null)
  const [openPrompts, setOpenPrompts] = useState<Set<number>>(new Set())
  const [generatingImages, setGeneratingImages] = useState<Set<number>>(new Set())
  const [imageErrors, setImageErrors] = useState<Record<number, string>>({})
  const [assets, setAssets] = useState<any[]>([])
  const [showImageBank, setShowImageBank] = useState<number | null>(null)
  const [voicePreviews, setVoicePreviews] = useState<Record<number, string>>({})
  const [voiceLoading, setVoiceLoading] = useState<Record<number, boolean>>({})
  const [musicLibrary, setMusicLibrary] = useState<MusicFile[]>([])
  // Jingle er ikke lagret på draft-raden (ingen kolonne) — hold i state, init fra ?jingle=
  const [outroJingle, setOutroJingle] = useState<string | null>(searchParams?.get('jingle') || null)
  const [jingleUploading, setJingleUploading] = useState(false)
  // Karakter-modus: konsistent vert (flux-lora) i alle segmentbilder — init fra ?character=
  const [character, setCharacter] = useState<string>(searchParams?.get('character') || '')
  const [userChars, setUserChars] = useState<Array<{ id: string; name: string; status: string }>>([])
  const [faceActors, setFaceActors] = useState<Array<{ id: string; name: string; faceCharacterId: string; pricePerUseNok: number }>>([])
  const [actorVoices, setActorVoices] = useState<Array<{ voiceId: string; name: string; pricePerUseNok: number }>>([])
  const [musicUploading, setMusicUploading] = useState(false)
  // Medley (fase 3b): velg 2–5 egne låter i rekkefølge → dropleten mikser
  // dem til én fil med crossfade + loudnorm, lagret i tracks-<productId>.
  const [medleySelection, setMedleySelection] = useState<string[]>([])
  // Utsnitt per laat (Lars 30/7: «vet ikke hvilken del av laata som spilles»):
  // artisten hoerer laata og markerer hvor hooken starter; felles kliplengde.
  const [medleyStarts, setMedleyStarts] = useState<Record<string, number>>({})
  const [medleyClip, setMedleyClip] = useState<'full' | '10' | '15' | '20' | '30'>('15')
  const medleyAudioRefs = useRef<Record<string, HTMLAudioElement | null>>({})
  // Dra-og-slipp-omorganisering av valgte laater (Lars 30/7)
  const dragTrackRef = useRef<string | null>(null)
  const reorderMedley = (src: string, dst: string) => {
    setMedleySelection((prev) => {
      const from = prev.indexOf(src)
      const to = prev.indexOf(dst)
      if (from < 0 || to < 0 || from === to) return prev
      const next = [...prev]
      next.splice(from, 1)
      next.splice(to, 0, src)
      return next
    })
  }
  const [medleyBuilding, setMedleyBuilding] = useState(false)
  // Resultatet skal HOERES foer man stoler paa det (Lars 30/7: «vet ikke om
  // det blir laget noe») — spiller + varighet etter bygging.
  const [medleyResult, setMedleyResult] = useState<{ filename: string; name: string } | null>(null)
  const [medleyDuration, setMedleyDuration] = useState<number | null>(null)
  const toggleMedleyTrack = (filename: string) => {
    setMedleySelection((prev) =>
      prev.includes(filename) ? prev.filter((f) => f !== filename) : prev.length >= 5 ? prev : [...prev, filename]
    )
  }
  const buildMedley = async () => {
    if (medleySelection.length < 2) return
    setMedleyBuilding(true)
    setMedleyResult(null)
    try {
      const res = await fetch('/api/music/medley', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          files: medleySelection.map((f) => ({
            filename: f,
            startSec: medleyStarts[f] || 0,
            clipSec: medleyClip === 'full' ? undefined : Number(medleyClip),
          })),
          folder: `tracks-${productId}`,
          // Tidsstempel i navnet: hver bygging blir en NY fil, saa den forrige
          // beholdes i laatbanken til sammenligning (Lars 30/7).
          name: (() => { const d = new Date(); const t = [d.getHours(), d.getMinutes(), d.getSeconds()].map((x) => String(x).padStart(2, '0')).join('.'); return `medley-${d.toISOString().slice(0, 10)}-kl-${t}` })(),
        }),
      })
      const data = await res.json()
      if (res.ok && data?.file?.filename) {
        const lib = await fetch('/api/music').then((r) => r.json())
        if (lib.files) setMusicLibrary(lib.files)
        updateMusic(data.file.filename) // auto-velg medleyen
        setMedleyResult({ filename: data.file.filename, name: data.file.name || 'Medley' })
        setMedleyDuration(null)
        setMedleySelection([])
      } else {
        alert(data?.error || 'Miksingen feilet.')
      }
    } catch {
      alert('Miksingen feilet.')
    } finally {
      setMedleyBuilding(false)
    }
  }
  const [musicFolder, setMusicFolder] = useState('global')
  // Sluttplakat-farger — leses fra produktprofilen, kan endres direkte her
  const [outroBg, setOutroBg] = useState('#1a1a2e')
  const [outroText, setOutroText] = useState('#ffffff')
  const [colorSaving, setColorSaving] = useState(false)
  const [starting, setStarting] = useState(false)
  const [aiMotion, setAiMotion] = useState(false)
  // Kling er standard (31/7): PixVerse fikk folk til å «snakke» uansett
  // prompt, og bakgrunnen drev i kjedede ledd. Kling holdt munnen lukket.
  const [aiMotionEngine, setAiMotionEngine] = useState('kling')
  // «Se animasjonen» per scene: generering + avspilling i redigereren
  const [motionPreviewState, setMotionPreviewState] = useState<
    Record<number, { status: 'starting' | 'generating' | 'ready' | 'failed'; url?: string; fp?: string; error?: string }>
  >({})
  // Musikklengden (fra fila selv) driver scene-anbefalingen: ~5 s per bilde
  // er filmspråk — og gir nøyaktig ett generert klipp per scene (Lars 31/7)
  const [musicDur, setMusicDur] = useState<number | null>(null)
  useEffect(() => {
    const f = draft?.music_file
    if (!f) { setMusicDur(null); return }
    const a = new Audio(`/api/music/${encodeURIComponent(f)}`)
    a.preload = 'metadata'
    a.onloadedmetadata = () => setMusicDur(Number.isFinite(a.duration) ? a.duration : null)
    a.onerror = () => setMusicDur(null)
    return () => { a.onloadedmetadata = null; a.onerror = null }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft?.music_file])
  const imageStyle = searchParams?.get('imageStyle') || 'editorial'
  const formatFromUrl = searchParams?.get('format') || ''

  // Map video format → gpt-image-1 size and display aspect ratio
  const videoFormat = (draft?.video_format || formatFromUrl || '9:16') as '9:16' | '1:1' | '16:9'
  const IMAGE_SIZE_MAP: Record<string, '1024x1536' | '1024x1024' | '1536x1024'> = {
    '9:16': '1024x1536',
    '1:1':  '1024x1024',
    '16:9': '1536x1024',
  }
  const IMAGE_ASPECT_MAP: Record<string, string> = {
    '9:16': 'aspect-[9/16]',
    '1:1':  'aspect-square',
    '16:9': 'aspect-video',
  }
  const imageSize = IMAGE_SIZE_MAP[videoFormat] || '1024x1536'
  const imageAspect = IMAGE_ASPECT_MAP[videoFormat] || 'aspect-[9/16]'



  useEffect(() => {
    if (!draftId) return

    const fetchDraft = async () => {
      try {
        setLoading(true)
        console.log('[DraftPage] Fetching draft with ID:', draftId)
        const supabase = getSupabase()

        console.log('[DraftPage] Calling Supabase query...')
        const { data, error: fetchError } = await supabase
          .from('production_drafts')
          .select('*')
          .eq('id', draftId)
          .single()

        console.log('[DraftPage] Supabase response:', { data, error: fetchError })

        if (fetchError) {
          console.error('[DraftPage] Supabase error details:', {
            message: fetchError.message,
            code: fetchError.code,
            hint: fetchError.hint,
            details: fetchError.details,
          })
          throw new Error(`Supabase error: ${fetchError.message}${fetchError.hint ? ' (' + fetchError.hint + ')' : ''}`)
        }

        if (!data) {
          console.warn('[DraftPage] No draft data returned')
          throw new Error('Draft not found')
        }

        console.log('[DraftPage] ✅ Draft fetched successfully:', {
          draftId: data.id,
          segmentCount: data.segments?.length || 0,
        })
        setDraft(data)
        // AI-bevegelse og motor huskes fra utkastet (Lars 31/7: «AI-bevegelse
        // var ikke huket av. Det bør den være når den var valgt fra før»).
        // Var kun øktstate før — den forsvant ved hver reload, og da forsvant
        // også bevegelsesvalgene per scene fra skjermen.
        if (data.ai_motion === true) setAiMotion(true)
        if (data.ai_motion_engine) setAiMotionEngine(data.ai_motion_engine)
        setLoading(false) // Show page immediately — don't wait for images

        // Jingle: kom vi fra draft/new med ?jingle=, persister det på draften så det
        // overlever reload/«Rediger». Ellers: last inn draftens lagrede jingle.
        const urlJingle = searchParams?.get('jingle') || null
        if (urlJingle) {
          supabase
            .from('production_drafts')
            .update({ outro_jingle: urlJingle })
            .eq('id', draftId)
            .then(({ error }: { error: any }) => { if (error) console.warn('[jingle persist] mangler outro_jingle-kolonnen?', error.message) })
        } else if (data.outro_jingle) {
          setOutroJingle(data.outro_jingle)
        }

        // Auto-generate images in background (fire and forget).
        // IKKE for music-vertikalen (Lars 2026-07-30): AI-genererte «generiske
        // band» er feil band — artister skal velge egne pressebilder/artwork
        // fra bildebiblioteket i stedet. AI-generering finnes fortsatt som
        // eksplisitt valg per segment.
        if (data.segments && productId && tenantInfo.vertical !== 'music') {
          console.log('[DraftPage] Starting auto image generation (background)...')
          generateImagesForAllSegments(data) // intentionally not awaited
        }
      } catch (err) {
        console.error('[DraftPage] Fetch error:', err)
        const errorMsg = err instanceof Error ? err.message : String(err)
        setError(errorMsg)
        console.error('[DraftPage] Full error object:', err)
        setLoading(false)
      }
    }

    fetchDraft()
  }, [draftId, productId])

  // Fetch available images from asset_banks
  useEffect(() => {
    if (!productId) return

    const fetchAssets = async () => {
      try {
        const supabase = getSupabase()
        const { data } = await supabase
          .from('asset_banks')
          .select('id, asset_url, name')
          .eq('product_id', productId)
          .eq('asset_type', 'image')

        setAssets(data || [])

        // Hent sluttplakat-fargene + standardene (lenke/logo) fra profilen
        const { data: profile } = await supabase
          .from('product_profiles')
          .select('primary_color, secondary_color, website_url, logo_url')
          .eq('product_id', productId)
          .single()
        if (profile?.primary_color) setOutroBg(profile.primary_color)
        if (profile?.secondary_color) setOutroText(profile.secondary_color)
        setOutroDefaults({ url: profile?.website_url || '', logoUrl: profile?.logo_url || '' })
      } catch (err) {
        console.error('[DraftPage] Asset fetch error:', err)
      }
    }

    fetchAssets()
  }, [productId])

  // Sluttplakat-kontroll (Lars 31/7): budskap, lenke og bilde velges her og
  // lagres på utkastet (outro_config) — production.ts lar dem vinne over
  // automatikken. Tom streng = «bruk standard»; bilde 'none' = uten bilde.
  const [outroDefaults, setOutroDefaults] = useState<{ url: string; logoUrl: string }>({ url: '', logoUrl: '' })
  const [outroMessage, setOutroMessage] = useState<string | null>(null) // null = ikke overstyrt (bruk CTA)
  const [outroUrl, setOutroUrl] = useState('')
  const [outroImage, setOutroImage] = useState<string>('') // '' = standard (logo), 'none' = ingen, ellers URL
  const [outroPickerOpen, setOutroPickerOpen] = useState(false)
  const [outroSaving, setOutroSaving] = useState(false)
  useEffect(() => {
    const oc = (draft as any)?.outro_config
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
    setOutroSaving(true)
    try {
      const oc: Record<string, unknown> = {}
      if (msg !== null) oc.message = msg
      if (url.trim()) oc.url = url.trim()
      if (img === 'none') oc.imageUrl = null
      else if (img) oc.imageUrl = img
      const { error } = await getSupabase()
        .from('production_drafts')
        .update({ outro_config: oc })
        .eq('id', draftId)
      if (error) console.warn('[persistOutro] lagring feilet (mangler migrasjonen kolonnen?):', error.message)
    } catch (err) {
      console.warn('[persistOutro] feilet:', err)
    } finally {
      setOutroSaving(false)
    }
  }

  // Lagre sluttplakat-farger på produktprofilen (brukes av outro på video + avatar)
  const updateOutroColors = async (bg: string, text: string) => {
    setOutroBg(bg)
    setOutroText(text)
    setColorSaving(true)
    try {
      const supabase = getSupabase()
      const { error } = await supabase
        .from('product_profiles')
        .update({ primary_color: bg, secondary_color: text })
        .eq('product_id', productId)
      if (error) console.error('[updateOutroColors] save failed:', error)
    } catch (err) {
      console.error('[updateOutroColors] error:', err)
    } finally {
      setColorSaving(false)
    }
  }

  // Hent musikk-/jingle-biblioteket for velgerne
  useEffect(() => {
    fetch('/api/music')
      .then((r) => r.json())
      .then((d) => setMusicLibrary(d.files || []))
      .catch((err) => console.error('[DraftPage] Music fetch error:', err))
    ;(async () => {
      try {
        const { data: sess } = await getSupabase().auth.getSession()
        const token = sess?.session?.access_token
        const d = await fetch('/api/characters', token ? { headers: { Authorization: `Bearer ${token}` } } : undefined).then((r) => r.json())
        setUserChars((d.characters || []).filter((c: any) => c.status === 'ready'))
      } catch { /* karakterer utilgjengelige */ }
    })()
    ;(async () => {
      try {
        const { data: sess } = await getSupabase().auth.getSession()
        const token = sess?.session?.access_token
        const d = await fetch('/api/face-actors', token ? { headers: { Authorization: `Bearer ${token}` } } : undefined).then((r) => r.json())
        setFaceActors((d.faces || []).filter((f: any) => f.faceCharacterId))
      } catch { /* ansiktsbank utilgjengelig */ }
    })()
    ;(async () => {
      try {
        const { data: sess } = await getSupabase().auth.getSession()
        const token = sess?.session?.access_token
        const d = await fetch('/api/voice-actors?kind=video', token ? { headers: { Authorization: `Bearer ${token}` } } : undefined).then((r) => r.json())
        setActorVoices(d.voices || [])
      } catch { /* ingen skuespillere å vise */ }
    })()
  }, [])
  const [saldo, setSaldo] = useState<number | null>(null)
  useEffect(() => {
    ;(async () => {
      try {
        const { data: sess } = await getSupabase().auth.getSession()
        const token = sess?.session?.access_token
        if (!token) return
        const d = await fetch('/api/org-balance', { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.json())
        if (typeof d.balance === 'number') setSaldo(d.balance)
      } catch { /* ingen saldo å vise */ }
    })()
  }, [])

  // Taxameter: legg påløpt kostnad (NOK, inkl. påslag) på draften — defensivt hvis kolonnen mangler
  // Kun optimistisk visning — serveren akkumulerer autoritativt via add_draft_cost-RPC
  const addCost = (nok: number) => {
    setDraft((prev) => {
      if (!prev) return prev
      return { ...prev, cost_accumulated: (Number(prev.cost_accumulated) || 0) + nok }
    })
  }

  // Bytt stemme — oppdater state + lagre på draft-raden (brukes av voiceover + produksjon)
  const updateVoice = async (voiceId: string) => {
    if (!draft) return
    // ⚠️ Bytte av stemme MÅ kaste de gamle AI-lydfilene (Lars 31/7: «plutselig
    // kommer stemmen til Adam, selv om jeg har valgt en annen»). Produksjonen
    // foretrekker segmentets voiceover_url foran ny generering, så uten dette
    // beholder filmen den gamle stemmen. Egne innspillinger (own_voice) er
    // artistens egen røst og røres ALDRI.
    const segments = draft.segments.map((s) =>
      s.own_voice ? s : { ...s, voiceover_url: undefined }
    )
    const kastet = draft.segments.filter((s) => !s.own_voice && s.voiceover_url).length
    setDraft({ ...draft, voice_id: voiceId, segments })
    setVoicePreviews({})
    try {
      const supabase = getSupabase()
      const { error } = await supabase
        .from('production_drafts')
        .update({ voice_id: voiceId, segments })
        .eq('id', draftId)
      if (error) console.error('[updateVoice] save failed:', error)
      else if (kastet > 0) console.log(`[updateVoice] ${kastet} gamle AI-opptak forkastet — genereres på nytt med ny stemme`)
    } catch (err) {
      console.error('[updateVoice] error:', err)
    }
  }

  // Bytt bakgrunnsmusikk — oppdater state + lagre på draft-raden
  const updateMusic = async (musicFile: string | null) => {
    if (!draft) return
    setDraft({ ...draft, music_file: musicFile })
    try {
      const supabase = getSupabase()
      const { error } = await supabase.from('production_drafts').update({ music_file: musicFile }).eq('id', draftId)
      if (error) console.error('[updateMusic] save failed:', error)
    } catch (err) {
      console.error('[updateMusic] error:', err)
    }
  }

  // Bytt jingle — oppdater state + lagre på draft-raden (outro_jingle-kolonnen).
  // Defensivt: hvis kolonnen ikke finnes ennå, logges det bare — jingelen virker
  // fortsatt per render (sendes fra state til start-production), men persisteres ikke.
  const updateJingle = async (jingle: string | null) => {
    setOutroJingle(jingle)
    try {
      const supabase = getSupabase()
      const { error } = await supabase.from('production_drafts').update({ outro_jingle: jingle }).eq('id', draftId)
      if (error) console.warn('[updateJingle] lagring feilet (mangler outro_jingle-kolonnen?):', error.message)
    } catch (err) {
      console.warn('[updateJingle] error:', err)
    }
  }

  // Velg bevegelsesnivå per segment: stillbilde / i2v-bevegelse / lip-sync — lagres på draften
  // «Lag animasjonen på nytt» (Lars 31/7: en fremmed person dukket opp i et
  // Kling-klipp). Nonce gir scenen nytt fingeravtrykk → dropletens klipp-cache
  // omgås og generatoren prøver på nytt ved neste produksjon. De ANDRE scenene
  // gjenbrukes fortsatt gratis, så en slik omgjøring koster kun denne scenen.
  const regenerateMotion = async (index: number) => {
    if (!draft) return
    const segs = [...draft.segments]
    segs[index] = { ...segs[index], clip_nonce: String(Date.now()) }
    setDraft({ ...draft, segments: segs })
    try {
      const supabase = getSupabase()
      const { error } = await supabase.from('production_drafts').update({ segments: segs }).eq('id', draftId)
      if (error) console.warn('[regenerateMotion] lagring feilet:', error.message)
    } catch (err) {
      console.warn('[regenerateMotion] error:', err)
    }
  }

  // «Se animasjonen» (Lars 31/7): generer scenens bevegelsesklipp og spill det
  // av her — i stedet for å oppdage en rar animasjon i den ferdige filmen.
  // Klippet havner i dropletens cache, så produksjonen gjenbruker det gratis.
  const previewMotion = async (index: number) => {
    setMotionPreviewState((p) => ({ ...p, [index]: { status: 'starting' } }))
    try {
      const res = await fetch('/api/content/preview-motion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ draftId, segmentIndex: index }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Kunne ikke starte forhåndsvisningen')
      if (Number(data.chargedNok) > 0) addCost(Number(data.chargedNok))
      if (data.status === 'ready' && data.url) {
        setMotionPreviewState((p) => ({ ...p, [index]: { status: 'ready', url: data.url } }))
        return
      }
      setMotionPreviewState((p) => ({ ...p, [index]: { status: 'generating', fp: data.fp } }))
      // Poll til klippet er klart (Kling bruker typisk 1–3 min)
      const deadline = Date.now() + 10 * 60 * 1000
      while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 5000))
        const st = await fetch(`/api/content/preview-motion?fp=${encodeURIComponent(data.fp)}`).then((r) => r.json()).catch(() => null)
        if (st?.status === 'ready' && st.url) {
          setMotionPreviewState((p) => ({ ...p, [index]: { status: 'ready', url: st.url } }))
          return
        }
        if (st?.status === 'failed') throw new Error(st.error || 'Genereringen feilet')
      }
      throw new Error('Tidsavbrudd — prøv igjen')
    } catch (err) {
      setMotionPreviewState((p) => ({
        ...p,
        [index]: { status: 'failed', error: err instanceof Error ? err.message : 'Noe gikk galt' },
      }))
    }
  }

  const updateMotion = async (index: number, value: 'none' | 'move' | 'talk') => {
    if (!draft) return
    const segs = [...draft.segments]
    segs[index] = { ...segs[index], motion: value, animate: value === 'move' }
    setDraft({ ...draft, segments: segs })
    try {
      const supabase = getSupabase()
      const { error } = await supabase.from('production_drafts').update({ segments: segs }).eq('id', draftId)
      if (error) console.warn('[updateMotion] lagring feilet:', error.message)
    } catch (err) {
      console.warn('[updateMotion] error:', err)
    }
  }

  const generateImagesForAllSegments = async (draftData: Draft) => {
    console.log('[DraftPage] ========== START AUTO IMAGE GENERATION ==========')
    console.log(`[DraftPage] Generating images for ${draftData.segments.length} segments...`)

    // Mark all segments that need images as "generating" upfront so user sees progress
    const pendingIndices = draftData.segments
      .map((s, i) => (!s.image_url || !s.image_url.trim() ? i : -1))
      .filter(i => i !== -1)

    if (pendingIndices.length === 0) {
      console.log('[DraftPage] All segments already have images')
      return
    }

    setGeneratingImages(new Set(pendingIndices))

    // Generate sequentially to stay within CDN timeout (one ~12s call at a time)
    for (const index of pendingIndices) {
      const segment = draftData.segments[index]
      try {
        console.log(`[DraftPage] Segment ${index}: generating...`)
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 50_000) // 50s client timeout
        let response: Response
        try {
          response = await fetch('/api/content/generate-image', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ topic: segment.text, productId, imageSize, imageStyle, character: character || undefined, draftId }),
            signal: controller.signal,
          })
        } finally {
          clearTimeout(timeoutId)
        }
        const data = await response.json()
        if (!response.ok) {
          const errMsg = data?.error || `HTTP ${response.status}`
          console.error(`[DraftPage] Segment ${index}: failed — ${errMsg}`)
          setImageErrors(prev => ({ ...prev, [index]: errMsg }))
        } else {
          const imageUrl = data.imageUrl || ''
          console.log(`[DraftPage] Segment ${index}: done — ${imageUrl}`)
          setImageErrors(prev => { const n = { ...prev }; delete n[index]; return n })
          // Update UI immediately so user sees image as soon as it's ready
          setDraft(prev => {
            if (!prev) return prev
            const segs = [...prev.segments]
            segs[index] = { ...segs[index], image_url: imageUrl }
            return { ...prev, segments: segs }
          })
          addCost(character ? COSTS_NOK.imageCharacter : COSTS_NOK.imageStandard)
        }
      } catch (err: any) {
        const errMsg = err?.name === 'AbortError'
          ? 'Timeout (>50s) — sjekk OpenAI-kreditter'
          : err?.message || String(err)
        console.error(`[DraftPage] Segment ${index}: error — ${errMsg}`)
        setImageErrors(prev => ({ ...prev, [index]: errMsg }))
      } finally {
        // Mark this segment as no longer generating
        setGeneratingImages(prev => {
          const next = new Set(prev)
          next.delete(index)
          return next
        })
      }
    }
    console.log('[DraftPage] All segments processed')
  }

  const toggleApproval = async (index: number) => {
    if (!draft) return

    try {
      const updatedSegments = [...draft.segments]
      updatedSegments[index].approved = !updatedSegments[index].approved
      
      // Update local state immediately
      setDraft({ ...draft, segments: updatedSegments })

      // Save to Supabase
      const supabase = getSupabase()
      const { error } = await supabase
        .from('production_drafts')
        .update({ segments: updatedSegments })
        .eq('id', draftId)

      if (error) {
        console.error('[toggleApproval] Failed to save:', error)
        alert('Error saving approval')
      } else {
        console.log('[toggleApproval] Segment approval saved for index:', index)
      }
    } catch (err) {
      console.error('[toggleApproval] Error:', err)
      alert('Error saving')
    }
  }

  // Split a too-long segment into two: divide its text + voiceover, insert a new segment
  // right after, and clear image/voiceover/approval on both halves so they get regenerated.
  const splitSegment = async (index: number) => {
    if (!draft) return
    const seg = draft.segments[index]
    const [t1, t2] = splitTextInTwo(seg.text)
    const [v1, v2] = splitTextInTwo(seg.voiceover || seg.text)
    if (!t2.trim() && !v2.trim()) {
      alert('Segmentet er for kort til å deles.')
      return
    }
    const first: Segment = { ...seg, text: t1, voiceover: v1, image_url: '', voiceover_url: undefined, approved: false }
    const second: Segment = { index: index + 1, text: t2, voiceover: v2, image_url: '', approved: false }
    const arr = [...draft.segments]
    arr.splice(index, 1, first, second)
    const reindexed = arr.map((s, i) => ({ ...s, index: i }))
    setDraft({ ...draft, segments: reindexed })
    try {
      const supabase = getSupabase()
      const { error } = await supabase
        .from('production_drafts')
        .update({ segments: reindexed })
        .eq('id', draftId)
      if (error) {
        console.error('[splitSegment] Failed to save:', error)
        alert('Kunne ikke lagre segment-delingen')
      } else {
        console.log('[splitSegment] Split segment', index, '→', reindexed.length, 'segmenter totalt')
      }
    } catch (err) {
      console.error('[splitSegment] Error:', err)
      alert('Feil ved deling av segment')
    }
  }

  // Bildebibliotek per artist (Lars 2026-07-30): for music-vertikalen duger
  // kun EGNE pressebilder og utgivelses-artwork — velg fra biblioteket eller
  // last opp, i stedet for AI-genererte «generiske band».
  const [imageLibrary, setImageLibrary] = useState<Array<{ url: string; name: string }>>([])
  const [imagePickerFor, setImagePickerFor] = useState<number | null>(null)
  const [libUploading, setLibUploading] = useState(false)
  const refreshImageLibrary = async () => {
    try {
      const { data: sess } = await getSupabase().auth.getSession()
      const token = sess?.session?.access_token
      const d = await fetch(`/api/products/images?productId=${productId}`, token ? { headers: { Authorization: `Bearer ${token}` } } : undefined).then((r) => r.json())
      if (d.images) setImageLibrary(d.images)
    } catch { /* biblioteket er valgfritt */ }
  }
  useEffect(() => { if (productId) refreshImageLibrary() }, [productId]) // eslint-disable-line react-hooks/exhaustive-deps
  const setSegmentImage = async (index: number, url: string) => {
    if (!draft) return
    const updatedSegments = [...draft.segments]
    updatedSegments[index].image_url = url
    setDraft({ ...draft, segments: updatedSegments })
    setImagePickerFor(null)
    try {
      const supabase = getSupabase()
      await supabase.from('production_drafts').update({ segments: updatedSegments }).eq('id', draftId)
    } catch (saveErr) {
      console.warn('[setSegmentImage] kunne ikke lagre segmenter:', saveErr)
    }
  }
  const uploadLibraryImage = async (file: File): Promise<string | null> => {
    if (file.size > 8 * 1024 * 1024) { alert('Bildet er for stort (maks 8 MB).'); return null }
    setLibUploading(true)
    try {
      const { data: sess } = await getSupabase().auth.getSession()
      const token = sess?.session?.access_token
      const fd = new FormData()
      fd.append('file', file)
      fd.append('productId', productId)
      const res = await fetch('/api/products/images', {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        body: fd,
      })
      const d = await res.json()
      if (!res.ok) { alert(d?.error || 'Opplasting feilet.'); return null }
      await refreshImageLibrary()
      return d.url || null
    } catch {
      alert('Opplasting feilet.')
      return null
    } finally {
      setLibUploading(false)
    }
  }

  const regenerateImage = async (index: number) => {
    if (!draft) return

    try {
      setRegeneratingIndex(index)
      const segment = draft.segments[index]

      const response = await fetch('/api/content/generate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic: (segment.image_prompt && segment.image_prompt.trim()) || segment.text,
          productId,
          imageSize,
          imageStyle,
          character: character || undefined,
          draftId,
        }),
      })

      if (!response.ok) throw new Error('Image generation failed')

      const data = await response.json()
      const updatedSegments = [...draft.segments]
      updatedSegments[index].image_url = data.imageUrl
      setDraft({ ...draft, segments: updatedSegments })
      // Lagre segmentene (inkl. redigert bilde-prompt) så produksjonen bruker samme prompt/bilde
      try {
        const supabase = getSupabase()
        await supabase.from('production_drafts').update({ segments: updatedSegments }).eq('id', draftId)
      } catch (saveErr) {
        console.warn('[regenerateImage] kunne ikke lagre segmenter:', saveErr)
      }
      addCost(character ? COSTS_NOK.imageCharacter : COSTS_NOK.imageStandard)
    } catch (err) {
      console.error('[DraftPage] Regenerate error:', err)
      alert('Error regenerating image')
    } finally {
      setRegeneratingIndex(null)
    }
  }

  const selectImageFromBank = (index: number, assetUrl: string) => {
    if (!draft) return

    const updatedSegments = [...draft.segments]
    updatedSegments[index].image_url = assetUrl
    setDraft({ ...draft, segments: updatedSegments })
    setShowImageBank(null)
  }

  // «Les inn selv» (2026-07-30): ta opp i nettleseren eller last opp lydfil —
  // egen stemme brukes i stedet for AI-stemmen for dette segmentet.
  const [recordingFor, setRecordingFor] = useState<number | null>(null)
  const [ownVoiceBusy, setOwnVoiceBusy] = useState<Record<number, boolean>>({})
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const recChunksRef = useRef<Blob[]>([])
  const persistSegments = async (updatedSegments: Segment[]) => {
    try {
      const supabase = getSupabase()
      await supabase.from('production_drafts').update({ segments: updatedSegments }).eq('id', draftId)
    } catch (e) {
      console.warn('[ownVoice] kunne ikke lagre segmenter:', e)
    }
  }
  // «Film = musikkens lengde» (Lars 30/7): musikklengde / antall segmenter.
  // Beregningen skjer paa serveren i produksjonsoeyeblikket med MAALTE
  // lengder — artisten tar de kreative valgene, systemet tar matematikken.
  const setMatchMusic = async (on: boolean) => {
    if (!draft) return
    const updatedSegments = draft.segments.map((s) => ({ ...s, match_music: on }))
    setDraft({ ...draft, segments: updatedSegments })
    await persistSegments(updatedSegments)
  }
  // «Uten tale» (31/7): scenen bæres av bilde + musikk. Lip-sync uten tale
  // gir ikke mening — bytt til vanlig bevegelse hvis den var valgt.
  const setNoVoice = async (index: number, on: boolean) => {
    if (!draft) return
    const updatedSegments = [...draft.segments]
    const seg = { ...updatedSegments[index], no_voice: on }
    if (on && seg.motion === 'talk') seg.motion = 'move'
    updatedSegments[index] = seg
    setDraft({ ...draft, segments: updatedSegments })
    await persistSegments(updatedSegments)
  }
  const uploadOwnVoice = async (index: number, blob: Blob, mimeType: string, filename: string) => {
    setOwnVoiceBusy((p) => ({ ...p, [index]: true }))
    try {
      const { data: sess } = await getSupabase().auth.getSession()
      const token = sess?.session?.access_token
      const fd = new FormData()
      fd.append('file', new File([blob], filename, { type: mimeType }))
      fd.append('draftId', draftId)
      fd.append('productId', productId)
      fd.append('segmentIndex', String(index))
      const res = await fetch('/api/content/own-voice', {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        body: fd,
      })
      const data = await res.json()
      if (!res.ok || !data.url) { alert(data?.error || 'Opplastingen feilet.'); return }
      if (!draft) return
      const updatedSegments = [...draft.segments]
      updatedSegments[index] = { ...updatedSegments[index], voiceover_url: data.url, own_voice: true }
      setDraft({ ...draft, segments: updatedSegments })
      setVoicePreviews((prev) => ({ ...prev, [index]: data.url }))
      await persistSegments(updatedSegments)
    } catch {
      alert('Opplastingen feilet.')
    } finally {
      setOwnVoiceBusy((p) => ({ ...p, [index]: false }))
    }
  }
  const startRecording = async (index: number) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mime = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm'
        : MediaRecorder.isTypeSupported('audio/mp4') ? 'audio/mp4' : ''
      const mr = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined)
      recChunksRef.current = []
      mr.ondataavailable = (e) => { if (e.data.size) recChunksRef.current.push(e.data) }
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop())
        const type = (mr.mimeType || 'audio/webm').split(';')[0]
        const blob = new Blob(recChunksRef.current, { type })
        const ext = type === 'audio/mp4' ? 'm4a' : 'webm'
        await uploadOwnVoice(index, blob, type, `opptak.${ext}`)
      }
      mediaRecorderRef.current = mr
      mr.start()
      setRecordingFor(index)
    } catch {
      alert('Fikk ikke tilgang til mikrofonen — sjekk nettlesertillatelsene.')
    }
  }
  const stopRecording = () => {
    mediaRecorderRef.current?.stop()
    mediaRecorderRef.current = null
    setRecordingFor(null)
  }
  const clearOwnVoice = async (index: number) => {
    if (!draft) return
    const updatedSegments = [...draft.segments]
    updatedSegments[index] = { ...updatedSegments[index], voiceover_url: undefined, own_voice: false }
    setDraft({ ...draft, segments: updatedSegments })
    setVoicePreviews((prev) => { const n = { ...prev }; delete n[index]; return n })
    await persistSegments(updatedSegments)
  }

  const previewVoiceover = async (index: number) => {
    if (!draft) return
    if (draft.voice_id === 'own') return // ingen AI-stemme valgt — knappen er skjult, men vern uansett
    const segment = draft.segments[index]
    setVoiceLoading((prev) => ({ ...prev, [index]: true }))
    try {
      const res = await fetch('/api/content/preview-voiceover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: segment.voiceover,
          voiceId: draft.voice_id || 'nhvaqgRyAq6BmFs3WcdX',
          draftId: draft.id,
          segmentIndex: index,
        }),
      })
      const data = await res.json()
      if (data.url) {
        addCost(COSTS_NOK.voiceoverPreview + (Number(data.actorExtraNok) || 0))
        setVoicePreviews((prev) => ({ ...prev, [index]: data.url }))

        // Persist R2 URL on the segment so production can reuse the approved file.
        // TTS-generering erstatter en ev. egen innspilling — nullstill flagget.
        // State-oppdateringen er FUNKSJONELL (Lars 31/7): en stale spread her
        // skrev over taxameter-økningen fra addCost — taxameteret sto stille
        // ved regenerering selv om serveren førte kostnaden riktig.
        // DB-kopien bygges separat fra closure (updater-funksjonen kjører
        // først ved neste render, etter supabase-kallet).
        const updatedSegments = [...draft.segments]
        updatedSegments[index] = { ...updatedSegments[index], voiceover_url: data.url, own_voice: false }
        setDraft((prev) => {
          if (!prev) return prev
          const segs = [...prev.segments]
          segs[index] = { ...segs[index], voiceover_url: data.url, own_voice: false }
          return { ...prev, segments: segs }
        })

        const supabase = getSupabase()
        const { error: saveErr } = await supabase
          .from('production_drafts')
          .update({ segments: updatedSegments })
          .eq('id', draftId)
        if (saveErr) {
          console.error('[previewVoiceover] Failed to save voiceover_url:', saveErr)
        } else {
          console.log(`[previewVoiceover] Saved voiceover_url for segment ${index}`)
        }
      }
    } catch (err) {
      console.error('Voiceover preview failed:', err)
    } finally {
      setVoiceLoading((prev) => ({ ...prev, [index]: false }))
    }
  }

  // Billing-flagg (UI-side; serveren håndhever autoritativt)
  const tenantInfo = useTenant()
  // Utpris-faktor (white-label): kunden ser priser der partnerens margin er inkludert
  const pf = tenantInfo.price_multiplier || 1
  const billingOn = process.env.NEXT_PUBLIC_BILLING_ENABLED === 'true'
  const [checkout, setCheckout] = useState<{ url: string; price: number; tier: string; breakdown: Array<{ label: string; nok: number }> } | null>(null)

  // Retur fra Stripe (?paid=1&session_id=…): poll draften til produksjonen er startet;
  // etter ~20s uten jobb → confirm-sikkerhetsnettet (hvis webhooken uteble)
  useEffect(() => {
    if (searchParams?.get('paid') !== '1') return
    const sessionId = searchParams?.get('session_id')
    let stopped = false
    let tries = 0
    const poll = async () => {
      if (stopped) return
      tries++
      try {
        const supabase = getSupabase()
        const { data } = await supabase.from('production_drafts').select('job_id, video_format').eq('id', draftId).single()
        if (data?.job_id) {
          window.location.href = `/dashboard/products/${productId}/video/status/${data.job_id}?format=${encodeURIComponent(data.video_format || '9:16')}`
          return
        }
        if (tries === 10 && sessionId) {
          await fetch('/api/production-checkout/confirm', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sessionId }),
          }).catch(() => {})
        }
      } catch { /* fortsett å prøve */ }
      if (tries < 60) setTimeout(poll, 2000)
    }
    poll()
    return () => { stopped = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Billing på: hent server-beregnet pris + checkout-URL, vis oppsummering
  const startCheckout = async () => {
    if (!draft || starting) return
    setStarting(true)
    try {
      const supabase = getSupabase()
      const { data: sess } = await supabase.auth.getSession()
      const token = sess?.session?.access_token
      const res = await fetch('/api/production-checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          draftId: draft.id,
          imageStyle,
          includeOutroCard: searchParams?.get('outro') !== '0',
          outroJingle,
          aiMotion,
          aiMotionEngine,
          character: character || null,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Checkout feilet')
      setCheckout({ url: data.url, price: data.price, tier: data.tier, breakdown: data.breakdown || [] })
    } catch (err: any) {
      alert('Kunne ikke starte betaling: ' + err.message)
    } finally {
      setStarting(false)
    }
  }

  const startProduction = async () => {
    if (billingOn && tenantInfo.billing_mode !== 'invoice') { startCheckout(); return }
    if (!draft || starting) return

    setStarting(true)
    try {
      // Verify that draft in DB actually has all approved before we start
      console.log('[startProduction] Verifying draft approval status in database...')
      const supabase = getSupabase()
      const { data: freshDraft } = await supabase
        .from('production_drafts')
        .select('segments')
        .eq('id', draft.id)
        .single()

      const allSaved = freshDraft?.segments?.every((s: any) => s.approved === true)
      if (!allSaved) {
        console.warn('[startProduction] Not all segments saved to database yet')
        alert('Saving in progress, try again in a moment')
        setStarting(false)
        return
      }

      console.log('[startProduction] All segments verified as approved')

      // Determine outro card preference: default true unless explicitly disabled (?outro=0)
      const includeOutroCard = searchParams?.get('outro') !== '0'
      // outroJingle kommer fra state (velgeren nedenfor), init fra ?jingle=

      // Call start-production API with draftId
      const response = await fetch('/api/start-production', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          draftId: draft.id,
          imageStyle,
          includeOutroCard,
          outroJingle,
          aiMotion,
          aiMotionEngine,
          character: character || null,
        }),
      })

      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Video production failed')

      console.log('[startProduction] Production started with jobId:', data.jobId)

      // Taxameter: animasjons-/lipsync-kostnad påløper ved produksjonsstart
      if (aiMotion) {
        const ms = draft.segments.map((s) => s.motion || (s.animate === true ? 'move' : 'none'))
        const kost = ms.filter((m) => m === 'move').length * COSTS_NOK.animate5s
          + ms.filter((m) => m === 'talk').length * COSTS_NOK.lipsyncTypical
        if (kost > 0) addCost(kost)
      }

      // Redirect to production status page — forward video format so the
      // status page can size the player container correctly.
      const videoFormat = draft.video_format || formatFromUrl || '9:16'
      // Full page load ensures the status page always runs the latest JS bundle.
      window.location.href = `/dashboard/products/${productId}/video/status/${data.jobId}?format=${encodeURIComponent(videoFormat)}&motion=${aiMotion ? '1' : '0'}`
    } catch (err) {
      console.error('[DraftPage] Production error:', err)
      // Serverens feilmelding er presis (f.eks. «les inn lyd på alle
      // segmentene») — aldri gjem den bak en generisk alert.
      alert(err instanceof Error && err.message ? err.message : 'Produksjonen kunne ikke starte — prøv igjen.')
      setStarting(false)
    }
  }

  const allApproved = draft?.segments?.every((s) => s.approved) ?? false

  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--paper)] flex items-center justify-center">
        <div className="text-gray-600">{t('loadingDraft')}</div>
      </div>
    )
  }

  if (error || !draft) {
    return (
      <div className="min-h-screen bg-[var(--paper)]">
        <div className="max-w-6xl mx-auto px-4 py-8">
          <Link href={`/dashboard/products/${productId}`} className="text-[var(--ember-deep)] hover:text-[var(--ink)] mb-4 inline-block">
            {t('backToProduct')}
          </Link>
          <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-red-700">{error || t('draftNotFound')}</div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[var(--paper)]">
      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <Link href={`/dashboard/products/${productId}`} className="text-[var(--ember-deep)] hover:text-[var(--ink)] mb-4 inline-block">
            {t('backToProduct')}
          </Link>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <h1 className="text-3xl font-bold text-gray-900">{t('title')}</h1>
              <p className="text-gray-600 mt-2">{t('subtitle')}</p>
            </div>
            {/* Ny sideutgave under bygging (31/7) — lenke i stedet for URL-fikling */}
            <Link
              href={`/dashboard/products/${productId}/video/draft/${draftId}/v2`}
              className="flex-shrink-0 px-4 py-2 rounded-lg border border-[var(--ember-tint-border)] bg-[var(--ember-tint-bg)] text-sm font-medium text-[var(--ember-deep)] hover:border-[var(--ember-deep)]"
            >
              Prøv den nye sidevisningen →
            </Link>
          </div>
        </div>

        {/* Video-innstillinger: stemme, bakgrunnsmusikk, jingle — kan endres når som helst,
            også etter at en video er laget (via «Rediger»-knappen på ferdig video). */}
        <div className="mb-8 bg-white rounded-lg border border-gray-200 p-5">
          <h2 className="text-lg font-semibold text-gray-900 mb-1">🎬 Video-innstillinger</h2>
          <p className="text-sm text-gray-500 mb-4">Bytt stemme, bakgrunnsmusikk eller jingle. Kjør «{t('startProduction')}» på nytt for å bruke endringene.</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {/* Stemme */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">🎙️ Stemme</label>
              <select
                value={draft.voice_id || 'nhvaqgRyAq6BmFs3WcdX'}
                onChange={(e) => updateVoice(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--ember-deep)] bg-white"
              >
                <option value="own">🎙️ Egen stemme — jeg leser inn per segment</option>
                {VOICES.map((v) => (
                  <option key={v.id} value={v.id}>{v.name}{v.desc ? ` — ${v.desc}` : ''}</option>
                ))}
                {actorVoices.length > 0 && (
                  <optgroup label="🎙️ Skuespillere (per bruk)">
                    {actorVoices.map((v) => (
                      <option key={v.voiceId} value={v.voiceId}>{v.name} — {fmtCredits(v.pricePerUseNok)} per produksjon</option>
                    ))}
                  </optgroup>
                )}
              </select>
              {(() => {
                const v = VOICES.find((x) => x.id === (draft.voice_id || 'nhvaqgRyAq6BmFs3WcdX'))
                return v ? <audio controls preload="none" src={v.preview} className="mt-2 w-full" /> : null
              })()}
              <p className="text-xs text-gray-400 mt-1">
                {draft.voice_id === 'own'
                  ? 'Ingen AI-stemme brukes. Les inn eller last opp lyd på hvert segment under — produksjonen krever at alle segmentene har lyd.'
                  : 'Brukes på alle nye voiceovers. Vil du heller bruke din egen stemme? Velg «🎙️ Egen stemme» øverst i listen.'}
              </p>
            </div>

            {/* Bakgrunnsmusikk */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">🎵 Bakgrunnsmusikk</label>
              <select
                value={draft.music_file || ''}
                onChange={(e) => updateMusic(e.target.value || null)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--ember-deep)] bg-white"
              >
                <option value="">Ingen musikk</option>
                {ownTracks(musicLibrary, productId).length > 0 && (
                  <optgroup label={tenantInfo.vertical === 'music' ? '🎤 Låtene dine' : 'Egen musikk (dette produktet)'}>
                    {ownTracks(musicLibrary, productId).map((m) => (
                      <option key={m.filename} value={m.filename}>{m.name}</option>
                    ))}
                  </optgroup>
                )}
                {/* Generisk bibliotek er irrelevant for artister (Lars 30/7) —
                    music-vertikalen ser kun egne låter og medleyer */}
                {tenantInfo.vertical !== 'music' && (
                  <optgroup label="Musikkbibliotek">
                    {sharedMusic(musicLibrary).map((m) => (
                      <option key={m.filename} value={m.filename}>{m.name}</option>
                    ))}
                  </optgroup>
                )}
              </select>
              {draft.music_file && (
                <audio controls preload="none" src={`/api/music/${encodeURIComponent(draft.music_file)}`} className="mt-2 w-full" />
              )}
              {/* Last opp egen bakgrunnsmusikk → valgt mappe → auto-velges */}
              <div className="mt-2 flex items-center gap-2">
                {/* Legacy delt-mappe-velger: kun rot (biblioteksvedlikehold).
                    Tenanter laster opp produkt-scopet (tracks-<productId>). */}
                {tenantInfo.slug === 'centerforge' && (
                  <select
                    value={musicFolder}
                    onChange={(e) => setMusicFolder(e.target.value)}
                    className="px-2 py-1 border border-gray-300 rounded-lg text-xs bg-white"
                    title="Mappe for opplastet musikk (rot)"
                  >
                    <option value="global">Felles</option>
                    <option value="bildeal">BilDeal</option>
                    <option value="reforhandle">Reforhandle</option>
                    <option value="singlepicker">SinglePicker</option>
                  </select>
                )}
                <input
                  type="file"
                  accept=".mp3"
                  disabled={musicUploading}
                  onChange={async (e) => {
                    const el = e.currentTarget
                    const file = el.files?.[0]
                    if (!file) return
                    const isRootSharedUpload = tenantInfo.slug === 'centerforge'
                    if (!file.name.toLowerCase().endsWith('.mp3')) { alert('Kun MP3-filer.'); el.value = ''; return }
                    if (isRootSharedUpload && file.size > 4 * 1024 * 1024) { alert('Filen er for stor (maks 4MB).'); el.value = ''; return }
                    setMusicUploading(true)
                    try {
                      let uploaded: { filename?: string } | undefined
                      if (isRootSharedUpload) {
                        const fd = new FormData(); fd.append('file', file)
                        const res = await fetch(`/api/music/upload?folder=${encodeURIComponent(musicFolder)}`, { method: 'POST', body: fd })
                        const up = await res.json().catch(() => null)
                        if (!res.ok) throw new Error(up?.error || 'Opplasting feilet.')
                        uploaded = up?.file
                      } else {
                        // Store laater: utenom Netlify-proxyen (413 over ~4,5 MB)
                        uploaded = await uploadTrack(file, tracksFolder(productId))
                      }
                      const data = await fetch('/api/music').then((r) => r.json())
                      if (data.files) setMusicLibrary(data.files)
                      if (uploaded?.filename) updateMusic(uploaded.filename) // auto-velg den nye musikken
                    } catch (err) {
                      alert(err instanceof Error ? err.message : 'Opplasting feilet.')
                    } finally {
                      setMusicUploading(false)
                      el.value = ''
                    }
                  }}
                  className="block flex-1 text-sm text-gray-500 file:mr-2 file:rounded file:border-0 file:bg-[var(--ember-deep)] file:px-2 file:py-1 file:text-xs file:font-medium file:text-white hover:file:bg-[var(--ink)] disabled:opacity-50"
                />
              </div>
              <p className="text-xs text-gray-400 mt-1">{musicUploading ? 'Laster opp musikk…' : (tenantInfo.slug === 'centerforge' ? 'Spilles under hele videoen. Eller last opp egen MP3 (maks 4MB).' : tenantInfo.vertical === 'music' ? 'Spilles under hele videoen. Last opp låtene du vil bruke (MP3, maks 50MB) — egen musikk, eller musikk du har rett til å bruke. Kun synlige for denne artisten. Flere låter? Lag en medley.' : 'Spilles under hele videoen. Last opp egen MP3 (maks 15MB) — kun synlig for dette produktet.')}</p>
            </div>

            {/* Medley av egne låter (fase 3b) — vises når produktet har ≥2 egne låter */}
            {(tenantInfo.vertical === 'music' || ownTracks(musicLibrary, productId).length >= 2) && (
              <div className="mt-3 border border-gray-200 rounded-lg p-3">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  🎚️ {tenantInfo.vertical === 'music' ? 'Lag medley av låtene dine' : 'Lag medley av egen musikk'}
                </label>
                <p className="text-xs text-gray-500 mb-2">
                  Velg 2–5 låter — de mikses til én fil med myk overgang og jevnt volum, og legges som bakgrunnsmusikk. Dra de valgte for å endre rekkefølgen.
                </p>
                {ownTracks(musicLibrary, productId).length < 2 && (
                  <p className="text-xs text-gray-400 mb-1">
                    {ownTracks(musicLibrary, productId).length === 0
                      ? 'Ingen låter ennå — last opp låtene du vil bruke med opplastingsfeltet over, så dukker de opp her.'
                      : 'Én låt lastet opp — last opp minst én til for å lage en medley.'}
                  </p>
                )}
                <div className="space-y-1">
                  {ownTracks(musicLibrary, productId).filter((m) => !isMedleyFile(m.filename)).map((m) => {
                    const idx = medleySelection.indexOf(m.filename)
                    return (
                      <button
                        key={m.filename}
                        type="button"
                        onClick={() => toggleMedleyTrack(m.filename)}
                        draggable={idx >= 0}
                        onDragStart={() => { dragTrackRef.current = m.filename }}
                        onDragOver={(ev) => { if (idx >= 0 && dragTrackRef.current) ev.preventDefault() }}
                        onDrop={(ev) => {
                          ev.preventDefault()
                          if (dragTrackRef.current && idx >= 0) reorderMedley(dragTrackRef.current, m.filename)
                          dragTrackRef.current = null
                        }}
                        className={`w-full flex items-center gap-2 text-left px-2 py-1.5 rounded border text-sm transition-colors ${
                          idx >= 0
                            ? 'border-[var(--ember-deep)] bg-[var(--ember-tint-bg)] cursor-move'
                            : 'border-gray-200 hover:border-[var(--ember-tint-border)]'
                        }`}
                      >
                        <span className={`w-5 h-5 rounded-full text-xs flex items-center justify-center flex-none ${
                          idx >= 0 ? 'bg-[var(--ember-deep)] text-white' : 'bg-gray-100 text-gray-400'
                        }`}>
                          {idx >= 0 ? idx + 1 : '+'}
                        </span>
                        <span className="truncate flex-1">{m.name}</span>
                        {/* Fjern fra MEDLEYEN (beholdes i laatbanken) — Lars 30/7 */}
                        {idx >= 0 && (
                          <span
                            role="button"
                            title="Fjern fra medleyen (låten beholdes i låtbanken)"
                            onClick={(ev) => {
                              ev.stopPropagation()
                              toggleMedleyTrack(m.filename)
                              setMedleyStarts((prev) => { const n = { ...prev }; delete n[m.filename]; return n })
                            }}
                            className="flex-none text-[var(--ember-deep)] text-xs px-1.5 py-0.5 rounded border border-[var(--ember-tint-border)] hover:bg-white"
                          >
                            − fjern
                          </span>
                        )}
                        {/* Permanent sletting — samme operasjon som laatbanken paa artistsiden */}
                        <span
                          role="button"
                          title="Slett låten PERMANENT fra låtbanken"
                          onClick={async (ev) => {
                            ev.stopPropagation()
                            if (!confirm(`Slette «${m.name}» permanent fra låtbanken?`)) return
                            try {
                              const res = await fetch(`/api/music/${encodeURIComponent(m.filename)}`, { method: 'DELETE' })
                              if (!res.ok) { alert('Slettingen feilet — prøv igjen.'); return }
                              setMedleySelection((prev) => prev.filter((f) => f !== m.filename))
                              setMedleyStarts((prev) => { const n = { ...prev }; delete n[m.filename]; return n })
                              if (draft?.music_file === m.filename) updateMusic(null)
                              const data = await fetch('/api/music').then((r) => r.json())
                              if (data.files) setMusicLibrary(data.files)
                            } catch { alert('Slettingen feilet — prøv igjen.') }
                          }}
                          className="flex-none text-gray-300 hover:text-red-500 text-xs px-1"
                        >
                          ✕
                        </span>
                      </button>
                    )
                  })}
                </div>
                {medleySelection.length > 0 && (
                  <div className="mt-3 pt-2 border-t border-gray-100">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xs font-medium text-gray-600">Lengde per låt:</span>
                      <select
                        value={medleyClip}
                        onChange={(e) => setMedleyClip(e.target.value as typeof medleyClip)}
                        className="px-2 py-1 border border-gray-300 rounded text-xs bg-white"
                      >
                        <option value="10">10 sek</option>
                        <option value="15">15 sek</option>
                        <option value="20">20 sek</option>
                        <option value="30">30 sek</option>
                        <option value="full">Hele låten</option>
                      </select>
                    </div>
                    <p className="text-xs text-gray-400 mb-2">
                      Spill låten og trykk «Start her» der utsnittet skal begynne — f.eks. rett før refrenget.
                    </p>
                    <div className="space-y-2">
                      {medleySelection.map((f, i) => {
                        const track = ownTracks(musicLibrary, productId).find((m) => m.filename === f)
                        if (!track) return null
                        const start = medleyStarts[f] || 0
                        const mm = Math.floor(start / 60)
                        const ss = String(Math.floor(start % 60)).padStart(2, '0')
                        return (
                          <div key={f} className="text-xs">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="w-4 text-gray-400 flex-none">{i + 1}.</span>
                              <span className="truncate font-medium text-gray-700">{track.name}</span>
                              <span className="flex-none text-gray-400">{start > 0 ? `fra ${mm}:${ss}` : 'fra start'}</span>
                            </div>
                            <div className="flex items-center gap-2 pl-6">
                              <audio
                                controls
                                preload="none"
                                src={`/api/music/${encodeURIComponent(f)}`}
                                ref={(el) => { medleyAudioRefs.current[f] = el }}
                                className="h-7 flex-1 min-w-0"
                              />
                              <button
                                type="button"
                                onClick={() => {
                                  const el = medleyAudioRefs.current[f]
                                  if (el) setMedleyStarts((prev) => ({ ...prev, [f]: Math.floor(el.currentTime) }))
                                }}
                                className="flex-none px-2 py-1 rounded border border-gray-300 text-gray-700 hover:border-[var(--ember-tint-border)]"
                              >
                                ⏱ Start her
                              </button>
                              {start > 0 && (
                                <button
                                  type="button"
                                  onClick={() => setMedleyStarts((prev) => { const n = { ...prev }; delete n[f]; return n })}
                                  className="flex-none text-gray-400 underline"
                                >
                                  nullstill
                                </button>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
                <button
                  type="button"
                  disabled={medleySelection.length < 2 || medleyBuilding}
                  onClick={buildMedley}
                  className="mt-2 px-3 py-1.5 rounded-lg text-sm font-medium text-white bg-[var(--ember-deep)] hover:opacity-90 disabled:opacity-40"
                >
                  {medleyBuilding ? '🎚️ Mikser låtene — tar noen sekunder…' : `Lag medley${medleySelection.length >= 2 ? ` (${medleySelection.length} låter)` : ''}`}
                </button>
                {medleyResult && (
                  <div className="mt-2 p-2 rounded-lg border border-green-200 bg-green-50">
                    <p className="text-xs font-medium text-green-800 mb-1">
                      ✅ Medleyen er klar{medleyDuration ? ` (${Math.round(medleyDuration)} sek)` : ''} og valgt som bakgrunnsmusikk — hør den:
                    </p>
                    <audio
                      controls
                      src={`/api/music/${encodeURIComponent(medleyResult.filename)}`}
                      onLoadedMetadata={(e) => setMedleyDuration(e.currentTarget.duration)}
                      className="w-full h-8"
                    />
                    <p className="text-xs text-green-700 mt-1">
                      Ikke fornøyd? Juster utsnittene og trykk «Lag medley» igjen — den forrige beholdes i låtbanken, så du kan sammenligne og slette taperen.
                      Lengden trenger ikke treffe filmen eksakt: musikken kuttes eller gjentas automatisk,
                      og volumet senkes mens stemmen snakker.
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Jingle på sluttplakat */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">🔔 Jingle (sluttplakat)</label>
              <select
                value={outroJingle || ''}
                onChange={(e) => updateJingle(e.target.value || null)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--ember-deep)] bg-white"
              >
                <option value="">Ingen jingle</option>
                {/* Jingler er merkevare-eiendeler: kun produktets egne (jingles-<produktId>).
                    De gamle felles-jinglene (BilDeal/Reforhandle) vises kun på rot-tenanten. */}
                {musicLibrary
                  .filter((m) => m.folder === `jingles-${productId}` || (m.folder === 'jingles' && tenantInfo.slug === 'centerforge'))
                  .map((j) => (
                    <option key={j.filename} value={j.filename}>{j.name}</option>
                  ))}
              </select>
              {outroJingle && (
                <audio controls preload="none" src={`/api/music/${encodeURIComponent(outroJingle)}`} className="mt-2 w-full" />
              )}
              {/* Dedikert jingle-opplasting → mappe «jingles» → auto-velges */}
              <div className="mt-2">
                <label className="text-xs text-gray-600 block mb-1">Eller last opp egen jingle (MP3, opptil 10 sek, maks 4MB):</label>
                <input
                  type="file"
                  accept=".mp3"
                  disabled={jingleUploading}
                  onChange={async (e) => {
                    const el = e.currentTarget
                    const file = el.files?.[0]
                    if (!file) return
                    if (!file.name.toLowerCase().endsWith('.mp3')) { alert('Kun MP3-filer.'); el.value = ''; return }
                    if (file.size > 4 * 1024 * 1024) { alert('Filen er for stor (maks 4MB).'); el.value = ''; return }
                    setJingleUploading(true)
                    try {
                      const fd = new FormData(); fd.append('file', file)
                      const res = await fetch(`/api/music/upload?folder=jingles-${productId}`, { method: 'POST', body: fd })
                      if (res.ok) {
                        const up = await res.json()
                        const data = await fetch('/api/music').then((r) => r.json())
                        if (data.files) setMusicLibrary(data.files)
                        if (up?.file?.filename) updateJingle(up.file.filename)
                      } else {
                        alert('Opplasting feilet.')
                      }
                    } catch (err) {
                      alert('Opplasting feilet: ' + (err instanceof Error ? err.message : 'ukjent feil'))
                    } finally {
                      setJingleUploading(false)
                      el.value = ''
                    }
                  }}
                  className="block w-full text-sm text-gray-500 file:mr-2 file:rounded file:border-0 file:bg-[var(--ember-deep)] file:px-2 file:py-1 file:text-xs file:font-medium file:text-white hover:file:bg-[var(--ink)] disabled:opacity-50"
                />
              </div>
              <p className="text-xs text-gray-400 mt-1">{jingleUploading ? 'Laster opp jingle…' : 'Spilles på sluttplakaten.'}</p>
            </div>
          </div>

          {/* Sluttplakat — full kontroll (Lars 31/7): budskap, lenke, bilde og
              farger, med forhåndsvisning som ligner det ferdige resultatet */}
          <div className="mt-5 pt-4 border-t border-gray-100">
            <label className="block text-sm font-medium text-gray-700 mb-2">🪧 Sluttplakaten</label>
            {(() => {
              const effMsg = outroMessage !== null ? outroMessage : (draft.cta || '')
              const effUrl = (outroUrl || outroDefaults.url).replace(/^https?:\/\//, '').replace(/\/$/, '')
              const effImg = outroImage === 'none' ? '' : (outroImage || outroDefaults.logoUrl)
              const urlInMsg = !!effUrl && effMsg.toLowerCase().includes(effUrl.toLowerCase())
              return (
                <div className="flex flex-col sm:flex-row gap-5">
                  {/* Forhåndsvisning (omtrentlig — samme innhold og farger som i filmen) */}
                  <div
                    className="flex-shrink-0 w-40 aspect-[9/16] rounded-lg border border-gray-200 overflow-hidden flex flex-col items-center justify-center px-2 text-center"
                    style={{ backgroundColor: outroBg, color: outroText }}
                  >
                    {effImg ? (
                      <img src={effImg} alt="" className="max-h-[45%] max-w-[85%] object-contain mb-2" />
                    ) : null}
                    {effMsg ? <p className="text-[10px] leading-snug mb-1">{effMsg}</p> : null}
                    {effUrl && !urlInMsg ? <p className="text-xs font-bold break-all">{effUrl}</p> : null}
                  </div>
                  <div className="flex-1 space-y-3">
                    <div>
                      <label className="block text-xs text-gray-600 mb-1">Budskapet på plakaten</label>
                      <textarea
                        value={effMsg}
                        onChange={(e) => setOutroMessage(e.target.value)}
                        onBlur={() => persistOutro({ message: outroMessage })}
                        rows={2}
                        placeholder="F.eks. Forhåndslagre på Spotify i dag"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--ember-deep)]"
                      />
                      {urlInMsg && (
                        <p className="text-[11px] text-gray-400 mt-0.5">Lenken står i budskapet — da vises den ikke en gang til under.</p>
                      )}
                    </div>
                    <div>
                      <label className="block text-xs text-gray-600 mb-1">Lenken (vises stor nederst)</label>
                      <input
                        type="text"
                        value={outroUrl}
                        onChange={(e) => setOutroUrl(e.target.value)}
                        onBlur={() => persistOutro({ url: outroUrl })}
                        placeholder={outroDefaults.url || 'f.eks. dittband.no eller linktr.ee/dittband'}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--ember-deep)]"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-600 mb-1">Bildet på plakaten</label>
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => { setOutroImage(''); setOutroPickerOpen(false); persistOutro({ image: '' }) }}
                          className={`px-3 py-1.5 rounded-full border text-xs font-medium ${outroImage === '' ? 'bg-[var(--ember-deep)] text-white border-[var(--ember-deep)]' : 'bg-white text-gray-600 border-gray-300 hover:border-gray-400'}`}
                        >
                          Artistbilde/logo
                        </button>
                        <button
                          type="button"
                          onClick={() => setOutroPickerOpen((v) => !v)}
                          className={`px-3 py-1.5 rounded-full border text-xs font-medium ${outroImage && outroImage !== 'none' ? 'bg-[var(--ember-deep)] text-white border-[var(--ember-deep)]' : 'bg-white text-gray-600 border-gray-300 hover:border-gray-400'}`}
                        >
                          📸 Velg fra biblioteket
                        </button>
                        <button
                          type="button"
                          onClick={() => { setOutroImage('none'); setOutroPickerOpen(false); persistOutro({ image: 'none' }) }}
                          className={`px-3 py-1.5 rounded-full border text-xs font-medium ${outroImage === 'none' ? 'bg-[var(--ember-deep)] text-white border-[var(--ember-deep)]' : 'bg-white text-gray-600 border-gray-300 hover:border-gray-400'}`}
                        >
                          Uten bilde
                        </button>
                      </div>
                      {outroPickerOpen && (
                        <div className="mt-2 grid grid-cols-4 sm:grid-cols-6 gap-2">
                          {imageLibrary.length === 0 && (
                            <p className="col-span-full text-xs text-gray-400">Ingen bilder i biblioteket ennå — last opp via et scenekort.</p>
                          )}
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
                    <div className="flex flex-wrap items-center gap-4">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-500">Bakgrunn</span>
                        <input
                          type="color"
                          value={outroBg}
                          onChange={(e) => updateOutroColors(e.target.value, outroText)}
                          className="h-8 w-12 rounded border border-gray-300 cursor-pointer"
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-500">Tekst</span>
                        <input
                          type="color"
                          value={outroText}
                          onChange={(e) => updateOutroColors(outroBg, e.target.value)}
                          className="h-8 w-12 rounded border border-gray-300 cursor-pointer"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => updateOutroColors('#ffffff', '#1a1a2e')}
                        className="px-3 py-1.5 rounded-lg text-sm bg-gray-100 hover:bg-gray-200 text-gray-800 border border-gray-300"
                      >
                        Hvit bakgrunn + mørk tekst
                      </button>
                    </div>
                    <p className="text-xs text-gray-400">
                      {outroSaving || colorSaving ? 'Lagrer…' : 'Lagres automatisk. Forhåndsvisningen er omtrentlig — innhold og farger stemmer, finish gjøres i filmen.'}
                    </p>
                  </div>
                </div>
              )
            })()}
          </div>

          {/* Film = musikkens lengde (Lars 30/7: matematikken til systemet,
              kreativiteten til artisten) */}
          <div className="mt-5 pt-4 border-t border-gray-100">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={draft.segments[0]?.match_music === true}
                onChange={(e) => setMatchMusic(e.currentTarget.checked)}
                className="w-4 h-4"
              />
              <span className="text-sm font-medium text-gray-700">🎼 Film = musikkens lengde</span>
            </label>
            <p className="text-xs text-gray-400 mt-1 ml-7">
              {draft.music_file
                ? `Musikkens lengde deles på ${draft.segments.length} segmenter — hvert bilde står til neste del av låten er spilt. Stemmen får alltid plass; musikken løftes automatisk i pausene.`
                : 'Velg bakgrunnsmusikk først — uten musikk har valget ingen effekt.'}
            </p>
            {/* Scene-anbefaling (Lars 31/7): ~5 s per bilde er filmspråk.
                10+ s per bilde blir dvelende — anbefal flere scener. */}
            {draft.segments[0]?.match_music === true && musicDur !== null && musicDur > 1 && (() => {
              const anbefalt = Math.max(2, Math.round(musicDur / 5))
              const perScene = musicDur / draft.segments.length
              if (Math.abs(anbefalt - draft.segments.length) <= 1) return null
              return (
                <p className="text-xs mt-2 ml-7 text-[var(--ember-deep)]">
                  💡 Musikken er {Math.round(musicDur)} sek — med {draft.segments.length} scener står hvert bilde i ~{Math.round(perScene)} sek.
                  Vi anbefaler rundt {anbefalt} scener (~5 sek per bilde). Del gjerne opp scenene — og scener uten tale er helt fint, da bærer musikken.
                </p>
              )
            })()}
          </div>

          {/* Karakter-modus: konsistent vert i segmentbildene (flux-lora) */}
          <div className="mt-5 pt-4 border-t border-gray-100">
            <label className="block text-sm font-medium text-gray-700 mb-1">🧑‍🎤 Karakter</label>
            <div className="flex items-center gap-3 flex-wrap">
              <select
                value={character}
                onChange={(e) => setCharacter(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
              >
                <option value="">{tenantInfo.vertical === 'music' ? 'Ingen — jeg bruker egne bilder' : 'Ingen — vanlige AI-bilder'}</option>
                {/* Adam er eksklusiv for rot-tenanten (lib/characters.ts håndhever server-side) */}
                {tenantInfo.slug === 'centerforge' && <option value="adam">Adam (Reforhandle)</option>}
                <option value="lawrence">Lawrence (Peregrine)</option>
                {userChars.map((c) => (
                  <option key={c.id} value={c.id}>{c.name} (egen)</option>
                ))}
                {faceActors.length > 0 && (
                  <optgroup label="🧑 Skuespiller-ansikter (per bruk)">
                    {faceActors.map((f) => (
                      <option key={f.faceCharacterId} value={f.faceCharacterId}>{f.name} — {f.pricePerUseNok.toLocaleString('nb-NO')} kr per produksjon</option>
                    ))}
                  </optgroup>
                )}
              </select>
              <span className="text-xs text-gray-400">Brukes ved «Regenerer bilde» — samme vert i alle segmenter. <a href="/dashboard/characters" className="text-[var(--ember-deep)] hover:underline">Lag egen karakter →</a></span>
            </div>
          </div>

          {/* AI-bevegelse: animer stillbildene til ekte video (koster mer + tar lengre tid) */}
          <div className="mt-5 pt-4 border-t border-gray-100">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={aiMotion}
                onChange={(e) => {
                  const on = e.target.checked
                  setAiMotion(on)
                  const supabase = getSupabase()
                  // Persister valget — ellers er det borte ved neste besøk
                  supabase.from('production_drafts').update({ ai_motion: on }).eq('id', draftId)
                    .then(({ error }: { error: any }) => { if (error) console.warn('[aiMotion lagring]', error.message) })
                  setDraft((prev) => (prev ? { ...prev, ai_motion: on } : prev))
                  // Standardmønster første gang: første + siste segment snakker (lip-sync), resten bevegelse
                  if (on && draft && !draft.segments.some((s) => s.motion)) {
                    const last = draft.segments.length - 1
                    const segs = draft.segments.map((s, i) => ({ ...s, motion: (i === 0 || i === last) ? ('talk' as const) : ('move' as const) }))
                    setDraft((prev) => (prev ? { ...prev, ai_motion: on, segments: segs } : prev))
                    supabase.from('production_drafts').update({ segments: segs }).eq('id', draftId)
                      .then(({ error }: { error: any }) => { if (error) console.warn('[aiMotion default]', error.message) })
                  }
                }}
                className="mt-1 h-4 w-4"
              />
              <div>
                <div className="text-sm font-medium text-gray-900">🎥 AI-bevegelse (ekte video)</div>
                <div className="text-xs text-gray-500 mt-0.5">
                  Standard: første og siste segment snakker (lip-sync), resten får subtil bevegelse. Overstyr per segment under — f.eks. «Snakk» på alle. Render tar lengre tid.
                </div>
              </div>
            </label>
            {aiMotion && (
              <div className="mt-2 pl-7 flex items-center gap-2">
                <span className="text-xs text-gray-500">Motor</span>
                <select
                  value={aiMotionEngine}
                  onChange={(e) => {
                    const eng = e.target.value
                    setAiMotionEngine(eng)
                    setDraft((prev) => (prev ? { ...prev, ai_motion_engine: eng } : prev))
                    getSupabase().from('production_drafts').update({ ai_motion_engine: eng }).eq('id', draftId)
                      .then(({ error }: { error: any }) => { if (error) console.warn('[motor lagring]', error.message) })
                  }}
                  className="px-2 py-1 border border-gray-300 rounded-lg text-xs bg-white"
                >
                  <option value="kling">Kling (anbefalt — best kvalitet)</option>
                  <option value="pixverse">PixVerse (rask/billig)</option>
                </select>
              </div>
            )}
          </div>
        </div>

        {/* Image generation progress banner */}
        {generatingImages.size > 0 && (
          <div className="mb-6 bg-blue-50 border border-blue-200 rounded-lg px-5 py-4 flex items-center gap-3">
            <div className="w-5 h-5 border-[3px] border-blue-500 border-t-transparent rounded-full animate-spin flex-shrink-0" />
            <div>
              <p className="text-sm font-medium text-[var(--ink)]">
                {t('generatingImages', { done: draft.segments.length - generatingImages.size, total: draft.segments.length })}
              </p>
              <p className="text-xs text-[var(--ember-deep)] mt-0.5">{t('generatingImagesHint')}</p>
            </div>
          </div>
        )}

        {/* Segments */}
        <div className="space-y-6 mb-8">
          {draft.segments.map((segment, index) => (
            <div key={index} className="bg-white rounded-lg border border-gray-200 p-6">
              <div className="flex gap-6">
                {/* Image — aspect ratio matches video format */}
                <div className={`flex-shrink-0 ${videoFormat === '16:9' ? 'w-64' : 'w-36'}`}>
                  <div className={`w-full ${imageAspect} rounded-lg overflow-hidden border border-gray-200 bg-gray-100`}>
                    {segment.image_url ? (
                      <img
                        src={segment.image_url}
                        alt={`Segment ${index + 1}`}
                        // Music-vertikalen viser HELE bildet med sort rundt —
                        // som i den ferdige filmen (imageFit contain, 31/7)
                        className={tenantInfo.vertical === 'music' ? 'w-full h-full object-contain bg-black' : 'w-full h-full object-cover'}
                      />
                    ) : generatingImages.has(index) ? (
                      <div className="w-full h-full flex flex-col items-center justify-center gap-2 animate-pulse">
                        <div className="w-8 h-8 border-4 border-blue-400 border-t-transparent rounded-full animate-spin" />
                        <span className="text-xs text-gray-500 text-center px-2">Generating…</span>
                      </div>
                    ) : imageErrors[index] ? (
                      <div className="w-full h-full flex flex-col items-center justify-center gap-1 px-2 text-center bg-red-50">
                        <span className="text-red-500">⚠️</span>
                        <span className="text-xs text-red-600 font-medium">{t('imageError')}</span>
                        <span className="text-xs text-red-400 break-all">{imageErrors[index]}</span>
                      </div>
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-gray-400 text-xs text-center px-2">
                        {tenantInfo.vertical === 'music' ? 'Velg et av bildene dine under' : t('noImage')}
                      </div>
                    )}
                  </div>
                  {/* «Bruk eget bilde»: velg fra biblioteket eller last opp */}
                  <button
                    type="button"
                    onClick={() => setImagePickerFor(imagePickerFor === index ? null : index)}
                    className="mt-2 w-full text-xs px-2 py-1.5 rounded border border-gray-200 text-gray-600 hover:border-[var(--ember-tint-border)]"
                  >
                    📸 {tenantInfo.vertical === 'music' ? 'Velg blant bildene dine' : 'Bruk eget bilde'}
                  </button>
                  {imagePickerFor === index && (
                    <div className="mt-2 p-2 border border-gray-200 rounded-lg bg-gray-50">
                      {imageLibrary.length > 0 && (
                        <div className="grid grid-cols-3 gap-1.5 mb-2">
                          {imageLibrary.map((img) => (
                            <button
                              key={img.url}
                              type="button"
                              title={img.name}
                              onClick={() => setSegmentImage(index, img.url)}
                              className={`aspect-square rounded overflow-hidden border-2 ${segment.image_url === img.url ? 'border-[var(--ember-deep)]' : 'border-transparent hover:border-[var(--ember-tint-border)]'}`}
                            >
                              <img src={img.url} alt={img.name} className="w-full h-full object-cover" />
                            </button>
                          ))}
                        </div>
                      )}
                      <label className="block text-xs text-gray-600 cursor-pointer">
                        <span className="underline">{libUploading ? 'Laster opp…' : '+ Last opp nytt (pressebilde/artwork, maks 8 MB)'}</span>
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
                            if (url) await setSegmentImage(index, url)
                          }}
                        />
                      </label>
                    </div>
                  )}
                </div>

                {/* Content */}
                <div className="flex-1">
                  <div className="mb-4">
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">{t('segmentTitle', { index: index + 1 })}</h3>

                    {/* Text */}
                    <div className="mb-4">
                      <label className="block text-sm font-medium text-gray-700 mb-1">{t('textLabel')}</label>
                      <textarea
                        value={segment.text}
                        onChange={(e) => {
                          const updatedSegments = [...draft.segments]
                          updatedSegments[index].text = e.target.value
                          setDraft({ ...draft, segments: updatedSegments })
                        }}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--ember-deep)]"
                        rows={2}
                      />
                    </div>

                    {/* «Uten tale» (Lars 31/7): scenen bæres av bilde + musikk */}
                    <label className="mb-3 flex items-center gap-2 cursor-pointer text-sm text-gray-700">
                      <input
                        type="checkbox"
                        checked={segment.no_voice === true}
                        onChange={(e) => setNoVoice(index, e.currentTarget.checked)}
                        className="w-4 h-4"
                      />
                      <span>🔇 Uten tale — bare bilde og musikk</span>
                    </label>
                    {segment.no_voice === true && (
                      <p className="mb-4 text-xs text-gray-500">
                        Denne scenen får ingen stemme — musikken spiller i full styrke. Teksten over kan stå tom, eller vises som undertekst.
                      </p>
                    )}

                    {/* Voiceover */}
                    {segment.no_voice !== true && (
                    <div className="mb-4">
                      <label className="block text-sm font-medium text-gray-700 mb-1">{t('voiceoverLabel')}</label>
                      <textarea
                        value={segment.voiceover}
                        onChange={(e) => {
                          const updatedSegments = [...draft.segments]
                          updatedSegments[index].voiceover = e.target.value
                          setDraft({ ...draft, segments: updatedSegments })
                        }}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--ember-deep)]"
                        rows={3}
                      />

                      {/* Voiceover preview */}
                      <div className="mt-2 flex items-center gap-2">
                        {(voicePreviews[index] || (segment.own_voice && segment.voiceover_url)) ? (
                          <audio controls src={voicePreviews[index] || segment.voiceover_url} className="w-full h-8" />
                        ) : null}
                        {/* TTS-preview skjules når «Egen stemme» er valgt — det finnes ingen AI-stemme å generere */}
                        {draft.voice_id !== 'own' && (
                          <button
                            type="button"
                            onClick={() => previewVoiceover(index)}
                            disabled={voiceLoading[index]}
                            className="px-3 py-1 bg-purple-600 text-white rounded-lg text-sm disabled:opacity-50 whitespace-nowrap"
                          >
                            {voiceLoading[index]
                              ? t('generatingVoiceover')
                              : voicePreviews[index]
                                ? t('regenerateAudio')
                                : t('previewVoice')}
                          </button>
                        )}
                      </div>

                      {/* «Les inn selv» — egen stemme i stedet for AI-stemmen */}
                      <div className="mt-2 flex items-center gap-3 flex-wrap text-xs">
                        {segment.own_voice && segment.voiceover_url ? (
                          <>
                            <span className="font-medium text-green-700">🎙️ Egen innspilling brukes i videoen</span>
                            <button type="button" onClick={() => clearOwnVoice(index)} className="text-gray-500 underline hover:text-gray-700">
                              Fjern (bruk AI-stemmen)
                            </button>
                          </>
                        ) : ownVoiceBusy[index] ? (
                          <span className="text-gray-500">Laster opp innspillingen…</span>
                        ) : recordingFor === index ? (
                          <button type="button" onClick={stopRecording} className="px-3 py-1 rounded-lg bg-red-600 text-white font-medium animate-pulse">
                            ⏹ Stopp opptaket
                          </button>
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={() => startRecording(index)}
                              disabled={recordingFor !== null}
                              className="px-3 py-1 rounded-lg border border-gray-300 text-gray-700 hover:border-[var(--ember-tint-border)] disabled:opacity-40"
                            >
                              🎙️ Les inn selv
                            </button>
                            <label className="cursor-pointer text-gray-500 underline hover:text-gray-700">
                              eller last opp lydfil
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
                            {tenantInfo.vertical === 'music' && (
                              <span className="text-gray-400">Din stemme — ikke AI — i dette segmentet. Manuset over er teleprompteren din.</span>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                    )}

                    {/* Approval Status */}
                    <div className="mb-4">
                      <span className={`inline-block px-3 py-1 rounded-full text-sm font-medium ${
                        segment.approved
                          ? 'bg-green-100 text-green-800'
                          : 'bg-yellow-100 text-yellow-800'
                      }`}>
                        {segment.approved ? t('approved') : t('waitingApproval')}
                      </span>
                    </div>
                  </div>

                  {/* Buttons */}
                  <div className="flex gap-2 flex-wrap">
                    {aiMotion && (
                      <div className="w-full mb-1 flex items-center gap-2 flex-wrap">
                        <span className="text-xs text-gray-500">Bevegelse:</span>
                        {[
                          { v: 'none' as const, label: 'Stillbilde', cost: 'gratis' },
                          { v: 'move' as const, label: '🎥 Bevegelse', cost: `ca. ${fmtCredits(COSTS_NOK.animate5s * pf)}` },
                          { v: 'talk' as const, label: '🗣️ Snakk (lip-sync)', cost: `ca. ${fmtCredits(COSTS_NOK.lipsyncPerSec * pf)}/sek` },
                          // Lip-sync uten tale gir ikke mening — skjul valget for stille scener
                        ].filter((opt) => !(segment.no_voice === true && opt.v === 'talk')).map((opt) => {
                          const current = segment.motion || (segment.animate === true ? 'move' : 'none')
                          return (
                            <button
                              key={opt.v}
                              type="button"
                              onClick={() => updateMotion(index, opt.v)}
                              className={`px-3 py-1.5 rounded-full border text-xs font-medium transition-colors ${
                                current === opt.v
                                  ? 'bg-[var(--ember-deep)] text-white border-[var(--ember-deep)]'
                                  : 'bg-white text-gray-600 border-gray-300 hover:border-gray-400'
                              }`}
                            >
                              {opt.label} <span className="opacity-70">({opt.cost})</span>
                            </button>
                          )
                        })}
                        {/* Bommet animasjonen? (fremmed person, rar bevegelse)
                            — nytt forsøk uten å røre de andre scenene */}
                        {(segment.motion || (segment.animate === true ? 'move' : 'none')) !== 'none' && (
                          <button
                            type="button"
                            onClick={() => regenerateMotion(index)}
                            className={`px-3 py-1.5 rounded-full border text-xs font-medium transition-colors ${
                              segment.clip_nonce
                                ? 'bg-amber-50 text-amber-800 border-amber-300'
                                : 'bg-white text-gray-500 border-gray-300 hover:border-gray-400'
                            }`}
                            title="Neste produksjon lager denne animasjonen på nytt. De andre scenene gjenbrukes gratis."
                          >
                            {segment.clip_nonce ? '↻ Lages på nytt ved produksjon' : '↻ Lag animasjonen på nytt'}
                          </button>
                        )}
                        {/* Se animasjonen FØR produksjon — klippet gjenbrukes
                            gratis i produksjonen etterpå (samme cache) */}
                        {(segment.motion || (segment.animate === true ? 'move' : 'none')) === 'move' && (
                          <button
                            type="button"
                            onClick={() => previewMotion(index)}
                            disabled={['starting', 'generating'].includes(motionPreviewState[index]?.status || '')}
                            className="px-3 py-1.5 rounded-full border border-[var(--ember-tint-border)] bg-[var(--ember-tint-bg)] text-xs font-medium text-[var(--ember-deep)] hover:border-[var(--ember-deep)] disabled:opacity-60"
                            title="Lager klippet nå så du kan se det før produksjon. Brukes om igjen i produksjonen — du betaler kun én gang."
                          >
                            {motionPreviewState[index]?.status === 'starting' && '▶ Starter…'}
                            {motionPreviewState[index]?.status === 'generating' && '▶ Lager klippet… (1–3 min)'}
                            {!['starting', 'generating'].includes(motionPreviewState[index]?.status || '') && `▶ Se animasjonen (${fmtCredits(COSTS_NOK.animate5s * pf)})`}
                          </button>
                        )}
                      </div>
                    )}
                    {/* Resultatet av forhåndsvisningen */}
                    {motionPreviewState[index]?.status === 'ready' && motionPreviewState[index]?.url && (
                      <div className="w-full mb-2">
                        <video
                          src={motionPreviewState[index].url}
                          controls
                          playsInline
                          className="rounded-lg border border-gray-200 max-h-64 bg-black"
                        />
                        <p className="text-xs text-gray-400 mt-1">
                          Slik blir bevegelsen. Ikke fornøyd? Trykk «Lag animasjonen på nytt» og se igjen.
                        </p>
                      </div>
                    )}
                    {motionPreviewState[index]?.status === 'failed' && (
                      <p className="w-full mb-2 text-xs text-red-700">
                        {motionPreviewState[index].error}
                      </p>
                    )}
                    <button
                      onClick={() => toggleApproval(index)}
                      disabled={generatingImages.has(index)}
                      className={`px-4 py-2 rounded-lg font-medium text-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                        segment.approved
                          ? 'bg-green-600 hover:bg-green-700 text-white'
                          : 'bg-[var(--ember-deep)] hover:bg-[var(--ink)] text-white'
                      }`}
                    >
                      {segment.approved ? t('approvedButton') : t('approveButton')}
                    </button>

                    <button
                      onClick={() => regenerateImage(index)}
                      disabled={regeneratingIndex === index}
                      className="px-4 py-2 rounded-lg font-medium text-sm bg-gray-200 hover:bg-gray-300 text-gray-900 transition-colors disabled:opacity-50"
                    >
                      {regeneratingIndex === index ? t('regenerating') : t('regenerateImage')}
                    </button>

                    <button
                      onClick={() => setShowImageBank(index)}
                      className="px-4 py-2 rounded-lg font-medium text-sm bg-purple-600 hover:bg-purple-700 text-white transition-colors"
                    >
                      {t('selectFromBank')}
                    </button>

                    <button
                      onClick={() => splitSegment(index)}
                      title="Del dette segmentet i to hvis teksten er for lang"
                      className="px-4 py-2 rounded-lg font-medium text-sm bg-blue-600 hover:bg-blue-700 text-white transition-colors"
                    >
                      ✂️ Del segment
                    </button>

                    <button
                      onClick={() => setOpenPrompts((prev) => {
                        const n = new Set(prev)
                        n.has(index) ? n.delete(index) : n.add(index)
                        return n
                      })}
                      title="Juster hva bildet skal vise, og regenerer"
                      className="px-4 py-2 rounded-lg font-medium text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 border border-gray-300 transition-colors"
                    >
                      {openPrompts.has(index) ? '▾ Bilde-prompt' : '✎ Bilde-prompt'}
                    </button>

                    {openPrompts.has(index) && (
                      <div className="w-full mt-2">
                        <label className="block text-xs font-medium text-gray-600 mb-1">
                          Bilde-prompt <span className="font-normal text-gray-400">— styrer hva bildet viser. La stå tom for å bruke underteksten.</span>
                        </label>
                        <textarea
                          value={segment.image_prompt ?? ''}
                          onChange={(e) => {
                            const segs = [...draft.segments]
                            segs[index] = { ...segs[index], image_prompt: e.target.value }
                            setDraft({ ...draft, segments: segs })
                          }}
                          placeholder={segment.text}
                          rows={2}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--ember-deep)]"
                        />
                        <p className="text-xs text-gray-400 mt-1">Trykk «{t('regenerateImage')}» etter endring for å lage nytt bilde med denne prompten (lagres automatisk).</p>
                      </div>
                    )}

                    {/* Image Bank Modal */}
                    {showImageBank === index && (
                      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                        <div className="bg-white rounded-lg p-6 max-w-2xl w-full mx-4">
                          <h4 className="text-lg font-semibold mb-4">{t('imageBankTitle')}</h4>
                          <div className="grid grid-cols-3 gap-4 mb-4 max-h-96 overflow-y-auto">
                            {assets.length > 0 ? (
                              assets.map((asset) => (
                                <button
                                  key={asset.id}
                                  onClick={() => selectImageFromBank(index, asset.asset_url)}
                                  className="group relative rounded-lg overflow-hidden aspect-square border-2 border-transparent hover:border-blue-500"
                                >
                                  <img
                                    src={asset.asset_url}
                                    alt={asset.name}
                                    className="w-full h-full object-cover group-hover:opacity-80 transition-opacity"
                                  />
                                </button>
                              ))
                            ) : (
                              <p className="col-span-3 text-gray-500 text-center py-8">{t('noImagesInBank')}</p>
                            )}
                          </div>
                          <button
                            onClick={() => setShowImageBank(null)}
                            className="w-full px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-900 rounded-lg font-medium"
                          >
                            {t('close')}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Betalings-oppsummering (billing på): server-beregnet pris → Stripe */}
        {checkout && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setCheckout(null)}>
            <div className="bg-white rounded-xl p-6 max-w-sm w-full mx-4" onClick={(e) => e.stopPropagation()}>
              <h3 className="text-lg font-semibold text-gray-900 mb-3">Bekreft produksjon</h3>
              <div className="space-y-1 mb-3">
                {checkout.breakdown.map((l) => (
                  <div key={l.label} className="flex justify-between text-sm text-gray-600">
                    <span>{l.label}</span><span>{fmtNok(l.nok)}</span>
                  </div>
                ))}
                <div className="flex justify-between font-semibold text-gray-900 border-t border-gray-100 pt-2">
                  <span>Totalt</span><span>{fmtNok(checkout.price)}</span>
                </div>
              </div>
              {checkout.tier === 'anonymous' && (
                <p className="text-xs text-[var(--ember-deep)] bg-[var(--ember-tint-bg)] border border-[var(--ember-tint-border)] rounded-lg px-3 py-2 mb-3">
                  💡 <a href="/register" className="underline font-medium">Registrer deg</a> og få 33 % rabatt på alle produksjoner.
                </p>
              )}
              <div className="flex gap-3">
                <button
                  onClick={() => { window.location.href = checkout.url }}
                  className="flex-1 px-4 py-2.5 rounded-lg font-semibold text-white bg-green-600 hover:bg-green-700"
                >
                  💳 Betal og produser
                </button>
                <button onClick={() => setCheckout(null)} className="px-4 py-2.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700">
                  Avbryt
                </button>
              </div>
              <p className="text-xs text-gray-400 mt-2">Produksjonen starter automatisk når betalingen er bekreftet.</p>
            </div>
          </div>
        )}

        {/* Start Production Button */}
        <div className="sticky bottom-0 bg-white border-t border-gray-200 p-6 flex justify-between items-center">
          <div className="text-sm text-gray-600">
            {allApproved ? (
              <div className="flex items-center gap-3">
                <span className="text-green-600 font-medium">{t('allApprovedStatus')}</span>
                <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded">
                  {t('imageStyleLabel')}: {{'editorial':'📸 Editorial','tech':'🖥️ Tech','warm':'🌅 Warm','minimal':'⬜ Minimal','painterly':'🎨 Painterly'}[imageStyle] || imageStyle}
                </span>
              </div>
            ) : (
              <span className="text-yellow-600 font-medium">
                {t('waitingSegments', { count: draft.segments.filter((s) => !s.approved).length })}
              </span>
            )}
            {/* 💰 Flytende taxameter (nede til høyre) — oppdateres for hvert valg */}
            {(() => {
              const motions = aiMotion ? draft.segments.map((s) => s.motion || (s.animate === true ? 'move' : 'none')) : []
              const nMove = motions.filter((m) => m === 'move').length
              const nTalk = motions.filter((m) => m === 'talk').length
              const nImg = draft.segments.filter((s) => !s.image_url || !s.image_url.trim()).length
              return (
                <CostMeter
                  saldo={saldo}
                  paalopt={(Number(draft.cost_accumulated) || 0) * pf}
                  lines={[
                    { label: '🎙️ Skuespillerstemme (per bruk)', amount: actorVoices.find((v) => v.voiceId === draft.voice_id)?.pricePerUseNok || 0 },
                    { label: `🗣️ Snakk × ${nTalk}`, amount: nTalk * COSTS_NOK.lipsyncTypical * pf },
                    { label: `🎥 Bevegelse × ${nMove}`, amount: nMove * COSTS_NOK.animate5s * pf },
                    { label: `🖼️ Bilder × ${nImg}`, amount: nImg * (character ? COSTS_NOK.imageCharacter : COSTS_NOK.imageStandard) * pf },
                  ]}
                />
              )
            })()}
          </div>

          <button
            onClick={startProduction}
            disabled={!allApproved || starting}
            className={`px-6 py-3 rounded-lg font-semibold text-white transition-colors ${
              !allApproved || starting
                ? 'bg-gray-400 cursor-not-allowed opacity-50'
                : 'bg-green-600 hover:bg-green-700'
            }`}
          >
            {starting ? (
              <span className="inline-flex items-center gap-2">
                <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Starter produksjon…
              </span>
            ) : (
              t('startProduction')
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
