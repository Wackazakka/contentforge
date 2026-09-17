'use client'

import { useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import type { PublicActor } from '@/lib/publicActors'

// Filter + avspilling. Én lyd om gangen: starter du en ny prøve, stopper den
// forrige — tolv spillere som går oppå hverandre er ingen måte å velge stemme på.

type Filter = 'alle' | 'stemme' | 'ansikt'

const initialer = (navn: string) => navn.split(/\s+/).filter(Boolean).slice(0, 2).map((d) => d[0]?.toUpperCase() ?? '').join('')

export default function GalleriClient({ actors }: { actors: PublicActor[] }) {
  const [filter, setFilter] = useState<Filter>('alle')
  const [spiller, setSpiller] = useState<string | null>(null)
  const audio = useRef<HTMLAudioElement | null>(null)

  const antall = useMemo(() => ({
    alle: actors.length,
    stemme: actors.filter((a) => a.hasVoice).length,
    ansikt: actors.filter((a) => a.hasFace).length,
  }), [actors])
  const synlige = actors.filter((a) => filter === 'alle' || (filter === 'stemme' ? a.hasVoice : a.hasFace))

  const toggle = (a: PublicActor) => {
    const url = a.samples[0]
    if (!url) return
    if (spiller === a.id) { audio.current?.pause(); setSpiller(null); return }
    audio.current?.pause()
    const el = new Audio(url)
    el.onended = () => setSpiller((s) => (s === a.id ? null : s))
    el.onerror = () => setSpiller((s) => (s === a.id ? null : s))
    audio.current = el
    setSpiller(a.id)
    el.play().catch(() => setSpiller(null))
  }

  // Filteret vises bare når det faktisk skiller noe.
  const visFilter = antall.stemme > 0 && antall.ansikt > 0 && (antall.stemme < antall.alle || antall.ansikt < antall.alle)

  return (
    <>
      {visFilter && (
        <div className="flex gap-2 mb-8 flex-wrap" role="tablist" aria-label="Vis">
          {([['alle', 'Alle'], ['stemme', 'Stemmer'], ['ansikt', 'Ansikter']] as Array<[Filter, string]>).map(([k, label]) => {
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

      <div className="grid gap-5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))' }}>
        {synlige.map((a) => {
          const erPaa = spiller === a.id
          return (
            <article key={a.id} className="rounded-xl border overflow-hidden flex flex-col"
              style={{ background: 'var(--paper-raised)', borderColor: 'var(--ds-border, #E2D9C8)' }}>
              <Link href={`/stemme/${a.id}`} className="block" aria-label={`Visittkortet til ${a.name}`}>
                {a.photos[0] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={a.photos[0]} alt={a.name} loading="lazy" className="w-full aspect-[4/3] object-cover" />
                ) : (
                  <div className="w-full aspect-[4/3] flex items-center justify-center text-4xl font-bold"
                    style={{ background: 'var(--ember-tint-bg)', color: 'var(--ember-deep)' }} aria-hidden="true">
                    {initialer(a.name)}
                  </div>
                )}
              </Link>
              <div className="p-4 flex flex-col gap-2 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <h2 className="font-semibold text-lg leading-tight">
                    <Link href={`/stemme/${a.id}`} className="hover:text-[var(--ember-deep)]">{a.name}</Link>
                  </h2>
                  <div className="flex gap-1 flex-none text-[11px] font-semibold uppercase tracking-wide">
                    {a.hasVoice && <span className="px-2 py-0.5 rounded-full" style={{ background: 'var(--ember-tint-bg)', color: 'var(--ember-deep)' }}>Stemme</span>}
                    {a.hasFace && <span className="px-2 py-0.5 rounded-full" style={{ background: 'var(--ember-tint-bg)', color: 'var(--ember-deep)' }}>Ansikt</span>}
                  </div>
                </div>
                {a.bio && (
                  <p className="text-sm text-[var(--ink-soft,#4A443B)]" style={{ display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{a.bio}</p>
                )}
                <div className="mt-auto pt-2 flex items-center gap-3">
                  {a.samples[0] ? (
                    <button onClick={() => toggle(a)} aria-pressed={erPaa}
                      className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-semibold text-[var(--on-ember)] bg-[var(--ember-deep)] hover:opacity-90">
                      <span aria-hidden="true">{erPaa ? '■' : '▶'}</span>{erPaa ? 'Stopp' : 'Hør prøve'}
                    </button>
                  ) : (
                    <span className="text-xs text-[var(--text-faint,#8A8175)]">Ingen lydprøve ennå</span>
                  )}
                  <Link href={`/stemme/${a.id}`} className="text-sm font-medium text-[var(--ember-deep)] hover:underline ml-auto">Se mer →</Link>
                </div>
              </div>
            </article>
          )
        })}
      </div>
    </>
  )
}
