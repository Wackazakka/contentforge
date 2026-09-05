'use client'

import { useState, useEffect, useRef } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { useTranslations, useLocale } from 'next-intl'
import { getSupabase } from '@/lib/supabaseClient'
import { useTenant } from '@/lib/tenantContext'
import { fetchMusicLibrary, ownTracks, sharedMusic, tracksFolder, isMedleyFile, type MusicFile } from '@/lib/musicLibrary'
import { FILM_LIBRARY_FOLDER } from '@/lib/filmVoices'
import { uploadTrack, TRACK_UPLOAD_MAX_BYTES } from '@/lib/uploadTrack'
import { filmPricing } from '@/lib/verticals'
import { fillMissingImages, type FilmSeg } from '@/lib/filmImages'
import { defaultTrackFor, trackDisplayName } from '@/lib/filmMusic'
import { personPromptFor, DRAWING_MAX_TRIES } from '@/lib/filmPersonPrompt'

// Den enkle filmflyten (Standard Ropert, Lars 4/9): sang → bilder → tekst →
// film. Ingen segmentredigering, ingen stemmevalg, ingen taxameter. Sangen
// (fra Sangskaper) er lydsporet; tekstlinjer paa skjermen baerer budskapet.
// Alt som ikke er strengt noedvendig for aa faa en film, er holdt utenfor.

const HANKEN = 'var(--font-hanken), sans-serif'
const SERIF = 'var(--font-serif), serif'

type Phase = 'idle' | 'clipping' | 'writing' | 'saving' | 'images' | 'paying' | 'starting'

type Seg = { index: number; text: string; voiceover?: string; image_url: string; image_prompt?: string; no_voice?: boolean; match_music?: boolean; simple_film?: boolean; motion?: string; motion_style?: string; motion_prompt?: string; style_lock?: boolean; hold_seconds?: number; approved?: boolean; own_photo?: boolean; source_photo?: string }

// Nivaa 2 (Lars 5/9): papirklippet settes i bevegelse med Kling — stille
// stop-motion, ikke kamerakjoering, og aldri fotorealisme.
const MOTION_PROMPT = 'Gentle stop-motion animation of a paper-cut collage illustration: paper elements sway slightly, lights flicker softly, leaves and confetti drift, subtle parallax between layers. Camera almost still. Keep the flat paper-cut style exactly — no realism, no people, no text.'

function fmtDuration(sec: number | null): string {
  if (!sec || !isFinite(sec)) return ''
  const m = Math.floor(sec / 60)
  const s = Math.round(sec % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

// Dropleten serverer musikk over http; siden er https, saa nettleseren
// blokkerer direkte avspilling stille (Lars 4/9: «det kommer ingenting»).
// /api/music/[filename] proxyer med Range-stoette.
const musicSrc = (filename: string) => `/api/music/${encodeURIComponent(filename)}`

// Lengden maales i nettleseren foer opplasting — filmen skal bli like lang.
function measureDuration(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    try {
      const url = URL.createObjectURL(file)
      const audio = new Audio()
      const done = (v: number | null) => { URL.revokeObjectURL(url); resolve(v) }
      audio.preload = 'metadata'
      audio.onloadedmetadata = () => done(isFinite(audio.duration) ? audio.duration : null)
      audio.onerror = () => done(null)
      audio.src = url
    } catch { resolve(null) }
  })
}

export default function FilmPage() {
  const params = useParams()
  const router = useRouter()
  const productId = params?.id as string
  const t = useTranslations('film')
  const locale = useLocale() === 'en' ? 'en' : 'no'
  const tenant = useTenant()
  const filmPrice = filmPricing(tenant.vertical)?.customerPriceNok ?? null
  // Hva koster NESTE film? Betalt film → 3 gratis omgjøringer (4/9).
  const [allowance, setAllowance] = useState<{ billing: boolean; nextIsFree: boolean; freeLeft: number; freeRemakes: number; animatedPriceNok?: number | null; blockAnimated?: boolean; animLeft?: number; animQuota?: number } | null>(null)
  // Kvoten er brukt opp: kunden velger «bilder med bevegelse» gratis, eller kjøper ny animert film
  const [quotaStop, setQuotaStop] = useState<{ needed: number; left: number } | null>(null)
  // Nivaa: 'still' = bilder med langsom bevegelse (149), 'animated' = Kling-klipp (249)
  const [tier, setTier] = useState<'still' | 'animated'>('still')
  const animatedPrice = filmPricing(tenant.vertical)?.animated?.customerPriceNok ?? null

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState<string | null>(null)
  // Skjemaet (Lars 4/9): ett svar per felt = én plakat i filmen. Lagres i
  // products.description som lesbare linjer («Når: …»), og parses tilbake.
  const DETAIL_KEYS = ['who', 'when', 'where', 'bring', 'dress', 'extra', 'rsvp', 'greeting'] as const
  type DetailKey = typeof DETAIL_KEYS[number]
  const DETAIL_PREFIX: Record<DetailKey, string> = { who: 'Hvem', when: 'Når', where: 'Hvor', bring: 'Ta med', dress: 'Antrekk', extra: 'Ekstra', rsvp: 'Svar', greeting: 'Hilsen' }
  const [details, setDetails] = useState<Record<DetailKey, string>>({ who: '', when: '', where: '', bring: '', dress: '', extra: '', rsvp: '', greeting: '' })
  const parseDetails = (text: string) => {
    const out: Record<DetailKey, string> = { who: '', when: '', where: '', bring: '', dress: '', extra: '', rsvp: '', greeting: '' }
    const rest: string[] = []
    for (const line of text.split('\n')) {
      const m = /^([^:]{2,12}):\s*(.+)$/.exec(line.trim())
      const key = m ? (Object.keys(DETAIL_PREFIX) as DetailKey[]).find((k) => DETAIL_PREFIX[k].toLowerCase() === m[1].trim().toLowerCase()) : undefined
      if (m && key) out[key] = m[2].trim()
      else if (line.trim()) rest.push(line.trim())
    }
    if (!out.greeting && rest.length) out.greeting = rest.join(' ')
    return out
  }
  const compileDescription = (d: Record<DetailKey, string>) =>
    DETAIL_KEYS.filter((k) => d[k].trim()).map((k) => `${DETAIL_PREFIX[k]}: ${d[k].trim()}`).join('\n')
  const [loaded, setLoaded] = useState(false)

  // Sang
  const [tracks, setTracks] = useState<MusicFile[]>([])
  const [musicFile, setMusicFile] = useState<string | null>(null)
  const [musicDuration, setMusicDuration] = useState<number | null>(null)
  const [uploadingTrack, setUploadingTrack] = useState(false)
  const [trackError, setTrackError] = useState<string | null>(null)
  // Maalt lengde per opplastet fil (state, ikke ref — leses under render)
  const [durationByFile, setDurationByFile] = useState<Record<string, number>>({})
  // Opphavsrett (4/9): kunden bekrefter at sangen er egen (Sangskaper) eller
  // noe de har rett til aa bruke — vi rendrer og deler filmen fra vaar server.
  const [rightsOk, setRightsOk] = useState(false)
  // Filmlengde (4/9): sangen kan vaere 3 minutter, filmen boer vaere 60 s.
  // 'full' = hele sangen; ellers klippes sangen paa dropleten med uttoning.
  const [filmLength, setFilmLength] = useState<'30' | '60' | 'full'>('60')
  const [lengthNote, setLengthNote] = useState<string | null>(null)
  // Rettesteget (Lars 5/9): plakatene vises og redigeres FOER filmen lages.
  const [review, setReview] = useState<{ draftId: string; needsImages: boolean; segments: Seg[]; texts: string[]; extraPrompts: string[]; regen: boolean[] } | null>(null)
  const reviewRef = useRef<HTMLDivElement | null>(null)
  // Uten sang (Lars 5/9: «så enkelt som mulig»): bare musikk fra lista —
  // opplesing og «uten lyd» er tatt bort fra flyten.
  const [library, setLibrary] = useState<MusicFile[]>([])
  const [libraryMusic, setLibraryMusic] = useState<string | null>(null)
  const errorRef = useRef<HTMLDivElement | null>(null)

  // Bilder
  const [photos, setPhotos] = useState<Array<{ url: string; name: string }>>([])
  // Tegning av kunden (Lars 5/9): fotoet som utgangspunkt for en figur i
  // samme stil. Per foto: tegningen, antall forsoek, og om fotoet skal
  // brukes i stedet. Egne bilder vises én gang hver uansett.
  const [photoArt, setPhotoArt] = useState<Record<string, { url: string | null; tries: number; usePhoto: boolean; busy: boolean; error: boolean }>>({})
  const [uploadingPhotos, setUploadingPhotos] = useState(false)
  const [photoError, setPhotoError] = useState<string | null>(null)

  // Produksjon
  const [phase, setPhase] = useState<Phase>('idle')
  const [imageProgress, setImageProgress] = useState<{ done: number; total: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const searchParams = useSearchParams()
  const avbrutt = searchParams?.get('avbrutt') === '1'
  // «Rediger plakatene» (5/9): ?draft=<id> kopierer utkastet og hopper rett
  // til steg 5 — sang, bilder og skjema beholdes fra forrige film.
  const editDraftId = searchParams?.get('draft') || null
  const [editMode, setEditMode] = useState<boolean>(!!editDraftId)
  const [editExtras, setEditExtras] = useState<Seg[]>([])

  const token = async () => (await getSupabase().auth.getSession()).data?.session?.access_token || null

  useEffect(() => {
    if (!productId || !editDraftId) return
    ;(async () => {
      try {
        const tk = await token()
        const res = await fetch('/api/content/produce/simple/clone', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tk || ''}` },
          body: JSON.stringify({ draftId: editDraftId }),
        })
        const d = await res.json().catch(() => null)
        if (!res.ok || !d?.draftId) throw new Error(d?.error || t('failed'))
        const segs: Seg[] = (d.segments || []) as Seg[]
        // Tekstloese segmenter er stemningsbilder — de beholdes, men vises ikke
        const withText = segs.filter((sg) => (sg.text || '').trim())
        const extras = segs.filter((sg) => !(sg.text || '').trim())
        setEditExtras(extras)
        setReview({ draftId: d.draftId, needsImages: false, segments: withText, texts: withText.map((sg) => sg.text), extraPrompts: extras.map((sg) => sg.image_prompt || '').filter(Boolean), regen: withText.map(() => false) })
        setEditMode(true)
        setTimeout(() => reviewRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100)
      } catch (err) {
        setEditMode(false)
        setError(err instanceof Error && err.message ? err.message : t('failed'))
      }
    })()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId, editDraftId])

  useEffect(() => {
    if (!productId) return
    ;(async () => {
      // Kategorien brukes rett etter for standardsporet — state er ikke oppdatert ennaa
      let loadedCategory: string | null = null
      try {
        const { data } = await getSupabase().from('products').select('name, description, category').eq('id', productId).single()
        setTitle((data?.name || '').trim())
        setDescription((data?.description || '').trim())
        setDetails(parseDetails((data?.description || '').trim()))
        setCategory(data?.category || null)
        loadedCategory = data?.category || null
      } catch { /* skjemaet fungerer tomt */ } finally { setLoaded(true) }
      try {
        const lib = await fetchMusicLibrary()
        // Klipp (klipp-30-…) er avledet av originalen og skal ikke velges selv
        // (4/9: klipp av et klipp → ffmpeg «Output same as Input»)
        const mine = ownTracks(lib.files, productId).filter((f) => !isMedleyFile(f.filename) && !/^klipp-\d+-/.test(f.filename.split('/').pop() || ''))
        setTracks(mine)
        // Nyeste sang forhaandsvelges — den de nettopp lastet opp er den de vil ha
        if (mine.length > 0) setMusicFile(mine[mine.length - 1].filename)
        // Delt bibliotek for anledningsfilmer (ReelHome-sporene inntil videre)
        const shared = sharedMusic(lib.files)
        const felles = shared.filter((f) => f.folder === FILM_LIBRARY_FOLDER)
        const bib = felles.length > 0 ? felles : shared
        setLibrary(bib)
        // Standardspor etter anledningstypen (Lars 5/9)
        if (bib.length > 0) setLibraryMusic(defaultTrackFor(loadedCategory, bib))
      } catch { /* biblioteket er valgfritt */ }
      try {
        const tk = await token()
        const a = await fetch(`/api/film-checkout?productId=${productId}`, tk ? { headers: { Authorization: `Bearer ${tk}` } } : undefined).then((r) => r.json())
        if (a && typeof a.nextIsFree === 'boolean') setAllowance(a)
      } catch { /* prislinja faller tilbake til standard */ }
      try {
        const tk = await token()
        const d = await fetch(`/api/products/images?productId=${productId}`, tk ? { headers: { Authorization: `Bearer ${tk}` } } : undefined).then((r) => r.json())
        if (Array.isArray(d.images)) setPhotos(d.images)
      } catch { /* valgfritt */ }
    })()
  }, [productId])

  const onTrackChosen = async (file: File) => {
    setTrackError(null)
    if (!/\.mp3$/i.test(file.name) && file.type !== 'audio/mpeg') { setTrackError(t('onlyMp3')); return }
    if (file.size > TRACK_UPLOAD_MAX_BYTES) { setTrackError(t('tooLarge')); return }
    setUploadingTrack(true)
    try {
      const dur = await measureDuration(file)
      const up = await uploadTrack(file, tracksFolder(productId))
      if (dur) setDurationByFile((prev) => ({ ...prev, [up.filename]: dur }))
      setTracks((prev) => [...prev.filter((p) => p.filename !== up.filename), up])
      setMusicFile(up.filename)
      setMusicDuration(dur)
    } catch (err) {
      setTrackError(err instanceof Error && err.message ? err.message : t('uploadFailed'))
    } finally {
      setUploadingTrack(false)
    }
  }

  const onPhotosChosen = async (files: File[]) => {
    setPhotoError(null)
    setUploadingPhotos(true)
    try {
      const tk = await token()
      for (const f of files) {
        if (f.size > 8 * 1024 * 1024) { setPhotoError(t('photoTooLarge', { name: f.name })); continue }
        const fd = new FormData()
        fd.append('file', f)
        fd.append('productId', productId)
        const res = await fetch('/api/products/images', { method: 'POST', headers: tk ? { Authorization: `Bearer ${tk}` } : undefined, body: fd })
        const d = await res.json().catch(() => null)
        if (!res.ok) { setPhotoError(d?.error || t('uploadFailed')); continue }
        if (d?.url) setPhotos((prev) => [...prev, { url: d.url, name: d.name || f.name }])
      }
    } finally {
      setUploadingPhotos(false)
    }
  }

  const removePhoto = async (name: string) => {
    try {
      const tk = await token()
      await fetch(`/api/products/images?productId=${productId}&name=${encodeURIComponent(name)}`, { method: 'DELETE', headers: tk ? { Authorization: `Bearer ${tk}` } : undefined })
    } catch { /* la den staa */ }
    setPhotos((prev) => prev.filter((p) => p.name !== name))
  }

  const rightsRef = useRef<HTMLLabelElement | null>(null)
  const writePosters = async () => {
    if (phase !== 'idle') return
    setError(null); setReview(null)
    if (!title.trim()) { setError(t('needTitle')); return }
    // Har kunden valgt en sang, maa retten bekreftes foer noe lages —
    // men bytting av sang skal alltid vaere mulig (Lars 5/9)
    if (musicFile && !rightsOk) {
      setError(t('rightsFirst'))
      setTimeout(() => rightsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50)
      return
    }
    try {
      // Lagre skjemaet paa anledningen (som lesbare linjer)
      const compiled = compileDescription(details) || description.trim()
      try {
        await getSupabase().from('products').update({ name: title.trim(), description: compiled }).eq('id', productId)
      } catch { /* ikke kritisk */ }

      const tk = await token()
      if (!tk) throw new Error(t('mustSignIn'))
      let useMusic = musicFile
      let dur = musicFile ? (musicDuration ?? durationByFile[musicFile] ?? null) : null
      // Biblioteksmusikk (5/9): lengdevalget gjelder ogsaa der — klippet
      // legges i produktets egen mappe og sendes som libraryMusic.
      let useLibrary = !musicFile ? libraryMusic : null
      const musicSource = musicFile || useLibrary
      // Kortere film enn sangen: klipp sangen foerst (dropleten lager en fil
      // med uttoning; «film = musikkens lengde» gir da riktig lengde)
      if (musicSource && filmLength !== 'full') {
        // Hver plakat trenger ~3 s + et bilde imellom: mange svar i skjemaet
        // krever lengre film enn valgt. Forleng bare med det som trengs (til
        // naermeste 5 s), innenfor sangen — ikke til neste 30 s (Lars 5/9).
        const filled = DETAIL_KEYS.filter((k) => details[k].trim()).length + 2
        const needed = filled * 5
        let wanted = Math.max(Number(filmLength), needed)
        if (dur !== null) wanted = Math.min(wanted, Math.floor(dur))
        if (wanted > Number(filmLength)) setLengthNote(t('lengthExtended', { seconds: wanted }))
        if (dur === null || dur > wanted + 5) {
          setPhase('clipping')
          const cr = await fetch('/api/music/clip', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tk}` },
            body: JSON.stringify({ productId, filename: musicSource, clipSec: wanted, startSec: 0 }),
          })
          const cd = await cr.json().catch(() => null)
          if (!cr.ok || !cd?.file?.filename) throw new Error(cd?.error || t('failed'))
          if (musicFile) useMusic = cd.file.filename
          else useLibrary = cd.file.filename
          dur = cd.clipSec
        }
      }
      setPhase('writing')
      const res = await fetch('/api/content/produce/simple', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tk}` },
        body: JSON.stringify({
          productId,
          title: title.trim(),
          description: compiled,
          details,
          musicFile: useMusic,
          musicDurationSec: dur,
          photos: photos.map((p) => p.url),
          locale,
          voiceId: null,
          libraryMusic: useLibrary,
        }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok || !data?.draftId) {
        // Ta med statuskoden: et HTML-svar (502 fra Netlify) gir ingen JSON,
        // og da er koden det eneste sporet vi har (Lars 4/9: «ingenting skjer»).
        console.error('[film] produce/simple feilet', res.status, data)
        throw new Error(`${data?.error || t('failed')} (${res.status})`)
      }
      const segs: Seg[] = data.segments || []
      setReview({ draftId: data.draftId, needsImages: !!data.needsImages, segments: segs, texts: segs.map((sg) => sg.text), extraPrompts: Array.isArray(data.extraPrompts) ? data.extraPrompts : [], regen: segs.map(() => false) })
      setPhase('idle')
      setTimeout(() => reviewRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50)
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : t('failed'))
      setPhase('idle')
      setTimeout(() => errorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50)
    }
  }

  const makeDrawing = async (photoUrl: string) => {
    if (!review) return
    const cur = photoArt[photoUrl] || { url: null, tries: 0, usePhoto: false, busy: false, error: false }
    if (cur.busy || cur.tries >= DRAWING_MAX_TRIES) return
    setPhotoArt((prev) => ({ ...prev, [photoUrl]: { ...cur, busy: true, error: false } }))
    try {
      const r = await fetch('/api/content/generate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic: personPromptFor(category), productId, imageSize: '1024x1536', imageStyle: 'papercut', draftId: review.draftId, referenceImageUrl: photoUrl }),
        signal: AbortSignal.timeout(58000),
      })
      const d = await r.json().catch(() => null)
      if (!r.ok || !d?.imageUrl) throw new Error(d?.error || 'failed')
      setPhotoArt((prev) => ({ ...prev, [photoUrl]: { url: d.imageUrl, tries: cur.tries + 1, usePhoto: false, busy: false, error: false } }))
    } catch {
      setPhotoArt((prev) => ({ ...prev, [photoUrl]: { ...cur, tries: cur.tries + 1, busy: false, error: true } }))
    }
  }

  const renderFilm = async (opts?: { forcePay?: boolean }) => {
    if (phase !== 'idle' || !review) return
    setError(null); setQuotaStop(null)
    const texts = review.texts.map((x) => x.trim()).filter(Boolean)
    if (texts.length < 2) { setError(t('needPosters')); return }
    try {
      const tk = await token()
      if (!tk) throw new Error(t('mustSignIn'))
      const draftId = review.draftId
      // Bygg segmentene paa nytt fra de redigerte plakatene. Bilder fordeles
      // paa nytt; en redigert tekst faar talelinjen erstattet av teksten.
      setPhase('saving')
      // Redigeringsmodus (5/9): tekstendringer koster ingenting — bildet (og
      // dermed animasjonsklippet) beholdes med mindre kunden ba om nytt bilde.
      const keptIdx: number[] = []
      review.texts.forEach((x, i) => { if (x.trim()) keptIdx.push(i) })
      let segments: Seg[] = texts.map((text, k) => {
        const srcIdx = keptIdx[k]
        const base = review.segments[srcIdx] || ({} as Seg)
        const wantNew = !!review.regen[srcIdx] || !base.image_url
        const sameText = (base.text || '').trim() === text
        const keepImage = editMode ? !wantNew : (sameText && !wantNew)
        return {
          ...base,
          index: k,
          text,
          voiceover: base.voiceover ? (sameText ? base.voiceover : text) : '',
          image_url: keepImage ? (base.image_url || '') : '',
          image_prompt: keepImage ? (base.image_prompt || '') : '',
          clip_nonce: keepImage ? (base as Seg & { clip_nonce?: string }).clip_nonce : undefined,
          approved: true,
          simple_film: true,
        } as Seg
      })
      // Egne bilder (Lars 5/9: «ett foto ble brukt seks ganger»): én scene uten
      // tekst per bilde — fotoet slik det er, eller tegningen kunden godkjente.
      // Legges tidlig (etter aapningen og «hvem») saa personen kommer foerst.
      // I redigeringsmodus beholdes forrige films bildescener uendret.
      const photoSegs: Seg[] = editMode
        ? editExtras.filter((e) => e.source_photo)
        : photos.map((p) => {
          const art = photoArt[p.url]
          const useArt = !!art?.url && !art.usePhoto
          return { index: 0, text: '', voiceover: '', image_url: useArt ? String(art?.url) : p.url, image_prompt: '', no_voice: true, match_music: !!musicFile, simple_film: true, approved: true, own_photo: !useArt, source_photo: p.url } as Seg
        })
      segments.splice(Math.min(2, segments.length), 0, ...photoSegs)
      // Stemningsbilder uten tekst (5/9): ekstra scener som bare gir bilder til
      // renderen, saa ingen bilder gjentas.
      review.extraPrompts.forEach((pr) => {
        const prev = editExtras.find((e) => e.image_prompt === pr)
        segments.push({ index: segments.length, text: '', voiceover: '', image_url: prev?.image_url || '', image_prompt: pr, no_voice: true, match_music: prev?.match_music ?? !!musicFile, simple_film: true, approved: true } as Seg)
      })
      segments = segments.map((sg, i) => ({ ...sg, index: i }))
      // Animert nivaa: hvert bilde faar et bevegelsesklipp (kling), 4 s hviletid
      // saa hvert klipp er ETT 5-sekunders Kling-kall
      const animert = tier === 'animated' && !!animatedPrice
      if (animert) {
        segments = segments.map((sg) => (sg.own_photo ? sg : { ...sg, motion: 'move', motion_style: 'custom', motion_prompt: MOTION_PROMPT, style_lock: true, hold_seconds: 4 }))
      }
      const { error: saveErr } = await getSupabase().from('production_drafts').update({ segments, ai_motion: animert, ai_motion_engine: animert ? 'kling' : null }).eq('id', draftId)
      if (saveErr) throw new Error(saveErr.message)

      // Fastpris (149 kr): Stripe foer produksjonen. Serveren svarer
      // {free:true} naar billing er av — da startes produksjonen direkte.
      setPhase('paying')
      const payRes = await fetch('/api/film-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tk}` },
        body: JSON.stringify({ draftId, forcePay: !!opts?.forcePay }),
      })
      const pay = await payRes.json().catch(() => null)
      if (payRes.status === 409 && pay?.code === 'ANIM_QUOTA') {
        setQuotaStop({ needed: Number(pay.needed) || 0, left: Number(pay.left) || 0 })
        setPhase('idle')
        setTimeout(() => reviewRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50)
        return
      }
      if (!payRes.ok) throw new Error(pay?.error || t('failed'))
      if (pay?.url) { window.location.href = pay.url; return }

      // Bildene lages ETTER betalingen (Lars 5/9) — gratis omgjoering lager dem her
      if (segments.some((sg) => !sg.image_url)) {
        setPhase('images')
        try {
          segments = await fillMissingImages({
            draftId, productId, title,
            segments: segments as FilmSeg[],
            onProgress: (done, total) => setImageProgress({ done, total }),
          }) as Seg[]
        } catch (e) {
          throw new Error(e instanceof Error && e.message === 'IMAGES_FAILED' ? t('imagesFailed') : (e instanceof Error ? e.message : t('failed')))
        }
      }

      setPhase('starting')
      const startRes = await fetch('/api/start-production', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ draftId, imageStyle: 'papercut', includeOutroCard: false, aiMotion: animert, aiMotionEngine: 'kling' }),
      })
      const started = await startRes.json().catch(() => null)
      if (!startRes.ok || !started?.jobId) throw new Error(started?.error || t('failed'))
      window.location.href = `/dashboard/products/${productId}/video/status/${started.jobId}?format=9%3A16&simple=1`
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : t('failed'))
      setPhase('idle')
      setImageProgress(null)
      setTimeout(() => errorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50)
    }
  }

  const busy = phase !== 'idle'
  const chosenTrack = tracks.find((tr) => tr.filename === musicFile) || null
  const chosenDuration = musicFile ? (musicDuration ?? durationByFile[musicFile] ?? null) : null

  const card: React.CSSProperties = { background: 'var(--paper-raised)', border: '1px solid var(--ds-border)', borderRadius: 18, padding: 26, marginBottom: 18 }
  const stepNo: React.CSSProperties = { width: 30, height: 30, borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontFamily: HANKEN, fontWeight: 700, fontSize: 14, color: 'var(--ember-deep)', background: 'var(--ember-tint-bg)', border: '1px solid var(--ember-tint-border)', marginRight: 12, flex: 'none' }
  const h2: React.CSSProperties = { fontFamily: HANKEN, fontWeight: 700, fontSize: 20, color: 'var(--ink)', margin: 0, display: 'flex', alignItems: 'center' }
  const hint: React.CSSProperties = { fontFamily: HANKEN, fontSize: 14.5, lineHeight: 1.55, color: 'var(--text-muted)', margin: '8px 0 16px' }
  const bigBtn: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 8, fontFamily: HANKEN, fontWeight: 700, fontSize: 16, color: 'var(--on-ember)', background: 'var(--ember-deep)', border: 'none', borderRadius: 999, padding: '14px 26px', cursor: 'pointer' }
  const smallGhost: React.CSSProperties = { fontFamily: HANKEN, fontSize: 14, color: 'var(--text-muted)', background: 'transparent', border: '1.5px solid var(--ds-border)', borderRadius: 999, width: 34, height: 34, cursor: 'pointer', flex: 'none' }
  const ghostBtn: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 8, fontFamily: HANKEN, fontWeight: 600, fontSize: 15, color: 'var(--ink)', background: 'transparent', border: '1.5px solid var(--ds-border)', borderRadius: 999, padding: '12px 22px', cursor: 'pointer' }

  return (
    <div className="min-h-screen bg-[var(--paper)]">
      <div className="max-w-2xl mx-auto px-4 py-8">
        <Link href={`/dashboard/products/${productId}`} style={{ fontFamily: HANKEN, fontSize: 14.5, color: 'var(--ember-deep)', textDecoration: 'none' }}>
          {t('back')}
        </Link>
        <h1 style={{ fontFamily: SERIF, fontWeight: 400, fontSize: 'clamp(32px,4vw,42px)', lineHeight: 1.05, color: 'var(--ink)', margin: '14px 0 8px' }}>{t('title')}</h1>
        <p style={{ ...hint, margin: '0 0 26px', fontSize: 16 }}>{t('subtitle', { name: tenant.app_name })}</p>

        {avbrutt && !error && (
          <div style={{ background: 'var(--ember-tint-bg)', border: '1px solid var(--ember-tint-border)', color: 'var(--ink)', borderRadius: 12, padding: '12px 16px', fontFamily: HANKEN, fontSize: 14.5, marginBottom: 18 }}>{t('paymentCancelled')}</div>
        )}
        {editMode && (
          <section style={{ ...card, background: 'var(--ember-tint-bg)', borderColor: 'var(--ember-tint-border)' }}>
            <p style={{ fontFamily: HANKEN, fontWeight: 700, fontSize: 16, color: 'var(--ink)', margin: '0 0 6px' }}>{t('editModeTitle')}</p>
            <p style={{ ...hint, margin: 0 }}>{t('editModeHint')}</p>
            <button type="button" onClick={() => { setEditMode(false); setReview(null); router.replace(`/dashboard/products/${productId}/film`) }} disabled={busy} style={{ ...ghostBtn, marginTop: 12, padding: '10px 18px', fontSize: 14.5 }}>{t('editModeStartOver')}</button>
          </section>
        )}
        {!editMode && (<>
        {/* 1 · Sangen */}
        <section style={card}>
          <h2 style={h2}><span style={stepNo}>1</span>{t('step1Title')}</h2>
          <p style={hint}>{t('step1Hint')}</p>
          {chosenTrack ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', background: 'var(--ember-tint-bg)', border: '1px solid var(--ember-tint-border)', borderRadius: 12, padding: '12px 16px', marginBottom: 12 }}>
              <span style={{ fontSize: 22 }} aria-hidden="true">🎵</span>
              <div style={{ flex: 1, minWidth: 160 }}>
                <div style={{ fontFamily: HANKEN, fontWeight: 600, fontSize: 15, color: 'var(--ink)' }}>{chosenTrack.name}</div>
                <div style={{ fontFamily: HANKEN, fontSize: 13, color: 'var(--text-muted)' }}>
                  {filmLength !== 'full' && chosenDuration && chosenDuration > Number(filmLength) + 5
                    ? t('filmLengthClipped', { length: fmtDuration(Number(filmLength)), song: fmtDuration(chosenDuration) })
                    : chosenDuration ? t('filmLength', { length: fmtDuration(chosenDuration) }) : t('filmLengthUnknown')}
                </div>
              </div>
              <audio controls preload="none" src={musicSrc(chosenTrack.filename)} style={{ height: 34, maxWidth: 220 }} />
            </div>
          ) : null}
          {(chosenTrack || libraryMusic) && (
            <div style={{ marginBottom: 14, marginTop: chosenTrack ? 0 : 14 }}>
              <p style={{ fontFamily: HANKEN, fontSize: 14, fontWeight: 600, color: 'var(--ink-soft)', margin: '0 0 8px' }}>{t('lengthLabel')}</p>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {([['30', t('length30')], ['60', t('length60')], ['full', t('lengthFull')]] as const).map(([v, label]) => (
                  <button key={v} type="button" disabled={busy} onClick={() => setFilmLength(v)}
                    style={{ fontFamily: HANKEN, fontWeight: 600, fontSize: 14.5, borderRadius: 999, padding: '9px 16px', cursor: 'pointer', color: filmLength === v ? 'var(--on-ember)' : 'var(--ink)', background: filmLength === v ? 'var(--ember-deep)' : 'transparent', border: filmLength === v ? '1.5px solid var(--ember-deep)' : '1.5px solid var(--ds-border)' }}>
                    {label}
                  </button>
                ))}
              </div>
              <p style={{ ...hint, margin: '8px 0 0', fontSize: 13.5 }}>{t('lengthHint')}</p>
            </div>
          )}
          {tracks.length > 1 && (
            <select value={musicFile || ''} onChange={(e) => { setMusicFile(e.target.value || null); setMusicDuration(null) }} disabled={busy} className="cf-input" style={{ marginBottom: 12 }}>
              {tracks.map((tr) => <option key={tr.filename} value={tr.filename}>{tr.name}</option>)}
            </select>
          )}
          <label ref={rightsRef} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, fontFamily: HANKEN, fontSize: 14.5, lineHeight: 1.5, color: 'var(--ink)', marginBottom: 14, cursor: 'pointer' }}>
            <input type="checkbox" checked={rightsOk} onChange={(e) => setRightsOk(e.target.checked)} disabled={busy} style={{ marginTop: 4, width: 18, height: 18 }} />
            <span>{t('rightsLabel')}</span>
          </label>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <label style={{ ...(chosenTrack ? ghostBtn : bigBtn), opacity: uploadingTrack || busy ? 0.6 : 1 }}>
              {uploadingTrack ? t('uploading') : chosenTrack ? t('changeSong') : t('uploadSong')}
              <input type="file" accept=".mp3,audio/mpeg" className="hidden" disabled={uploadingTrack || busy} onChange={(e) => { const f = e.currentTarget.files?.[0]; e.currentTarget.value = ''; if (f) onTrackChosen(f) }} />
            </label>
            {chosenTrack && (
              <button type="button" onClick={() => { setMusicFile(null); setMusicDuration(null) }} disabled={busy} style={{ ...ghostBtn, border: 'none', color: 'var(--text-muted)' }}>{t('noSong')}</button>
            )}
          </div>
          {trackError && <p style={{ fontFamily: HANKEN, fontSize: 14, color: 'var(--ember-deep)', margin: '10px 0 0' }}>{trackError}</p>}

          {!chosenTrack && (
            <div style={{ marginTop: 22, paddingTop: 18, borderTop: '1px solid var(--ds-border-faint)' }}>
              <p style={{ fontFamily: HANKEN, fontWeight: 600, fontSize: 15, color: 'var(--ink)', margin: '0 0 10px' }}>{t('noSongTitle')}</p>
              <div>
                  {library.length === 0 ? (
                    <p style={{ ...hint, margin: 0, fontSize: 13.5 }}>{t('noLibrary')}</p>
                  ) : (
                    <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                      <select value={libraryMusic || ''} onChange={(e) => setLibraryMusic(e.target.value || null)} disabled={busy} className="cf-input" style={{ flex: 1, minWidth: 180, marginBottom: 0 }}>
                        {library.map((m) => <option key={m.filename} value={m.filename}>{trackDisplayName(m.filename, m.name)}</option>)}
                      </select>
                      {libraryMusic && <audio key={libraryMusic} controls preload="none" src={musicSrc(libraryMusic)} style={{ height: 34, maxWidth: 220 }} />}
                    </div>
                  )}
              </div>
            </div>
          )}
        </section>

        {/* 2 · Bildene */}
        <section style={card}>
          <h2 style={h2}><span style={stepNo}>2</span>{t('step2Title')}</h2>
          <p style={hint}>{t('step2Hint')}</p>
          {photos.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(96px, 1fr))', gap: 10, marginBottom: 14 }}>
              {photos.map((p) => (
                <div key={p.url} style={{ position: 'relative', aspectRatio: '1/1', borderRadius: 10, overflow: 'hidden', border: '1px solid var(--ds-border)' }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  <button type="button" onClick={() => removePhoto(p.name)} disabled={busy} title={t('removePhoto')} style={{ position: 'absolute', top: 4, right: 4, width: 24, height: 24, borderRadius: '50%', border: 'none', background: 'rgba(0,0,0,0.6)', color: '#fff', fontSize: 13, cursor: 'pointer' }}>✕</button>
                </div>
              ))}
            </div>
          )}
          <label style={{ ...(photos.length ? ghostBtn : bigBtn), opacity: uploadingPhotos || busy ? 0.6 : 1 }}>
            {uploadingPhotos ? t('uploading') : photos.length ? t('morePhotos') : t('addPhotos')}
            <input type="file" accept="image/png,image/jpeg,image/webp" multiple className="hidden" disabled={uploadingPhotos || busy} onChange={(e) => { const fs = Array.from(e.currentTarget.files || []); e.currentTarget.value = ''; if (fs.length) onPhotosChosen(fs) }} />
          </label>
          {photos.length === 0 && <p style={{ ...hint, margin: '12px 0 0', fontSize: 13.5 }}>{t('noPhotosHint')}</p>}
          {photoError && <p style={{ fontFamily: HANKEN, fontSize: 14, color: 'var(--ember-deep)', margin: '10px 0 0' }}>{photoError}</p>}
        </section>

        {/* 3 · Teksten */}
        <section style={card}>
          <h2 style={h2}><span style={stepNo}>3</span>{t('step3Title')}</h2>
          <p style={hint}>{t('step3Hint')}</p>
          <label style={{ display: 'block', fontFamily: HANKEN, fontSize: 14, fontWeight: 600, color: 'var(--ink-soft)', marginBottom: 8 }}>{t('titleLabel')}</label>
          <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} disabled={busy || !loaded} className="cf-input" placeholder={t('titlePlaceholder')} style={{ marginBottom: 16 }} />
          <p style={{ ...hint, margin: '0 0 12px' }}>{t('formHint')}</p>
          {DETAIL_KEYS.map((k) => (
            <div key={k} style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', fontFamily: HANKEN, fontSize: 14, fontWeight: 600, color: 'var(--ink-soft)', marginBottom: 6 }}>{t(`field_${k}`)}</label>
              {k === 'greeting' || k === 'extra' ? (
                <textarea value={details[k]} onChange={(e) => setDetails((d) => ({ ...d, [k]: e.target.value }))} disabled={busy || !loaded} className="cf-input" rows={2} placeholder={t(`field_${k}_ph`)} style={{ resize: 'vertical' }} />
              ) : (
                <input type="text" value={details[k]} onChange={(e) => setDetails((d) => ({ ...d, [k]: e.target.value }))} disabled={busy || !loaded} className="cf-input" placeholder={t(`field_${k}_ph`)} />
              )}
            </div>
          ))}
        </section>

        {/* 4 · Lag filmen */}
        <section style={{ ...card, textAlign: 'center' }}>
          <h2 style={{ ...h2, justifyContent: 'center' }}><span style={stepNo}>4</span>{t('step4Title')}</h2>
          <p style={hint}>{chosenTrack ? t('step4Hint') : t('step4HintMusic')}</p>
          <p style={{ ...hint, fontSize: 15, fontWeight: 600, color: 'var(--ink)' }}>
            {allowance && !allowance.billing
              ? t('priceFreePeriod')
              : allowance?.nextIsFree
                ? t('priceRemake', { left: allowance.freeLeft })
                : t('priceLine', { price: filmPrice ?? 149, remakes: allowance?.freeRemakes ?? 3 })}
          </p>
          {error && (
            <div ref={errorRef} style={{ background: '#FDECEC', border: '1px solid #F5C2C2', color: '#8A1C1C', borderRadius: 12, padding: '12px 16px', fontFamily: HANKEN, fontSize: 14.5, margin: '0 0 16px', textAlign: 'left' }}>{error}</div>
          )}
          {busy ? (
            <div style={{ fontFamily: HANKEN, fontSize: 15.5, color: 'var(--ink)' }}>
              <div className="cf-spinner" style={{ margin: '0 auto 12px' }} />
              {phase === 'clipping' && t('phaseClipping')}
              {lengthNote && <p style={{ ...hint, margin: '8px 0 0', fontSize: 13.5 }}>{lengthNote}</p>}
              {phase === 'writing' && t('phaseWriting')}
              {phase === 'saving' && t('phaseSaving')}
              {phase === 'images' && t('phaseImages', { done: imageProgress?.done ?? 0, total: imageProgress?.total ?? 0 })}
              {phase === 'paying' && t('phasePaying')}
              {phase === 'starting' && t('phaseStarting')}
              <p style={{ ...hint, margin: '10px 0 0', fontSize: 13.5 }}>{t('stayOnPage')}</p>
            </div>
          ) : (
            <>
              <button type="button" onClick={writePosters} disabled={!loaded || (!!musicFile && !rightsOk)} title={musicFile && !rightsOk ? t('rightsFirst') : undefined}
                style={{ ...bigBtn, fontSize: 18, padding: '16px 34px', opacity: !loaded || (!!musicFile && !rightsOk) ? 0.45 : 1, cursor: musicFile && !rightsOk ? 'not-allowed' : 'pointer' }}>
                {review ? t('rewritePosters') : t('writePosters')}
              </button>
              {musicFile && !rightsOk && <p style={{ ...hint, margin: '10px 0 0', fontSize: 13.5 }}>{t('rightsFirst')}</p>}
            </>
          )}
        </section>

        </>)}

        {review && (
          <section ref={reviewRef} style={card}>
            <h2 style={h2}><span style={stepNo}>5</span>{t('reviewTitle')}</h2>
            <p style={hint}>{editMode ? t('reviewHintEdit') : t('reviewHint')}</p>
            {review.texts.map((tx, i) => (
              <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10 }}>
                <span style={{ fontFamily: HANKEN, fontSize: 13, color: 'var(--text-faint)', width: 22, textAlign: 'right', flex: 'none' }}>{i + 1}</span>
                <input type="text" value={tx} maxLength={80} disabled={busy}
                  onChange={(e) => setReview((r) => r ? { ...r, texts: r.texts.map((x, j) => (j === i ? e.target.value : x)) } : r)}
                  className="cf-input" style={{ marginBottom: 0, flex: 1 }} />
                {editMode && (
                  <button type="button" disabled={busy} title={t('newImage')}
                    onClick={() => setReview((r) => r ? { ...r, regen: r.regen.map((x, j) => (j === i ? !x : x)) } : r)}
                    style={{ ...smallGhost, width: 'auto', padding: '0 10px', fontSize: 13, color: review.regen[i] ? 'var(--ember-deep)' : 'var(--text-muted)', borderColor: review.regen[i] ? 'var(--ember-deep)' : 'var(--ds-border)' }}>{review.regen[i] ? t('newImageOn') : t('newImage')}</button>
                )}
                <button type="button" disabled={busy} title={t('removePoster')}
                  onClick={() => setReview((r) => r ? { ...r, texts: r.texts.filter((_, j) => j !== i), regen: r.regen.filter((_, j) => j !== i), segments: r.segments.filter((_, j) => j !== i) } : r)}
                  style={{ ...smallGhost }}>✕</button>
              </div>
            ))}
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginTop: 6 }}>
              <button type="button" disabled={busy || review.texts.length >= 16}
                onClick={() => setReview((r) => r ? { ...r, texts: [...r.texts, ''], regen: [...r.regen, true], segments: [...r.segments, { index: r.segments.length, text: '', image_url: '' } as Seg] } : r)}
                style={{ ...ghostBtn, padding: '10px 18px', fontSize: 14.5 }}>{t('addPoster')}</button>
              <span style={{ ...hint, margin: 0, fontSize: 13.5 }}>{t('posterCount', { count: review.texts.filter((x) => x.trim()).length })}</span>
            </div>
            {!editMode && photos.length > 0 && (
              <div style={{ marginTop: 22 }}>
                <p style={{ fontFamily: HANKEN, fontSize: 14, fontWeight: 600, color: 'var(--ink-soft)', margin: '0 0 4px' }}>{t('ownPhotosTitle')}</p>
                <p style={{ ...hint, margin: '0 0 12px', fontSize: 13.5 }}>{t('ownPhotosHint')}</p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 12 }}>
                  {photos.map((p) => {
                    const art = photoArt[p.url]
                    const left = DRAWING_MAX_TRIES - (art?.tries || 0)
                    const usingArt = !!art?.url && !art.usePhoto
                    return (
                      <div key={p.url} style={{ border: '1.5px solid var(--ds-border)', borderRadius: 12, padding: 10, background: 'var(--paper)' }}>
                        <div style={{ display: 'flex', gap: 8 }}>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={p.url} alt="" style={{ width: 90, height: 120, objectFit: 'cover', borderRadius: 8, border: usingArt ? '1px solid var(--ds-border)' : '2px solid var(--ember-deep)' }} />
                          {art?.url && (
                            /* eslint-disable-next-line @next/next/no-img-element */
                            <img src={art.url} alt="" style={{ width: 90, height: 120, objectFit: 'cover', borderRadius: 8, border: usingArt ? '2px solid var(--ember-deep)' : '1px solid var(--ds-border)' }} />
                          )}
                          {art?.busy && <div className="cf-spinner" style={{ margin: 'auto' }} />}
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 10 }}>
                          {!art?.url && !art?.busy && left > 0 && (
                            <button type="button" disabled={busy} onClick={() => makeDrawing(p.url)} style={{ ...ghostBtn, padding: '8px 14px', fontSize: 13.5, justifyContent: 'center' }}>{t('makeDrawing')}</button>
                          )}
                          {art?.busy && <span style={{ ...hint, margin: 0, fontSize: 13 }}>{t('drawingBusy')}</span>}
                          {art?.error && !art.busy && <span style={{ fontFamily: HANKEN, fontSize: 13, color: 'var(--ember-deep)' }}>{t('drawingFailed')}</span>}
                          {art?.url && !art.busy && (
                            <>
                              <button type="button" disabled={busy} onClick={() => setPhotoArt((prev) => ({ ...prev, [p.url]: { ...prev[p.url], usePhoto: !prev[p.url].usePhoto } }))} style={{ ...ghostBtn, padding: '8px 14px', fontSize: 13.5, justifyContent: 'center' }}>{usingArt ? t('usePhoto') : t('useDrawing')}</button>
                              {left > 0 && <button type="button" disabled={busy} onClick={() => makeDrawing(p.url)} style={{ fontFamily: HANKEN, fontSize: 13, color: 'var(--text-muted)', background: 'transparent', border: 'none', cursor: 'pointer', padding: 0 }}>{t('drawingRetry', { left })}</button>}
                              <span style={{ ...hint, margin: 0, fontSize: 12.5 }}>{usingArt ? t('drawingUsed') : t('photoUsed')}</span>
                            </>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
            {animatedPrice && (
              <div style={{ marginTop: 22 }}>
                <p style={{ fontFamily: HANKEN, fontSize: 14, fontWeight: 600, color: 'var(--ink-soft)', margin: '0 0 8px' }}>{t('tierLabel')}</p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
                  {([
                    { key: 'still', label: t('tierStill'), desc: t('tierStillDesc'), price: filmPrice ?? 149 },
                    { key: 'animated', label: t('tierAnimated'), desc: t('tierAnimatedDesc'), price: animatedPrice },
                  ] as const).map((o) => (
                    <button key={o.key} type="button" disabled={busy} onClick={() => setTier(o.key)}
                      style={{ textAlign: 'left', fontFamily: HANKEN, borderRadius: 12, padding: '12px 14px', cursor: 'pointer', background: tier === o.key ? 'var(--ember-tint-bg)' : 'var(--paper)', border: tier === o.key ? '2px solid var(--ember-deep)' : '1.5px solid var(--ds-border)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                        <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--ink)' }}>{o.label}</span>
                        <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--ember-deep)' }}>{allowance && !allowance.billing ? '' : allowance?.nextIsFree ? t('tierFree') : `${o.price} kr`}</span>
                      </div>
                      <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 2 }}>{o.desc}</div>
                    </button>
                  ))}
                </div>
              </div>
            )}
            {tier === 'animated' && allowance?.billing && allowance.nextIsFree && (
              <p style={{ ...hint, margin: '12px 0 0', fontSize: 13.5 }}>
                {allowance.blockAnimated
                  ? t('animQuotaInfo', { needed: editMode ? review.regen.filter(Boolean).length : review.texts.filter((x) => x.trim()).length, left: allowance.animLeft ?? 0 })
                  : t('animQuotaNone')}
              </p>
            )}
            {quotaStop && (
              <div style={{ background: 'var(--ember-tint-bg)', border: '1px solid var(--ember-tint-border)', borderRadius: 12, padding: '14px 16px', fontFamily: HANKEN, fontSize: 14.5, lineHeight: 1.5, color: 'var(--ink)', marginTop: 16 }}>
                <p style={{ margin: '0 0 10px', fontWeight: 600 }}>{t('animQuotaStop', { needed: quotaStop.needed, left: quotaStop.left })}</p>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  <button type="button" onClick={() => { setTier('still'); setQuotaStop(null) }} style={{ ...ghostBtn, padding: '10px 18px', fontSize: 14.5 }}>{t('animQuotaStill')}</button>
                  <button type="button" onClick={() => renderFilm({ forcePay: true })} style={{ ...bigBtn, padding: '10px 18px', fontSize: 14.5 }}>{t('animQuotaBuy', { price: animatedPrice ?? 249 })}</button>
                </div>
              </div>
            )}
            <div style={{ textAlign: 'center', marginTop: 22 }}>
              {busy ? (
                <div style={{ fontFamily: HANKEN, fontSize: 15.5, color: 'var(--ink)' }}>
                  <div className="cf-spinner" style={{ margin: '0 auto 12px' }} />
                  {phase === 'saving' && t('phaseSaving')}
                  {phase === 'images' && t('phaseImages', { done: imageProgress?.done ?? 0, total: imageProgress?.total ?? 0 })}
                  {phase === 'paying' && t('phasePaying')}
                  {phase === 'starting' && t('phaseStarting')}
                  <p style={{ ...hint, margin: '10px 0 0', fontSize: 13.5 }}>{t('stayOnPage')}</p>
                </div>
              ) : (
                <button type="button" onClick={() => renderFilm()} style={{ ...bigBtn, fontSize: 18, padding: '16px 34px' }}>🎬 {t('makeFilm')}</button>
              )}
            </div>
          </section>
        )}

        <div style={{ textAlign: 'center' }}>
          <button type="button" onClick={() => router.push(`/dashboard/products/${productId}`)} disabled={busy} style={{ ...ghostBtn, border: 'none', color: 'var(--text-muted)' }}>{t('cancel')}</button>
        </div>
      </div>
    </div>
  )
}
