'use client'

import { useEffect, useState } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { getSupabase } from '@/lib/supabaseClient'

// Retur fra Stripe etter filmbetaling (4/9): webhooken starter produksjonen;
// her polles utkastet til jobben finnes, og kunden sendes til statussiden.
// Uteblir webhooken, kalles confirm-sikkerhetsnettet etter ~20 sekunder
// (samme moenster som den vanlige betalte produksjonen).

const HANKEN = 'var(--font-hanken), sans-serif'

export default function FilmPaidPage() {
  const params = useParams()
  const searchParams = useSearchParams()
  const t = useTranslations('film')
  const productId = params?.id as string
  const draftId = searchParams?.get('draft') || ''
  const sessionId = searchParams?.get('session_id') || ''
  const [gaveUp, setGaveUp] = useState(!draftId)

  useEffect(() => {
    if (!draftId) return
    let stopped = false
    let tries = 0
    const poll = async () => {
      if (stopped) return
      tries++
      try {
        const { data } = await getSupabase().from('production_drafts').select('job_id').eq('id', draftId).single()
        if (data?.job_id) {
          window.location.href = `/dashboard/products/${productId}/video/status/${data.job_id}?format=9%3A16&simple=1`
          return
        }
        if (tries === 10 && sessionId) {
          await fetch('/api/production-checkout/confirm', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sessionId }),
          }).catch(() => {})
        }
      } catch { /* proev igjen */ }
      if (tries < 60) setTimeout(poll, 2000)
      else setGaveUp(true)
    }
    poll()
    return () => { stopped = true }
  }, [draftId, sessionId, productId])

  return (
    <div className="min-h-screen bg-[var(--paper)] flex items-center justify-center px-4">
      <div style={{ maxWidth: 440, textAlign: 'center', fontFamily: HANKEN }}>
        {gaveUp ? (
          <>
            <div style={{ fontSize: 40, marginBottom: 12 }} aria-hidden="true">⏳</div>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--ink)', margin: '0 0 10px' }}>{t('paidSlowTitle')}</h1>
            <p style={{ fontSize: 15, lineHeight: 1.55, color: 'var(--text-muted)', margin: '0 0 20px' }}>{t('paidSlowText')}</p>
            <Link href={`/dashboard/products/${productId}`} style={{ color: 'var(--ember-deep)', fontWeight: 600, textDecoration: 'none' }}>{t('back')}</Link>
          </>
        ) : (
          <>
            <div className="cf-spinner" style={{ margin: '0 auto 16px' }} />
            <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--ink)', margin: '0 0 10px' }}>{t('paidTitle')}</h1>
            <p style={{ fontSize: 15, lineHeight: 1.55, color: 'var(--text-muted)', margin: 0 }}>{t('paidText')}</p>
          </>
        )}
      </div>
    </div>
  )
}
