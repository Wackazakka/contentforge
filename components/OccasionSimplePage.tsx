'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useTranslations, useLocale } from 'next-intl'
import { getSupabase } from '@/lib/supabaseClient'
import { useTenant } from '@/lib/tenantContext'
import { verticalConfig } from '@/lib/verticals'

// Produktsiden i «enkel modus» (Standard Ropert, Lars 4/9). Erstatter den
// 1 700 linjer lange produktsiden for vertikaler med simpleMode: anledningen,
// én stor knapp «Lag film», og filmene som er laget — se, last ned, del.
// Ingen merkevareprofil, ingen radio/avatar/artikler, ingen taxameter.

const HANKEN = 'var(--font-hanken), sans-serif'
const SERIF = 'var(--font-serif), serif'

interface Job {
  id: string
  title: string
  status: string
  content_type: string | null
  video_format: string | null
  ai_parameters: { video_url?: string; r2_url?: string } | null
  created_at: string
}

interface Product {
  id: string
  name: string
  description: string | null
  category: string | null
  created_at: string
}

export default function OccasionSimplePage({ productId }: { productId: string }) {
  const t = useTranslations('occasion')
  const tModal = useTranslations('productModal')
  const locale = useLocale()
  const tenant = useTenant()
  const vcfg = verticalConfig(tenant.vertical)

  const [product, setProduct] = useState<Product | null>(null)
  const [loading, setLoading] = useState(true)
  const [jobs, setJobs] = useState<Job[]>([])
  const [copied, setCopied] = useState<string | null>(null)
  // Fra ferdig film tilbake til utkastet som lagde den (for «Rediger plakatene»)
  const [draftByJob, setDraftByJob] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!productId) return
    ;(async () => {
      try {
        const { data, error: e } = await getSupabase().from('products').select('id, name, description, category, created_at').eq('id', productId).single()
        if (e) throw e
        setProduct(data as Product)
      } catch { setError(t('notFound')) } finally { setLoading(false) }
    })()
  }, [productId]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!productId) return
    let stopped = false
    const load = async () => {
      try {
        const { data } = await getSupabase()
          .from('production_jobs')
          .select('id, title, status, content_type, video_format, ai_parameters, created_at')
          .eq('product_id', productId)
          .order('created_at', { ascending: false })
        if (!stopped && data) {
          setJobs(data as Job[])
          const ids = (data as Job[]).map((j) => j.id)
          if (ids.length) {
            const { data: drafts } = await getSupabase().from('production_drafts').select('id, job_id').in('job_id', ids)
            if (!stopped && drafts) setDraftByJob(Object.fromEntries((drafts as Array<{ id: string; job_id: string }>).map((d) => [d.job_id, d.id])))
          }
        }
      } catch { /* lista er tom til neste runde */ }
    }
    load()
    const iv = setInterval(load, 6000)
    return () => { stopped = true; clearInterval(iv) }
  }, [productId])

  const categoryLabel = (value: string | null) => {
    if (!value) return null
    const opt = vcfg?.categoryOptions.find((o) => o.value === value)
    return opt ? tModal(opt.labelKey) : value
  }

  const videoUrlOf = (j: Job) => j.ai_parameters?.video_url || j.ai_parameters?.r2_url || null
  const films = jobs.filter((j) => j.content_type !== 'avatar' && j.content_type !== 'radio')
  const active = films.filter((j) => !['done', 'completed', 'failed'].includes(j.status))
  const done = films.filter((j) => (j.status === 'done' || j.status === 'completed') && videoUrlOf(j))
  const failed = films.filter((j) => j.status === 'failed')

  const share = async (j: Job) => {
    const url = videoUrlOf(j)
    if (!url) return
    try {
      if (typeof navigator !== 'undefined' && navigator.share) {
        await navigator.share({ title: j.title, url })
        return
      }
    } catch { /* avbrutt — fall til kopiering */ }
    try {
      await navigator.clipboard.writeText(url)
      setCopied(j.id)
      setTimeout(() => setCopied(null), 2500)
    } catch { window.prompt(t('copyManually'), url) }
  }

  const remove = async (j: Job) => {
    if (!confirm(t('deleteConfirm'))) return
    try {
      const { data: { session } } = await getSupabase().auth.getSession()
      await fetch(`/api/productions/${j.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${session?.access_token}` } })
      setJobs((prev) => prev.filter((x) => x.id !== j.id))
    } catch { /* neste polling viser fasiten */ }
  }

  const fmtDate = (iso: string) => new Date(iso).toLocaleDateString(locale === 'en' ? 'en-GB' : 'nb-NO', { day: 'numeric', month: 'long', year: 'numeric' })

  const card: React.CSSProperties = { background: 'var(--paper-raised)', border: '1px solid var(--ds-border)', borderRadius: 18, padding: 26, marginBottom: 18 }
  const bigBtn: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 8, fontFamily: HANKEN, fontWeight: 700, fontSize: 17, color: 'var(--on-ember)', background: 'var(--ember-deep)', border: 'none', borderRadius: 999, padding: '15px 30px', cursor: 'pointer', textDecoration: 'none' }
  const smallBtn: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: HANKEN, fontWeight: 600, fontSize: 14, color: 'var(--ink)', background: 'transparent', border: '1.5px solid var(--ds-border)', borderRadius: 999, padding: '9px 16px', cursor: 'pointer', textDecoration: 'none' }

  if (loading) {
    return <div className="flex items-center justify-center py-24"><div className="cf-spinner" /></div>
  }
  if (error || !product) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8">
        <Link href="/dashboard" style={{ fontFamily: HANKEN, fontSize: 14.5, color: 'var(--ember-deep)', textDecoration: 'none' }}>{t('back')}</Link>
        <p style={{ fontFamily: HANKEN, color: 'var(--ember-deep)', marginTop: 24 }}>{error || t('notFound')}</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[var(--paper)]">
      <div className="max-w-2xl mx-auto px-4 py-8">
        <Link href="/dashboard" style={{ fontFamily: HANKEN, fontSize: 14.5, color: 'var(--ember-deep)', textDecoration: 'none' }}>{t('back')}</Link>

        <div style={{ margin: '14px 0 26px' }}>
          <h1 style={{ fontFamily: SERIF, fontWeight: 400, fontSize: 'clamp(32px,4vw,42px)', lineHeight: 1.05, color: 'var(--ink)', margin: '0 0 10px' }}>{product.name}</h1>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            {categoryLabel(product.category) && (
              <span style={{ fontFamily: HANKEN, fontSize: 12, fontWeight: 600, color: 'var(--ember-deep)', background: 'var(--ember-tint-bg)', border: '1px solid var(--ember-tint-border)', borderRadius: 999, padding: '3px 11px' }}>{categoryLabel(product.category)}</span>
            )}
            <span style={{ fontFamily: HANKEN, fontSize: 13, color: 'var(--text-faint)' }}>{t('created', { date: fmtDate(product.created_at) })}</span>
          </div>
          {product.description && <p style={{ fontFamily: HANKEN, fontSize: 15.5, lineHeight: 1.55, color: 'var(--text-muted)', margin: '12px 0 0' }}>{product.description}</p>}
        </div>

        <section style={{ ...card, textAlign: 'center', padding: 34 }}>
          <div style={{ fontSize: 40, marginBottom: 10 }} aria-hidden="true">🎬</div>
          <h2 style={{ fontFamily: HANKEN, fontWeight: 700, fontSize: 21, color: 'var(--ink)', margin: '0 0 8px' }}>{done.length ? t('makeAnotherTitle') : t('makeFirstTitle')}</h2>
          <p style={{ fontFamily: HANKEN, fontSize: 14.5, lineHeight: 1.55, color: 'var(--text-muted)', margin: '0 auto 20px', maxWidth: 420 }}>{t('makeHint')}</p>
          <Link href={`/dashboard/products/${productId}/film`} style={bigBtn}>{t('makeFilm')}</Link>
        </section>

        {active.length > 0 && (
          <section style={card}>
            <h2 style={{ fontFamily: HANKEN, fontWeight: 700, fontSize: 18, color: 'var(--ink)', margin: '0 0 12px' }}>{t('inProgress')}</h2>
            {active.map((j) => (
              <div key={j.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderTop: '1px solid var(--ds-border-faint)' }}>
                <div className="cf-spinner" style={{ width: 18, height: 18 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontFamily: HANKEN, fontWeight: 600, fontSize: 15, color: 'var(--ink)' }}>{j.title}</div>
                  <div style={{ fontFamily: HANKEN, fontSize: 13, color: 'var(--text-muted)' }}>{t('inProgressHint')}</div>
                </div>
                <Link href={`/dashboard/products/${productId}/video/status/${j.id}?format=9%3A16&simple=1`} style={smallBtn}>{t('follow')}</Link>
              </div>
            ))}
          </section>
        )}

        {failed.length > 0 && (
          <section style={{ ...card, borderColor: '#F5C2C2' }}>
            <h2 style={{ fontFamily: HANKEN, fontWeight: 700, fontSize: 18, color: 'var(--ink)', margin: '0 0 8px' }}>{t('failedTitle')}</h2>
            <p style={{ fontFamily: HANKEN, fontSize: 14.5, color: 'var(--text-muted)', margin: '0 0 12px' }}>{t('failedHint')}</p>
            {failed.map((j) => (
              <div key={j.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0' }}>
                <div style={{ flex: 1, fontFamily: HANKEN, fontSize: 15, color: 'var(--ink)' }}>{j.title}</div>
                <button type="button" onClick={() => remove(j)} style={smallBtn}>{t('remove')}</button>
              </div>
            ))}
          </section>
        )}

        {done.length > 0 && (
          <section style={card}>
            <h2 style={{ fontFamily: HANKEN, fontWeight: 700, fontSize: 18, color: 'var(--ink)', margin: '0 0 16px' }}>{t('yourFilms', { count: done.length })}</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 18 }}>
              {done.map((j) => {
                const url = videoUrlOf(j) as string
                const landscape = (j.video_format || '').includes('16:9')
                return (
                  <div key={j.id} style={{ border: '1px solid var(--ds-border)', borderRadius: 14, overflow: 'hidden', background: 'var(--paper)' }}>
                    <video src={url} controls playsInline preload="metadata" style={{ width: '100%', aspectRatio: landscape ? '16/9' : '9/16', background: '#000', display: 'block' }} />
                    <div style={{ padding: 12 }}>
                      <div style={{ fontFamily: HANKEN, fontWeight: 600, fontSize: 14.5, color: 'var(--ink)', marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{j.title}</div>
                      <div style={{ fontFamily: HANKEN, fontSize: 12.5, color: 'var(--text-faint)', marginBottom: 10 }}>{fmtDate(j.created_at)}</div>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <a href={`/api/video-proxy?url=${encodeURIComponent(url)}`} download={`${j.title.replace(/[^\p{L}\p{N}]+/gu, '_')}.mp4`} style={{ ...smallBtn, color: 'var(--on-ember)', background: 'var(--ember-deep)', border: '1.5px solid var(--ember-deep)' }}>{t('download')}</a>
                        <button type="button" onClick={() => share(j)} style={smallBtn}>{copied === j.id ? t('copied') : t('share')}</button>
                        {draftByJob[j.id] && (
                          <Link href={`/dashboard/products/${productId}/film?draft=${draftByJob[j.id]}`} style={smallBtn}>{t('editPosters')}</Link>
                        )}
                        <button type="button" onClick={() => remove(j)} title={t('remove')} style={{ ...smallBtn, border: 'none', color: 'var(--text-faint)', padding: '9px 6px' }}>🗑</button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
            <p style={{ fontFamily: HANKEN, fontSize: 13.5, lineHeight: 1.55, color: 'var(--text-muted)', margin: '16px 0 0' }}>{t('shareHint')}</p>
          </section>
        )}
      </div>
    </div>
  )
}
