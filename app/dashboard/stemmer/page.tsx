'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useTranslations, useLocale } from 'next-intl'
import { getSupabase } from '@/lib/supabaseClient'
import { settOnsketStemme, lesOnsketStemme, fjernOnsketStemme, type OnsketStemme } from '@/lib/onsketStemme'

// Kundens Stemmer-fane (Lars 17/9): bla, lytt og sammenlikn FØR man lager noe.
// Tidligere fantes stemmene bare som en nedtrekksmeny midt i editoren.
// Viser alt kunden kan bruke her, med egne priser — se /api/voice-bank/catalog.

interface KatalogActor {
  id: string
  name: string
  bio: string | null
  photo: string | null
  sample: string | null
  hasVoice: boolean
  hasFace: boolean
  voiceId: string | null
  hasCard: boolean
  isDemo: boolean
  prices: Record<string, number>
}

type Filter = 'alle' | 'stemme' | 'ansikt'
// Brukstypene (video, avatar, radio, face) er API-kontrakt mot katalogruta;
// bare etikettene oversettes. Belopet formateres etter sprak, valutaen er NOK.
const BCP47: Record<string, string> = { no: 'nb-NO', en: 'en-GB' }
const initialer = (navn: string) => navn.split(/\s+/).filter(Boolean).slice(0, 2).map((d) => d[0]?.toUpperCase() ?? '').join('')

export default function StemmerPage() {
  const t = useTranslations('catalog')
  const locale = useLocale()
  const nok = (n: number) => `${(Math.round(n * 100) / 100).toLocaleString(BCP47[locale] || 'en-GB')} kr`
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tenantName, setTenantName] = useState('')
  const [actors, setActors] = useState<KatalogActor[]>([])
  const [filter, setFilter] = useState<Filter>('alle')
  const [spiller, setSpiller] = useState<string | null>(null)
  const [valgt, setValgt] = useState<OnsketStemme | null>(null)
  const audio = useRef<HTMLAudioElement | null>(null)

  useEffect(() => {
    let avbrutt = false
    ;(async () => {
      try {
        const { data: sess } = await getSupabase().auth.getSession()
        const token = sess?.session?.access_token
        if (!token) throw new Error(t('err_login'))
        const res = await fetch('/api/voice-bank/catalog', { headers: { Authorization: `Bearer ${token}` } })
        const d = await res.json()
        if (!res.ok) throw new Error(d.error || 'Kunne ikke hente stemmene')
        if (avbrutt) return
        setTenantName(d.tenant?.name || '')
        setActors(d.actors || [])
        setValgt(lesOnsketStemme())
      } catch (e) {
        if (!avbrutt) setError(e instanceof Error ? e.message : 'Kunne ikke hente stemmene')
      } finally {
        if (!avbrutt) setLoading(false)
      }
    })()
    return () => { avbrutt = true; audio.current?.pause() }
  }, [])

  const antall = useMemo(() => ({
    alle: actors.length,
    stemme: actors.filter((a) => a.hasVoice).length,
    ansikt: actors.filter((a) => a.hasFace).length,
  }), [actors])
  const synlige = actors.filter((a) => filter === 'alle' || (filter === 'stemme' ? a.hasVoice : a.hasFace))
  const visFilter = antall.stemme > 0 && antall.ansikt > 0 && (antall.stemme < antall.alle || antall.ansikt < antall.alle)

  const toggle = (a: KatalogActor) => {
    if (!a.sample) return
    if (spiller === a.id) { audio.current?.pause(); setSpiller(null); return }
    audio.current?.pause()
    const el = new Audio(a.sample)
    el.onended = () => setSpiller((s) => (s === a.id ? null : s))
    el.onerror = () => setSpiller((s) => (s === a.id ? null : s))
    audio.current = el
    setSpiller(a.id)
    el.play().catch(() => setSpiller(null))
  }

  const bruk = (a: KatalogActor) => {
    if (!a.voiceId) return
    const v = { voiceId: a.voiceId, name: a.name }
    settOnsketStemme(v)
    setValgt(v)
  }
  const angre = () => { fjernOnsketStemme(); setValgt(null) }

  const kant = { borderColor: 'var(--ds-border, #E2D9C8)' }

  return (
    <div>
      <h1 className="text-3xl font-bold mb-2" style={{ letterSpacing: '-0.02em' }}>{antall.ansikt > 0 ? t('h1_both') : t('h1')}</h1>
      <p className="text-[var(--ink-soft,#4A443B)] max-w-2xl mb-8">
        {t('intro', { tenant: tenantName || t('intro_us') })}
      </p>

      {loading && <p className="text-[var(--text-muted,#6B6358)]">{t('loading')}</p>}
      {error && <div className="mb-6 p-4 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">{error}</div>}

      {valgt && (
        <div className="mb-8 p-4 rounded-xl border flex flex-wrap items-center gap-x-4 gap-y-2" style={{ background: 'var(--ember-tint-bg)', borderColor: 'var(--ember-tint-border)' }}>
          <div className="flex-1 min-w-[240px] text-sm">
            {t.rich('picked', { name: valgt.name, b: (c) => <strong>{c}</strong> })}
          </div>
          <button onClick={() => router.push('/dashboard')} className="px-4 py-2 rounded-lg text-sm font-semibold text-[var(--on-ember)] bg-[var(--ember-deep)] hover:opacity-90">{t('to_overview')}</button>
          <button onClick={angre} className="text-sm text-[var(--text-muted,#6B6358)] hover:text-[var(--ink,#1C1A16)] underline">{t('undo')}</button>
        </div>
      )}

      {!loading && !error && actors.length === 0 && (
        <div className="rounded-xl border p-8 max-w-xl" style={{ ...kant, background: 'var(--paper-raised)' }}>
          <h2 className="font-semibold text-lg mb-2">{t('empty_title')}</h2>
          <p className="text-[var(--ink-soft,#4A443B)]">
            {t('empty_body')}
          </p>
        </div>
      )}

      {visFilter && (
        <div className="flex gap-2 mb-6 flex-wrap" role="tablist" aria-label={t('filter_label')}>
          {([['alle', t('filter_all')], ['stemme', t('filter_voice')], ['ansikt', t('filter_face')]] as Array<[Filter, string]>).map(([k, label]) => {
            const paa = filter === k
            return (
              <button key={k} role="tab" aria-selected={paa} onClick={() => setFilter(k)}
                className="px-4 py-2 rounded-full text-sm font-semibold border transition-colors"
                style={{
                  color: paa ? 'var(--ember-deep)' : 'var(--text-muted, #6B6358)',
                  background: paa ? 'var(--ember-tint-bg)' : 'transparent',
                  borderColor: paa ? 'var(--ember-tint-border)' : 'var(--ds-border, #E2D9C8)',
                }}>
                {label} <span style={{ opacity: 0.6, fontWeight: 500 }}>{antall[k]}</span>
              </button>
            )
          })}
        </div>
      )}

      <div className="grid gap-5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(270px, 1fr))' }}>
        {synlige.map((a) => {
          const erPaa = spiller === a.id
          const erValgt = !!valgt && valgt.voiceId === a.voiceId
          return (
            <article key={a.id} className="rounded-xl border overflow-hidden flex flex-col"
              style={{ background: 'var(--paper-raised)', borderColor: erValgt ? 'var(--ember-deep)' : 'var(--ds-border, #E2D9C8)' }}>
              {a.photo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={a.photo} alt={a.name} loading="lazy" className="w-full aspect-[4/3] object-cover" />
              ) : (
                <div className="w-full aspect-[4/3] flex items-center justify-center text-4xl font-bold"
                  style={{ background: 'var(--ember-tint-bg)', color: 'var(--ember-deep)' }} aria-hidden="true">{initialer(a.name)}</div>
              )}
              <div className="p-4 flex flex-col gap-2 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <h2 className="font-semibold text-lg leading-tight">{a.name}</h2>
                  <div className="flex gap-1 flex-none text-[11px] font-semibold uppercase tracking-wide">
                    {a.hasVoice && <span className="px-2 py-0.5 rounded-full" style={{ background: 'var(--ember-tint-bg)', color: 'var(--ember-deep)' }}>{t('chip_voice')}</span>}
                    {a.hasFace && <span className="px-2 py-0.5 rounded-full" style={{ background: 'var(--ember-tint-bg)', color: 'var(--ember-deep)' }}>{t('chip_face')}</span>}
                  </div>
                </div>
                {a.bio && (
                  <p className="text-sm text-[var(--ink-soft,#4A443B)]" style={{ display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{a.bio}</p>
                )}

                {/* Pris per bruk, per brukstype — samme tall editoren viser før kjøp */}
                <dl className="text-sm mt-1 grid grid-cols-2 gap-x-4 gap-y-0.5">
                  {Object.entries(a.prices).map(([k, v]) => (
                    <div key={k} className="flex justify-between gap-2">
                      <dt className="text-[var(--text-muted,#6B6358)]">{t.has(`kind_${k}`) ? t(`kind_${k}`) : k}</dt>
                      <dd className="font-medium">{nok(v)}</dd>
                    </div>
                  ))}
                </dl>
                <p className="text-[11px] text-[var(--text-faint,#8A8175)]">{t('per_use')}</p>

                <div className="mt-auto pt-2 flex items-center gap-2 flex-wrap">
                  {a.sample ? (
                    <button onClick={() => toggle(a)} aria-pressed={erPaa}
                      className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold border hover:border-[var(--ember-deep)]" style={kant}>
                      <span aria-hidden="true">{erPaa ? '■' : '▶'}</span>{erPaa ? t('stop') : t('play')}
                    </button>
                  ) : (
                    a.hasVoice && <span className="text-xs text-[var(--text-faint,#8A8175)]">{t('no_sample')}</span>
                  )}
                  {a.isDemo ? (
                    <span className="text-xs text-[var(--text-muted,#6B6358)]">
                      {t('demo_note')}
                    </span>
                  ) : a.hasVoice && (
                    <button onClick={() => (erValgt ? angre() : bruk(a))}
                      className={`px-3 py-2 rounded-lg text-sm font-semibold ${erValgt ? 'border' : 'text-[var(--on-ember)] bg-[var(--ember-deep)] hover:opacity-90'}`}
                      style={erValgt ? { borderColor: 'var(--ember-deep)', color: 'var(--ember-deep)' } : undefined}>
                      {erValgt ? t('chosen') : t('use_voice')}
                    </button>
                  )}
                  {a.hasCard && <Link href={`/stemme/${a.id}`} target="_blank" className="text-sm font-medium text-[var(--ember-deep)] hover:underline ml-auto">{t('card_link')}</Link>}
                </div>
              </div>
            </article>
          )
        })}
      </div>
    </div>
  )
}
