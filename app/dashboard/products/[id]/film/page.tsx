'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { useTranslations, useLocale } from 'next-intl'
import { getSupabase } from '@/lib/supabaseClient'
import { useTenant } from '@/lib/tenantContext'
import { fetchMusicLibrary, ownTracks, tracksFolder, isMedleyFile, type MusicFile } from '@/lib/musicLibrary'
import { uploadTrack, TRACK_UPLOAD_MAX_BYTES } from '@/lib/uploadTrack'
import { filmPricing } from '@/lib/verticals'

// Den enkle filmflyten (Standard Ropert, Lars 4/9): sang → bilder → tekst →
// film. Ingen segmentredigering, ingen stemmevalg, ingen taxameter. Sangen
// (fra Sangskaper) er lydsporet; tekstlinjer paa skjermen baerer budskapet.
// Alt som ikke er strengt noedvendig for aa faa en film, er holdt utenfor.

const HANKEN = 'var(--font-hanken), sans-serif'
const SERIF = 'var(--font-serif), serif'

type Phase = 'idle' | 'writing' | 'images' | 'paying' | 'starting'

function fmtDuration(sec: number | null): string {
  if (!sec || !isFinite(sec)) return ''
  const m = Math.floor(sec / 60)
  const s = Math.round(sec % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

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
  const [loaded, setLoaded] = useState(false)

  // Sang
  const [tracks, setTracks] = useState<MusicFile[]>([])
  const [musicFile, setMusicFile] = useState<string | null>(null)
  const [musicDuration, setMusicDuration] = useState<number | null>(null)
  const [uploadingTrack, setUploadingTrack] = useState(false)
  const [trackError, setTrackError] = useState<string | null>(null)
  // Maalt lengde per opplastet fil (state, ikke ref — leses under render)
  const [durationByFile, setDurationByFile] = useState<Record<string, number>>({})

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
      } catch { /* skjemaet fungerer tomt */ } finally { setLoaded(true) }
      try {
        const lib = await fetchMusicLibrary()
        const mine = ownTracks(lib.files, productId).filter((f) => !isMedleyFile(f.filename))
        setTracks(mine)
        // Nyeste sang forhaandsvelges — den de nettopp lastet opp er den de vil ha
        if (mine.length > 0) setMusicFile(mine[mine.length - 1].filename)
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
      // Lagre eventuelle endringer i tittel/beskrivelse paa anledningen
      try {
        await getSupabase().from('products').update({ name: title.trim(), description: description.trim() }).eq('id', productId)
      } catch { /* ikke kritisk */ }

      setPhase('writing')
      const tk = await token()
      if (!tk) throw new Error(t('mustSignIn'))
      const dur = musicFile ? (musicDuration ?? durationByFile[musicFile] ?? null) : null
      const res = await fetch('/api/content/produce/simple', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tk}` },
        body: JSON.stringify({
          productId,
          title: title.trim(),
          description: description.trim(),
          musicFile,
          musicDurationSec: dur,
          photos: photos.map((p) => p.url),
          locale,
        }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok || !data?.draftId) throw new Error(data?.error || t('failed'))
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
        {error && (
          <div style={{ background: '#FDECEC', border: '1px solid #F5C2C2', color: '#8A1C1C', borderRadius: 12, padding: '12px 16px', fontFamily: HANKEN, fontSize: 14.5, marginBottom: 18 }}>{error}</div>
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
                  {chosenDuration ? t('filmLength', { length: fmtDuration(chosenDuration) }) : t('filmLengthUnknown')}
                </div>
              </div>
              <audio controls preload="none" src={chosenTrack.url} style={{ height: 34, maxWidth: 220 }} />
            </div>
          ) : null}
          {tracks.length > 1 && (
            <select value={musicFile || ''} onChange={(e) => { setMusicFile(e.target.value || null); setMusicDuration(null) }} disabled={busy} className="cf-input" style={{ marginBottom: 12 }}>
              {tracks.map((tr) => <option key={tr.filename} value={tr.filename}>{tr.name}</option>)}
            </select>
          )}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <label style={{ ...(chosenTrack ? ghostBtn : bigBtn), opacity: uploadingTrack || busy ? 0.6 : 1 }}>
              {uploadingTrack ? t('uploading') : chosenTrack ? t('changeSong') : t('uploadSong')}
              <input type="file" accept=".mp3,audio/mpeg" className="hidden" disabled={uploadingTrack || busy} onChange={(e) => { const f = e.currentTarget.files?.[0]; e.currentTarget.value = ''; if (f) onTrackChosen(f) }} />
            </label>
            {chosenTrack && (
              <button type="button" onClick={() => { setMusicFile(null); setMusicDuration(null) }} disabled={busy} style={{ ...ghostBtn, border: 'none', color: 'var(--text-muted)' }}>{t('noSong')}</button>
            )}
          </div>
          {!chosenTrack && <p style={{ ...hint, margin: '12px 0 0', fontSize: 13.5 }}>{t('noSongHint')}</p>}
          {trackError && <p style={{ fontFamily: HANKEN, fontSize: 14, color: 'var(--ember-deep)', margin: '10px 0 0' }}>{trackError}</p>}
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
          <label style={{ display: 'block', fontFamily: HANKEN, fontSize: 14, fontWeight: 600, color: 'var(--ink-soft)', marginBottom: 8 }}>{t('descriptionLabel')}</label>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} disabled={busy || !loaded} className="cf-input" rows={4} placeholder={t('descriptionPlaceholder')} style={{ resize: 'vertical' }} />
        </section>

        {/* 4 · Lag filmen */}
        <section style={{ ...card, textAlign: 'center' }}>
          <h2 style={{ ...h2, justifyContent: 'center' }}><span style={stepNo}>4</span>{t('step4Title')}</h2>
          <p style={hint}>{t('step4Hint')}</p>
          <p style={{ ...hint, fontSize: 15, fontWeight: 600, color: 'var(--ink)' }}>
            {allowance && !allowance.billing
              ? t('priceFreePeriod')
              : allowance?.nextIsFree
                ? t('priceRemake', { left: allowance.freeLeft })
                : t('priceLine', { price: filmPrice ?? 149, remakes: allowance?.freeRemakes ?? 3 })}
          </p>
          {busy ? (
            <div style={{ fontFamily: HANKEN, fontSize: 15.5, color: 'var(--ink)' }}>
              <div className="cf-spinner" style={{ margin: '0 auto 12px' }} />
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
