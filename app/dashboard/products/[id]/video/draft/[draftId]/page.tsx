'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { getSupabase } from '@/lib/supabaseClient'
import { useTranslations } from 'next-intl'
import { COSTS_NOK, fmtNok, fmtCredits } from '@/lib/costs'
import CostMeter from '@/components/CostMeter'
import { useTenant } from '@/lib/tenantContext'
import { ownTracks, sharedMusic, tracksFolder, TRACK_MAX_BYTES } from '@/lib/musicLibrary'

// Tilgjengelige stemmer (speiler draft/new-siden). Preview spilles direkte fra ElevenLabs.
const VOICES = [
  { id: 'buLDb121bbD0rdxWw26y', name: 'Adam', desc: 'Reforhandle-verten (karakter-stemme)', preview: 'https://api.us.elevenlabs.io/v1/voices/buLDb121bbD0rdxWw26y/previews/audio?payload=eyJ2b2ljZV9zb3VyY2UiOiJjdXN0b20iLCJ3b3Jrc3BhY2VfaWQiOiJhODM3MTU4Y2UzYzM0MjQyODdjODhlYTg4ZDMxZDVjMSIsImZpbGVuYW1lIjoiZTdhYWNlNjQtNGU5OC00NTM3LTg5YTEtOTc4MTAwOGNiYTU5Lm1wMyIsInRpbWVzdGFtcCI6MTc4NTE0NjQwMDAwMDAwMH0%3D' },
  { id: 'nhvaqgRyAq6BmFs3WcdX', name: 'Øyvind', desc: 'Dyp og rolig', preview: 'https://storage.googleapis.com/eleven-public-prod/database/workspace/7dc5c03caf8f40daa575fa9eacbf3de8/voices/nhvaqgRyAq6BmFs3WcdX/Z8yVliHOyn9eSmt4YEVw.mp3' },
  { id: 's2xtA7B2CTXPPlJzch1v', name: 'Dennis', desc: 'Klar og behagelig', preview: 'https://storage.googleapis.com/eleven-public-prod/database/workspace/15af1c0d0dcd479cb8376a767ab07b4c/voices/s2xtA7B2CTXPPlJzch1v/YB9DE4weRg6BTei8hVZ5.mp3' },
  { id: '2dhHLsmg0MVma2t041qT', name: 'Johannes', desc: 'Selvsikker', preview: 'https://storage.googleapis.com/eleven-public-prod/custom/voices/2dhHLsmg0MVma2t041qT/fX3l7ljt7bx6zRPz8VdC.mp3' },
  { id: 'BGEU6wFi2uNm6Kje1Yhk', name: 'Maja', desc: 'Nordisk, dramatisk', preview: 'https://storage.googleapis.com/eleven-public-prod/database/workspace/ed9b05e6324c457685490352e9a1ec90/voices/BGEU6wFi2uNm6Kje1Yhk/gCIHS9pPkrtwiAjN4VgG.mp3' },
  { id: 'CMbvLbbccSd611KtwxV3', name: 'Robert', desc: 'Oslo', preview: 'https://storage.googleapis.com/eleven-public-prod/database/workspace/2461cf568dc042a3bbfbf75522203b35/voices/CMbvLbbccSd611KtwxV3/fabf86a6-90db-42c2-9993-47fff3f73a80.mp3' },
  { id: 'vUmLiNBm6MDcy1NUHaVr', name: 'Helge', desc: '', preview: 'https://storage.googleapis.com/eleven-public-prod/database/workspace/3690d7df74c84d8880e0e0d0641de7f2/voices/vUmLiNBm6MDcy1NUHaVr/6JBvRVvXcssLtXlaqLg1.mp3' },
  { id: 'uNsWM1StCcpydKYOjKyu', name: 'Mia', desc: 'Norsk kvinne', preview: 'https://storage.googleapis.com/eleven-public-prod/database/workspace/a2175a4ce5a74c88868dd9d4a000c9a6/voices/uNsWM1StCcpydKYOjKyu/868f87d5-7724-4786-a7fa-a48e01b2ba54.mp3' },
]

interface MusicFile { filename: string; name: string; folder?: string; url: string; size: number }

interface Segment {
  index: number
  text: string
  voiceover: string
  image_url: string
  approved: boolean
  voiceover_url?: string
  image_prompt?: string
  animate?: boolean
  motion?: 'none' | 'move' | 'talk'
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
  const [musicFolder, setMusicFolder] = useState('global')
  // Sluttplakat-farger — leses fra produktprofilen, kan endres direkte her
  const [outroBg, setOutroBg] = useState('#1a1a2e')
  const [outroText, setOutroText] = useState('#ffffff')
  const [colorSaving, setColorSaving] = useState(false)
  const [starting, setStarting] = useState(false)
  const [aiMotion, setAiMotion] = useState(false)
  const [aiMotionEngine, setAiMotionEngine] = useState('pixverse')
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

        // Auto-generate images in background (fire and forget)
        if (data.segments && productId) {
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

        // Hent sluttplakat-fargene fra produktprofilen
        const { data: profile } = await supabase
          .from('product_profiles')
          .select('primary_color, secondary_color')
          .eq('product_id', productId)
          .single()
        if (profile?.primary_color) setOutroBg(profile.primary_color)
        if (profile?.secondary_color) setOutroText(profile.secondary_color)
      } catch (err) {
        console.error('[DraftPage] Asset fetch error:', err)
      }
    }

    fetchAssets()
  }, [productId])

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
    setDraft({ ...draft, voice_id: voiceId })
    try {
      const supabase = getSupabase()
      const { error } = await supabase.from('production_drafts').update({ voice_id: voiceId }).eq('id', draftId)
      if (error) console.error('[updateVoice] save failed:', error)
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

  const previewVoiceover = async (index: number) => {
    if (!draft) return
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

        // Persist R2 URL on the segment so production can reuse the approved file
        const updatedSegments = [...draft.segments]
        updatedSegments[index] = { ...updatedSegments[index], voiceover_url: data.url }
        setDraft({ ...draft, segments: updatedSegments })

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
      alert('Error starting production')
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
          <Link href={`/dashboard/products/${productId}`} className="text-[var(--ember-deep)] hover:text-[#1C1A16] mb-4 inline-block">
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
          <Link href={`/dashboard/products/${productId}`} className="text-[var(--ember-deep)] hover:text-[#1C1A16] mb-4 inline-block">
            {t('backToProduct')}
          </Link>
          <h1 className="text-3xl font-bold text-gray-900">{t('title')}</h1>
          <p className="text-gray-600 mt-2">{t('subtitle')}</p>
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
              <p className="text-xs text-gray-400 mt-1">Brukes på alle nye voiceovers.</p>
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
                <optgroup label="Musikkbibliotek">
                  {sharedMusic(musicLibrary).map((m) => (
                    <option key={m.filename} value={m.filename}>{m.name}</option>
                  ))}
                </optgroup>
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
                    const maxBytes = isRootSharedUpload ? 4 * 1024 * 1024 : TRACK_MAX_BYTES
                    if (!file.name.toLowerCase().endsWith('.mp3')) { alert('Kun MP3-filer.'); el.value = ''; return }
                    if (file.size > maxBytes) { alert(`Filen er for stor (maks ${isRootSharedUpload ? 4 : 15}MB).`); el.value = ''; return }
                    setMusicUploading(true)
                    try {
                      const folder = isRootSharedUpload ? musicFolder : tracksFolder(productId)
                      const fd = new FormData(); fd.append('file', file)
                      const res = await fetch(`/api/music/upload?folder=${encodeURIComponent(folder)}`, { method: 'POST', body: fd })
                      if (res.ok) {
                        const up = await res.json()
                        const data = await fetch('/api/music').then((r) => r.json())
                        if (data.files) setMusicLibrary(data.files)
                        if (up?.file?.filename) updateMusic(up.file.filename) // auto-velg den nye musikken
                      } else {
                        alert('Opplasting feilet.')
                      }
                    } catch (err) {
                      alert('Opplasting feilet: ' + (err instanceof Error ? err.message : 'ukjent feil'))
                    } finally {
                      setMusicUploading(false)
                      el.value = ''
                    }
                  }}
                  className="block flex-1 text-sm text-gray-500 file:mr-2 file:rounded file:border-0 file:bg-[var(--ember-deep)] file:px-2 file:py-1 file:text-xs file:font-medium file:text-white hover:file:bg-[#1C1A16] disabled:opacity-50"
                />
              </div>
              <p className="text-xs text-gray-400 mt-1">{musicUploading ? 'Laster opp musikk…' : (tenantInfo.slug === 'centerforge' ? 'Spilles under hele videoen. Eller last opp egen MP3 (maks 4MB).' : tenantInfo.vertical === 'music' ? 'Spilles under hele videoen. Last opp egne låter (MP3, maks 15MB) — de er kun synlige for dette bandet.' : 'Spilles under hele videoen. Last opp egen MP3 (maks 15MB) — kun synlig for dette produktet.')}</p>
            </div>

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
                  className="block w-full text-sm text-gray-500 file:mr-2 file:rounded file:border-0 file:bg-[var(--ember-deep)] file:px-2 file:py-1 file:text-xs file:font-medium file:text-white hover:file:bg-[#1C1A16] disabled:opacity-50"
                />
              </div>
              <p className="text-xs text-gray-400 mt-1">{jingleUploading ? 'Laster opp jingle…' : 'Spilles på sluttplakaten.'}</p>
            </div>
          </div>

          {/* Sluttplakat-farger — endres direkte her (ingen omvei via produktinnstillinger) */}
          <div className="mt-5 pt-4 border-t border-gray-100">
            <label className="block text-sm font-medium text-gray-700 mb-2">🎨 Sluttplakat-farger</label>
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
              <span
                className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-gray-200"
                style={{ backgroundColor: outroBg, color: outroText }}
              >
                Forhåndsvisning
              </span>
            </div>
            <p className="text-xs text-gray-400 mt-1">{colorSaving ? 'Lagrer…' : 'Lagres automatisk. Brukes på sluttplakaten (video + avatar).'}</p>
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
                <option value="">Ingen — vanlige scenebilder</option>
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
                  // Standardmønster første gang: første + siste segment snakker (lip-sync), resten bevegelse
                  if (on && draft && !draft.segments.some((s) => s.motion)) {
                    const last = draft.segments.length - 1
                    const segs = draft.segments.map((s, i) => ({ ...s, motion: (i === 0 || i === last) ? ('talk' as const) : ('move' as const) }))
                    setDraft({ ...draft, segments: segs })
                    const supabase = getSupabase()
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
                  onChange={(e) => setAiMotionEngine(e.target.value)}
                  className="px-2 py-1 border border-gray-300 rounded-lg text-xs bg-white"
                >
                  <option value="pixverse">PixVerse (rask/billig)</option>
                  <option value="kling">Kling (høyere kvalitet)</option>
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
              <p className="text-sm font-medium text-[#1C1A16]">
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
                        className="w-full h-full object-cover"
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
                      <div className="w-full h-full flex items-center justify-center text-gray-400 text-xs">
                        {t('noImage')}
                      </div>
                    )}
                  </div>
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

                    {/* Voiceover */}
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
                        {voicePreviews[index] ? (
                          <audio controls src={voicePreviews[index]} className="w-full h-8" />
                        ) : null}
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
                      </div>
                    </div>

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
                        ].map((opt) => {
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
                      </div>
                    )}
                    <button
                      onClick={() => toggleApproval(index)}
                      disabled={generatingImages.has(index)}
                      className={`px-4 py-2 rounded-lg font-medium text-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                        segment.approved
                          ? 'bg-green-600 hover:bg-green-700 text-white'
                          : 'bg-[var(--ember-deep)] hover:bg-[#1C1A16] text-white'
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
