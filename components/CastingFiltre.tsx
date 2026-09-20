'use client'

import { useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import {
  FASETTER, KJOENN, VOKABULAR, filtrer, tellFasett,
  type Fasett, type Filter, type Kandidat,
} from '@/lib/castingAttributes'

// Filterlinja over en castingkatalog. Delt mellom Audition (der man PLUKKER
// inntil åtte) og det åpne galleriet (der man BLAR) — de to skal filtrere likt,
// ellers finner en produsent ulike folk på de to flatene av samme bank.
//
// Komponenten eier bare kontrollene. Tilstanden ligger i `useCastingFiltre`,
// så den som viser treffene bestemmer selv hva et treff ser ut som.
//
// To ting som er bevisste:
//   · Tellingen på hver chip er regnet fra de ØVRIGE filtrene, ikke fra hele
//     banken. Et tall som lover treff man ikke får, er verre enn ingen tall.
//   · Null treff = deaktivert chip, ikke skjult. Skjuler man den, ser det ut
//     som egenskapen ikke finnes; deaktivert sier «ingen slike, med disse
//     filtrene».

const kant = { borderColor: 'var(--ds-border, #E2D9C8)' }

function tall(v: string): number | null {
  const s = v.trim()
  if (!s) return null
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

export interface FilterTilstand {
  q: string; setQ: (v: string) => void
  kjoenn: string[]; vekslKjoenn: (g: string) => void
  aldFra: string; setAldFra: (v: string) => void
  aldTil: string; setAldTil: (v: string) => void
  hFra: string; setHFra: (v: string) => void
  hTil: string; setHTil: (v: string) => void
  fasetter: Partial<Record<Fasett, string[]>>
  veksle: (f: Fasett, v: string) => void
  nullstill: () => void
  antallFiltre: number
  filter: Filter
  treff: Kandidat[]
  tellinger: Record<Fasett, Record<string, number>>
  kjoennTelling: Record<string, number>
}

/**
 * Filtertilstanden. `synligeFasetter` avgjør hvilke fasetter som i det hele
 * tatt kan filtreres på — det åpne galleriet sender inn en snevrere liste enn
 * det innloggede verktøyet (art. 9, se OFFENTLIGE_FASETTER).
 */
export function useCastingFiltre(
  kandidater: Kandidat[],
  synligeFasetter: readonly Fasett[] = FASETTER
): FilterTilstand {
  const [q, setQ] = useState('')
  const [kjoenn, setKjoenn] = useState<string[]>([])
  const [aldFra, setAldFra] = useState('')
  const [aldTil, setAldTil] = useState('')
  const [hFra, setHFra] = useState('')
  const [hTil, setHTil] = useState('')
  const [fasetter, setFasetter] = useState<Partial<Record<Fasett, string[]>>>({})

  const filter: Filter = useMemo(() => ({
    q, gender: kjoenn,
    ageFrom: tall(aldFra), ageTo: tall(aldTil),
    heightFrom: tall(hFra), heightTo: tall(hTil),
    facets: fasetter,
  }), [q, kjoenn, aldFra, aldTil, hFra, hTil, fasetter])

  const treff = useMemo(() => filtrer(kandidater, filter), [kandidater, filter])

  const tellinger = useMemo(() => {
    const ut = {} as Record<Fasett, Record<string, number>>
    for (const f of synligeFasetter) {
      const uten = { ...filter, facets: { ...fasetter, [f]: [] } }
      ut[f] = tellFasett(filtrer(kandidater, uten), f)
    }
    return ut
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kandidater, filter, fasetter, synligeFasetter])

  const kjoennTelling = useMemo(() => {
    const uten = filtrer(kandidater, { ...filter, gender: [] })
    const ut: Record<string, number> = {}
    for (const g of KJOENN) ut[g] = uten.filter((k) => k.gender === g).length
    return ut
  }, [kandidater, filter])

  return {
    q, setQ,
    kjoenn,
    vekslKjoenn: (g) => setKjoenn((p) => (p.includes(g) ? p.filter((x) => x !== g) : [...p, g])),
    aldFra, setAldFra, aldTil, setAldTil, hFra, setHFra, hTil, setHTil,
    fasetter,
    veksle: (f, v) => setFasetter((p) => {
      const naa = p[f] ?? []
      return { ...p, [f]: naa.includes(v) ? naa.filter((x) => x !== v) : [...naa, v] }
    }),
    nullstill: () => {
      setQ(''); setKjoenn([]); setAldFra(''); setAldTil(''); setHFra(''); setHTil('')
      setFasetter({})
    },
    antallFiltre:
      (q.trim() ? 1 : 0) + kjoenn.length +
      (tall(aldFra) != null || tall(aldTil) != null ? 1 : 0) +
      (tall(hFra) != null || tall(hTil) != null ? 1 : 0) +
      Object.values(fasetter).reduce((s, v) => s + (v?.length ?? 0), 0),
    filter, treff, tellinger, kjoennTelling,
  }
}

function Chip({ paa, antall, children, onClick }: {
  paa: boolean; antall?: number; children: React.ReactNode; onClick: () => void
}) {
  const tom = antall === 0 && !paa
  return (
    <button type="button" onClick={onClick} disabled={tom} aria-pressed={paa}
      className="px-3 py-1.5 rounded-full text-sm border transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      style={paa
        ? { borderColor: 'var(--ember-deep)', color: 'var(--ember-deep)', background: 'var(--ember-tint-bg)', fontWeight: 600 }
        : { ...kant, color: 'var(--text-muted, #6B6358)' }}>
      {children}
      {antall !== undefined && <span style={{ opacity: 0.55, marginLeft: 6 }}>{antall}</span>}
    </button>
  )
}

const Etikett = ({ children }: { children: React.ReactNode }) => (
  <span className="text-xs font-semibold uppercase tracking-wide text-[var(--text-faint,#8A8175)] w-24">
    {children}
  </span>
)

export default function CastingFiltre({ tilstand: s, totaltAntall, synligeFasetter = FASETTER, alltidFramme = ['dialects', 'skills'] }: {
  /** Fra useCastingFiltre. Heter ikke `t` — det navnet er oversetterens overalt ellers. */
  tilstand: FilterTilstand
  totaltAntall: number
  synligeFasetter?: readonly Fasett[]
  alltidFramme?: readonly Fasett[]
}) {
  const tr = useTranslations('casting')
  const [utvidet, setUtvidet] = useState(false)

  // En caster starter nesten alltid med kjønn og alder; resten er innsnevring.
  const framme = synligeFasetter.filter((f) => alltidFramme.includes(f))
  const bakLuke = synligeFasetter.filter((f) => !alltidFramme.includes(f))

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <input value={s.q} onChange={(e) => s.setQ(e.target.value)} placeholder={tr('search_ph')}
          className="px-3 py-2 border rounded-lg text-sm flex-1 min-w-[180px]" style={kant} />
        <span className="text-sm text-[var(--text-muted,#6B6358)] tabular-nums">
          {s.treff.length === 0 ? tr('hits_none') : tr('hits', { n: s.treff.length, total: totaltAntall })}
        </span>
        {s.antallFiltre > 0 && (
          <button type="button" onClick={s.nullstill} className="text-sm text-[var(--ember-deep)] hover:underline">
            {tr('clear')}
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-2">
        <Etikett>{tr('f_gender')}</Etikett>
        {KJOENN.map((g) => (
          <Chip key={g} paa={s.kjoenn.includes(g)} antall={s.kjoennTelling[g]} onClick={() => s.vekslKjoenn(g)}>
            {tr(`gender_${g}`)}
          </Chip>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-2">
        <Etikett>{tr('f_age')}</Etikett>
        <input value={s.aldFra} onChange={(e) => s.setAldFra(e.target.value)} placeholder={tr('age_from')} inputMode="numeric"
          className="w-20 px-2 py-1.5 border rounded-lg text-sm" style={kant} />
        <span className="text-[var(--text-faint,#8A8175)]">–</span>
        <input value={s.aldTil} onChange={(e) => s.setAldTil(e.target.value)} placeholder={tr('age_to')} inputMode="numeric"
          className="w-20 px-2 py-1.5 border rounded-lg text-sm" style={kant} />
      </div>

      {framme.map((f) => (
        <div key={f} className="flex flex-wrap items-center gap-2 mb-2">
          <Etikett>{tr(`f_${f}`)}</Etikett>
          {VOKABULAR[f].map((v) => (
            <Chip key={v} paa={(s.fasetter[f] ?? []).includes(v)} antall={s.tellinger[f]?.[v]} onClick={() => s.veksle(f, v)}>
              {tr(`${f}_${v}`)}
            </Chip>
          ))}
        </div>
      ))}

      <button type="button" onClick={() => setUtvidet((v) => !v)}
        className="text-sm text-[var(--ember-deep)] hover:underline mb-3">
        {utvidet ? tr('fewer_filters') : tr('more_filters')}
      </button>

      {utvidet && (
        <div className="rounded-xl border p-4 mb-4" style={{ ...kant, background: 'var(--paper-raised)' }}>
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <Etikett>{tr('f_height')}</Etikett>
            <input value={s.hFra} onChange={(e) => s.setHFra(e.target.value)} placeholder={tr('height_from')} inputMode="numeric"
              className="w-24 px-2 py-1.5 border rounded-lg text-sm" style={kant} />
            <span className="text-[var(--text-faint,#8A8175)]">–</span>
            <input value={s.hTil} onChange={(e) => s.setHTil(e.target.value)} placeholder={tr('height_to')} inputMode="numeric"
              className="w-24 px-2 py-1.5 border rounded-lg text-sm" style={kant} />
          </div>
          {bakLuke.map((f) => (
            <div key={f} className="flex flex-wrap items-center gap-2 mb-2">
              <Etikett>{tr(`f_${f}`)}</Etikett>
              {VOKABULAR[f].map((v) => (
                <Chip key={v} paa={(s.fasetter[f] ?? []).includes(v)} antall={s.tellinger[f]?.[v]} onClick={() => s.veksle(f, v)}>
                  {tr(`${f}_${v}`)}
                </Chip>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/** Én linje som oppsummerer en kandidat: kjønn · spillealder · høyde. */
export function useKandidatlinje() {
  const tr = useTranslations('casting')
  return (k: Kandidat) => {
    const { playingAgeFrom: f, playingAgeTo: tl } = k
    const alder = f != null && tl != null ? tr('plays_age', { from: f, to: tl })
      : f != null ? tr('plays_age_from', { from: f })
      : tl != null ? tr('plays_age_to', { to: tl })
      : k.modelAges.length ? null : tr('unknown_age')
    return [
      k.gender ? tr(`gender_${k.gender}`) : null,
      alder,
      k.heightCm ? `${k.heightCm} ${tr('admin_cm')}` : null,
    ].filter(Boolean).join(' · ')
  }
}
