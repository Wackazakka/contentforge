'use client'

import { useEffect, useRef, useState } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { getSupabase } from '@/lib/supabaseClient'
import { fillMissingImages, type FilmSeg } from '@/lib/filmImages'

// Etter betaling (Lars 5/9: «betalingen skal skje i forkant»): webhooken
// markerer utkastet betalt uten aa starte produksjonen. Her lages bildene
// som mangler, og produksjonen startes. Samme side brukes til aa FULLFOERE
// en betalt film kunden forlot (lenke fra anledningssiden).

const HANKEN = 'var(--font-hanken), sans-serif'

type State = 'waitingPayment' | 'images' | 'starting' | 'done' | 'slow' | 'error'

export default function FilmPaidPage() {
  const params = useParams()
  const searchParams = useSearchParams()
  const t = useTranslations('film')
  const productId = params?.id as string
  const draftId = searchParams?.get('draft') || ''
  const sessionId = searchParams?.get('session_id') || ''
  const [state, setState] = useState<State>(draftId ? 'waitingPayment' : 'error')
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const started = useRef(false)

  useEffect(() => {
    if (!draftId) return
    let stopped = false
    let tries = 0
    const go = async (draft: { segments: FilmSeg[]; title: string | null; ai_motion: boolean | null }) => {
      if (started.current) return
      started.current = true
      try {
        setState('images')
        const segs = await fillMissingImages({
          draftId, productId, title: draft.title || '',
          segments: draft.segments || [],
          onProgress: (done, total) => setProgress({ done, total }),
        })
        void segs
        setState('starting')
        const res = await fetch('/api/start-production', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ draftId, imageStyle: 'papercut', includeOutroCard: false, aiMotion: !!draft.ai_motion, aiMotionEngine: 'kling' }),
        })
        const d = await res.json().catch(() => null)
        if (!res.ok || !d?.jobId) throw new Error(d?.error || t('failed'))
        setState('done')
        window.location.href = `/dashboard/products/${productId}/video/status/${d.jobId}?format=9%3A16&simple=1`
      } catch (err) {
        started.current = false
        setMessage(err instanceof Error && err.message === 'IMAGES_FAILED' ? t('imagesFailed') : (err instanceof Error && err.message) || t('failed'))
        setState('error')
      }
    }
    const poll = async () => {
      if (stopped || started.current) return
      tries++
      try {
        const { data } = await getSupabase()
          .from('production_drafts')
          .select('job_id, payment_status, segments, title, ai_motion')
          .eq('id', draftId)
          .single()
        if (data?.job_id) {
          window.location.href = `/dashboard/products/${productId}/video/status/${data.job_id}?format=9%3A16&simple=1`
          return
        }
        if (data && (data.payment_status === 'paid' || data.payment_status === 'consumed')) {
          await go(data as { segments: FilmSeg[]; title: string | null; ai_motion: boolean | null })
          return
        }
        if (tries === 10 && sessionId) {
          // Webhooken uteble: hent sessionen fra Stripe og oppfyll (idempotent)
          await fetch('/api/production-checkout/confirm', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sessionId }),
          }).catch(() => {})
        }
      } catch { /* proev igjen */ }
      if (tries < 60) setTimeout(poll, 2000)
      else setState('slow')
    }
    poll()
    return () => { stopped = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftId, sessionId, productId])

  const title = state === 'waitingPayment' ? t('paidTitle')
    : state === 'images' ? t('paidImagesTitle')
    : state === 'starting' ? t('phaseStarting')
    : state === 'slow' ? t('paidSlowTitle')
    : state === 'error' ? t('failedTitle')
    : t('paidTitle')
  const text = state === 'waitingPayment' ? t('paidText')
    : state === 'images' ? t('phaseImages', { done: progress?.done ?? 0, total: progress?.total ?? 0 })
    : state === 'slow' ? t('paidSlowText')
    : state === 'error' ? (message || t('failed'))
    : t('stayOnPage')

  return (
    <div className="min-h-screen bg-[var(--paper)] flex items-center justify-center px-4">
      <div style={{ maxWidth: 440, textAlign: 'center', fontFamily: HANKEN }}>
        {state === 'slow' || state === 'error' ? (
          <div style={{ fontSize: 40, marginBottom: 12 }} aria-hidden="true">{state === 'error' ? '⚠️' : '⏳'}</div>
        ) : (
          <div className="cf-spinner" style={{ margin: '0 auto 16px' }} />
        )}
        <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--ink)', margin: '0 0 10px' }}>{title}</h1>
        <p style={{ fontSize: 15, lineHeight: 1.55, color: 'var(--text-muted)', margin: 0 }}>{text}</p>
        {(state === 'slow' || state === 'error') && (
          <div style={{ marginTop: 20, display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            {state === 'error' && draftId && (
              <button type="button" onClick={() => window.location.reload()} style={{ fontFamily: HANKEN, fontWeight: 700, fontSize: 15, color: 'var(--on-ember)', background: 'var(--ember-deep)', border: 'none', borderRadius: 999, padding: '11px 22px', cursor: 'pointer' }}>{t('retryFinish')}</button>
            )}
            <Link href={`/dashboard/products/${productId}`} style={{ color: 'var(--ember-deep)', fontWeight: 600, textDecoration: 'none', alignSelf: 'center' }}>{t('back')}</Link>
          </div>
        )}
      </div>
    </div>
  )
}
