'use client'

import { useState, useEffect, useRef } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { useTranslations, useLocale } from 'next-intl'
import { getSupabase } from '@/lib/supabaseClient'
import { useTenant } from '@/lib/tenantContext'
import { fetchMusicLibrary, ownTracks, sharedMusic, tracksFolder, isMedleyFile, type MusicFile } from '@/lib/musicLibrary'
import { FILM_VOICES, FILM_LIBRARY_FOLDER } from '@/lib/filmVoices'
import { uploadTrack, TRACK_UPLOAD_MAX_BYTES } from '@/lib/uploadTrack'
import { filmPricing } from '@/lib/verticals'

// Den enkle filmflyten (Standard Ropert, Lars 4/9): sang → bilder → tekst →
// film. Ingen segmentredigering, ingen stemmevalg, ingen taxameter. Sangen
// (fra Sangskaper) er lydsporet; tekstlinjer paa skjermen baerer budskapet.
// Alt som ikke er strengt noedvendig for aa faa en film, er holdt utenfor.

const HANKEN = 'var(--font-hanken), sans-serif'
const SERIF = 'var(--font-serif), serif'

type Phase = 'idle' | 'clipping' | 'writing' | 'images' | 'paying' | 'starting'

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
  const [allowance, setAllowance] = useState<{ billing: boolean; nextIsFree: boolean; freeLeft: number; freeRemakes: number } | null>(null)

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
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
  // Uten sang (4/9): en stemme leser teksten, eller bare musikk, eller stille.
  const [mode, setMode] = useState<'voice' | 'music' | 'silent'>('voice')
  const [voiceId, setVoiceId] = useState<string>(FILM_VOICES[0]?.id || '')
  const [library, setLibrary] = useState<MusicFile[]>([])
  const [libraryMusic, setLibraryMusic] = useState<string | null>(null)
  const [previewing, setPreviewing] = useState<string | null>(null)
  const previewRef = useRef<HTMLAudioElement | null>(null)
  const errorRef = useRef<HTMLDivElement | null>(null)

  // Bilder
  const [photos, setPhotos] = useState<Array<{ url: string; name: string }>>([])
  const [uploadingPhotos, setUploadingPhotos] = useState(false)
  const [photoError, setPhotoError] = useState<string | null>(null)

  // Produksjon
  const [phase, setPhase] = useState<Phase>('idle')
  const [imageProgress, setImageProgress] = useState<{ done: number; total: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const avbrutt = useSearchParams()?.get('avbrutt') === '1'

  const token = async () => (await getSupabase().auth.getSession()).data?.session?.access_token || null

  useEffect(() => {
    if (!productId) return
    ;(async () => {
      try {
        const { data } = await getSupabase().from('products').select('name, description').eq('id', productId).single()
        setTitle((data?.name || '').trim())
        setDescription((data?.description || '').trim())
        setDetails(parseDetails((data?.description || '').trim()))
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
        if (bib.length > 0) setLibraryMusic(bib[0].filename)
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

  const makeFilm = async () => {
    if (phase !== 'idle') return
    setError(null)
    if (!title.trim()) { setError(t('needTitle')); return }
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
      // Kortere film enn sangen: klipp sangen foerst (dropleten lager en fil
      // med uttoning; «film = musikkens lengde» gir da riktig lengde)
      if (musicFile && filmLength !== 'full') {
        // Hver plakat trenger ~3 s + et bilde imellom: mange svar i skjemaet
        // krever lengre film enn valgt. Forleng til naermeste 30 s, innenfor sangen.
        const filled = DETAIL_KEYS.filter((k) => details[k].trim()).length + 2
        const needed = Math.ceil((filled * 5) / 30) * 30
        let wanted = Math.max(Number(filmLength), needed)
        if (dur !== null) wanted = Math.min(wanted, Math.floor(dur))
        if (wanted > Number(filmLength)) setLengthNote(t('lengthExtended', { seconds: wanted }))
        if (dur === null || dur > wanted + 5) {
          setPhase('clipping')
          const cr = await fetch('/api/music/clip', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tk}` },
            body: JSON.stringify({ productId, filename: musicFile, clipSec: wanted, startSec: 0 }),
          })
          const cd = await cr.json().catch(() => null)
          if (!cr.ok || !cd?.file?.filename) throw new Error(cd?.error || t('failed'))
          useMusic = cd.file.filename
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
          voiceId: !musicFile && mode === 'voice' ? voiceId : null,
          libraryMusic: !musicFile && mode !== 'silent' ? libraryMusic : null,
        }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok || !data?.draftId) {
        // Ta med statuskoden: et HTML-svar (502 fra Netlify) gir ingen JSON,
        // og da er koden det eneste sporet vi har (Lars 4/9: «ingenting skjer»).
        console.error('[film] produce/simple feilet', res.status, data)
        throw new Error(`${data?.error || t('failed')} (${res.status})`)
      }
      const draftId: string = data.draftId
      let segments: Array<{ index: number; text: string; image_url: string; image_prompt?: string }> = data.segments || []

      // Ingen egne bilder: lag ett AI-bilde per scene, ett om gangen
      if (data.needsImages) {
        setPhase('images')
        const total = segments.length
        setImageProgress({ done: 0, total })
        for (let i = 0; i < segments.length; i++) {
          try {
            const r = await fetch('/api/content/generate-image', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                topic: segments[i].image_prompt || segments[i].text,
                productId,
                imageSize: '1024x1536',
                imageStyle: 'warm',
                draftId,
              }),
              signal: AbortSignal.timeout(55000),
            })
            const d = await r.json().catch(() => null)
            if (r.ok && d?.imageUrl) segments[i] = { ...segments[i], image_url: d.imageUrl }
          } catch { /* scenen faar bildet fra naboen under */ }
          setImageProgress({ done: i + 1, total })
        }
        // Scener som ikke fikk bilde laaner naermeste ferdige bilde — filmen
        // skal aldri stoppe paa ett mislykket bildekall.
        const anyImage = segments.find((s) => s.image_url)?.image_url
        if (!anyImage) throw new Error(t('imagesFailed'))
        let last = anyImage
        segments = segments.map((s) => { if (s.image_url) last = s.image_url; return { ...s, image_url: s.image_url || last } })
        const { error: upErr } = await getSupabase().from('production_drafts').update({ segments }).eq('id', draftId)
        if (upErr) throw new Error(upErr.message)
      }

      // Fastpris (149 kr): Stripe foer produksjonen. Serveren svarer
      // {free:true} naar billing er av — da startes produksjonen direkte.
      setPhase('paying')
      const payRes = await fetch('/api/film-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tk}` },
        body: JSON.stringify({ draftId }),
      })
      const pay = await payRes.json().catch(() => null)
      if (!payRes.ok) throw new Error(pay?.error || t('failed'))
      if (pay?.url) { window.location.href = pay.url; return }

      setPhase('starting')
      const startRes = await fetch('/api/start-production', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ draftId, imageStyle: 'warm', includeOutroCard: false, aiMotion: false }),
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
          {chosenTrack && (
            <div style={{ marginBottom: 14 }}>
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
          <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, fontFamily: HANKEN, fontSize: 14.5, lineHeight: 1.5, color: 'var(--ink)', marginBottom: 14, cursor: 'pointer' }}>
            <input type="checkbox" checked={rightsOk} onChange={(e) => setRightsOk(e.target.checked)} disabled={busy} style={{ marginTop: 4, width: 18, height: 18 }} />
            <span>{t('rightsLabel')}</span>
          </label>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <label style={{ ...(chosenTrack ? ghostBtn : bigBtn), opacity: uploadingTrack || busy || !rightsOk ? 0.5 : 1, cursor: rightsOk ? 'pointer' : 'not-allowed' }} title={rightsOk ? undefined : t('rightsFirst')}>
              {uploadingTrack ? t('uploading') : chosenTrack ? t('changeSong') : t('uploadSong')}
              <input type="file" accept=".mp3,audio/mpeg" className="hidden" disabled={uploadingTrack || busy || !rightsOk} onChange={(e) => { const f = e.currentTarget.files?.[0]; e.currentTarget.value = ''; if (f) onTrackChosen(f) }} />
            </label>
            {chosenTrack && (
              <button type="button" onClick={() => { setMusicFile(null); setMusicDuration(null) }} disabled={busy} style={{ ...ghostBtn, border: 'none', color: 'var(--text-muted)' }}>{t('noSong')}</button>
            )}
          </div>
          {trackError && <p style={{ fontFamily: HANKEN, fontSize: 14, color: 'var(--ember-deep)', margin: '10px 0 0' }}>{trackError}</p>}

          {!chosenTrack && (
            <div style={{ marginTop: 22, paddingTop: 18, borderTop: '1px solid var(--ds-border-faint)' }}>
              <p style={{ fontFamily: HANKEN, fontWeight: 600, fontSize: 15, color: 'var(--ink)', margin: '0 0 10px' }}>{t('noSongTitle')}</p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10, marginBottom: 14 }}>
                {([
                  { key: 'voice', label: t('modeVoice'), hintText: t('modeVoiceHint') },
                  { key: 'music', label: t('modeMusic'), hintText: t('modeMusicHint') },
                  { key: 'silent', label: t('modeSilent'), hintText: t('modeSilentHint') },
                ] as const).map((m) => (
                  <button key={m.key} type="button" disabled={busy} onClick={() => setMode(m.key)}
                    style={{ textAlign: 'left', fontFamily: HANKEN, borderRadius: 12, padding: '12px 14px', cursor: 'pointer', background: mode === m.key ? 'var(--ember-tint-bg)' : 'var(--paper)', border: mode === m.key ? '2px solid var(--ember-deep)' : '1.5px solid var(--ds-border)' }}>
                    <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--ink)' }}>{m.label}</div>
                    <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 2 }}>{m.hintText}</div>
                  </button>
                ))}
              </div>
              {mode === 'voice' && (
                <div style={{ marginBottom: 14 }}>
                  <p style={{ fontFamily: HANKEN, fontSize: 14, fontWeight: 600, color: 'var(--ink-soft)', margin: '0 0 8px' }}>{t('voiceLabel')}</p>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
                    {FILM_VOICES.map((v) => (
                      <div key={v.id} style={{ borderRadius: 12, padding: '10px 12px', background: voiceId === v.id ? 'var(--ember-tint-bg)' : 'var(--paper)', border: voiceId === v.id ? '2px solid var(--ember-deep)' : '1.5px solid var(--ds-border)' }}>
                        <button type="button" disabled={busy} onClick={() => setVoiceId(v.id)} style={{ display: 'block', width: '100%', textAlign: 'left', background: 'transparent', border: 'none', padding: 0, cursor: 'pointer', fontFamily: HANKEN }}>
                          <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--ink)' }}>{v.name}</div>
                          <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>{v.desc}</div>
                        </button>
                        {v.preview && (
                          <button type="button" onClick={() => {
                            const a = previewRef.current
                            if (!a) return
                            if (previewing === v.id) { a.pause(); setPreviewing(null); return }
                            a.src = v.preview as string; a.play().catch(() => {}); setPreviewing(v.id)
                          }} style={{ marginTop: 6, fontFamily: HANKEN, fontSize: 13, fontWeight: 600, color: 'var(--ember-deep)', background: 'transparent', border: 'none', padding: 0, cursor: 'pointer' }}>
                            {previewing === v.id ? t('stopListen') : t('listen')}
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                  <audio ref={previewRef} onEnded={() => setPreviewing(null)} className="hidden" />
                </div>
              )}
              {mode !== 'silent' && (
                <div>
                  <p style={{ fontFamily: HANKEN, fontSize: 14, fontWeight: 600, color: 'var(--ink-soft)', margin: '0 0 8px' }}>{t('musicLabel')}</p>
                  {library.length === 0 ? (
                    <p style={{ ...hint, margin: 0, fontSize: 13.5 }}>{t('noLibrary')}</p>
                  ) : (
                    <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                      <select value={libraryMusic || ''} onChange={(e) => setLibraryMusic(e.target.value || null)} disabled={busy} className="cf-input" style={{ flex: 1, minWidth: 180, marginBottom: 0 }}>
                        {library.map((m) => <option key={m.filename} value={m.filename}>{m.name}</option>)}
                      </select>
                      {libraryMusic && <audio key={libraryMusic} controls preload="none" src={musicSrc(libraryMusic)} style={{ height: 34, maxWidth: 220 }} />}
                    </div>
                  )}
                </div>
              )}
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
          <p style={hint}>{chosenTrack ? t('step4Hint') : mode === 'voice' ? t('step4HintVoice') : mode === 'music' ? t('step4HintMusic') : t('step4HintSilent')}</p>
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
              {phase === 'images' && t('phaseImages', { done: imageProgress?.done ?? 0, total: imageProgress?.total ?? 0 })}
              {phase === 'paying' && t('phasePaying')}
              {phase === 'starting' && t('phaseStarting')}
              <p style={{ ...hint, margin: '10px 0 0', fontSize: 13.5 }}>{t('stayOnPage')}</p>
            </div>
          ) : (
            <button type="button" onClick={makeFilm} disabled={!loaded} style={{ ...bigBtn, fontSize: 18, padding: '16px 34px' }}>🎬 {t('makeFilm')}</button>
          )}
        </section>

        <div style={{ textAlign: 'center' }}>
          <button type="button" onClick={() => router.push(`/dashboard/products/${productId}`)} disabled={busy} style={{ ...ghostBtn, border: 'none', color: 'var(--text-muted)' }}>{t('cancel')}</button>
        </div>
      </div>
    </div>
  )
}
