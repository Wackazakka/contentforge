'use client'

import { useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import {
  FASETTER, KREVER_SAMTYKKE, KJOENN, VOKABULAR, filtrer, tellFasett,
  type Fasett, type Filter, type Kandidat,
} from '@/lib/castingAttributes'

// Castingplukkeren (Lars 20.09.2026).
//
// 🔑 HVORFOR DEN ERSTATTET RUTENETTET: «Når vi har flere hundre å velge mellom
// må vi ha mulighet til å søke.» Et rutenett av portretter slutter å virke rundt
// tjue oppføringer — da leter man ikke lenger, man bare blar.
//
// Filtreringen skjer LOKALT over hele kandidatsettet (ruta sender det i ett
// svar). En caster klikker seg gjennom mange kombinasjoner på få sekunder;
// et rundturskall per klikk ville gjort utvalget tregt å utforske.
//
// To ting som er bevisste, ikke forglemmelser:
//   · Tellingen på hver chip er regnet fra de ØVRIGE filtrene, ikke fra hele
//     banken. Et tall som lover treff man ikke får, er verre enn ingen tall.
//   · Allerede valgte skuespillere vises alltid, også når de faller utenfor
//     filteret. Ellers forsvinner noen du har krysset av, uten et ord — og
//     runden starter med færre enn du trodde.

const kant = { borderColor: 'var(--ds-border, #E2D9C8)' }
const initialer = (n: string) =>
  n.split(/\s+/).filter(Boolean).slice(0, 2).map((d) => d[0]?.toUpperCase() ?? '').join('')

function tall(v: string): number | null {
  const s = v.trim()
  if (!s) return null
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

function Chip({ paa, antall, children, onClick }: {
  paa: boolean; antall?: number; children: React.ReactNode; onClick: () => void
}) {
  // Null treff = deaktivert, ikke skjult. Skjuler man den, ser det ut som
  // egenskapen ikke finnes; deaktivert sier «ingen slike, med disse filtrene».
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

export default function Plukker({ kandidater, valgte, setValgte, totalt, avkuttet, maks = 8 }: {
  kandidater: Kandidat[]
  valgte: string[]
  setValgte: (ids: string[]) => void
  totalt?: number
  avkuttet?: boolean
  maks?: number
}) {
  const t = useTranslations('casting')
  const [q, setQ] = useState('')
  const [kjoenn, setKjoenn] = useState<string[]>([])
  const [aldFra, setAldFra] = useState('')
  const [aldTil, setAldTil] = useState('')
  const [hFra, setHFra] = useState('')
  const [hTil, setHTil] = useState('')
  const [fasetter, setFasetter] = useState<Partial<Record<Fasett, string[]>>>({})
  const [utvidet, setUtvidet] = useState(false)
  const [kunValgte, setKunValgte] = useState(false)

  const filter: Filter = useMemo(() => ({
    q, gender: kjoenn,
    ageFrom: tall(aldFra), ageTo: tall(aldTil),
    heightFrom: tall(hFra), heightTo: tall(hTil),
    facets: fasetter,
  }), [q, kjoenn, aldFra, aldTil, hFra, hTil, fasetter])

  const treff = useMemo(() => filtrer(kandidater, filter), [kandidater, filter])

  // Valgte som filteret har skjøvet ut — de skal fortsatt vises.
  const synlige = useMemo(() => {
    const iTreff = new Set(treff.map((k) => k.id))
    const bortfiltrertValgt = kandidater.filter((k) => valgte.includes(k.id) && !iTreff.has(k.id))
    const alle = [...treff, ...bortfiltrertValgt]
    return kunValgte ? alle.filter((k) => valgte.includes(k.id)) : alle
  }, [treff, kandidater, valgte, kunValgte])

  // Tellingen per chip: alt UNNTATT den fasetten selv. Slår man av «bergensk»,
  // skal tallet på «nordnorsk» si hva man faktisk får.
  const tellinger = useMemo(() => {
    const ut = {} as Record<Fasett, Record<string, number>>
    for (const f of FASETTER) {
      const uten = { ...filter, facets: { ...fasetter, [f]: [] } }
      ut[f] = tellFasett(filtrer(kandidater, uten), f)
    }
    return ut
  }, [kandidater, filter, fasetter])

  const kjoennTelling = useMemo(() => {
    const uten = filtrer(kandidater, { ...filter, gender: [] })
    const ut: Record<string, number> = {}
    for (const g of KJOENN) ut[g] = uten.filter((k) => k.gender === g).length
    return ut
  }, [kandidater, filter])

  const veksle = (f: Fasett, v: string) => setFasetter((p) => {
    const naa = p[f] ?? []
    return { ...p, [f]: naa.includes(v) ? naa.filter((x) => x !== v) : [...naa, v] }
  })
  const vekslKjoenn = (g: string) =>
    setKjoenn((p) => (p.includes(g) ? p.filter((x) => x !== g) : [...p, g]))
  const vekslValgt = (id: string) =>
    setValgte(valgte.includes(id) ? valgte.filter((x) => x !== id) : [...valgte, id])

  const antallFiltre =
    (q.trim() ? 1 : 0) + kjoenn.length +
    (tall(aldFra) != null || tall(aldTil) != null ? 1 : 0) +
    (tall(hFra) != null || tall(hTil) != null ? 1 : 0) +
    Object.values(fasetter).reduce((s, v) => s + (v?.length ?? 0), 0)

  const nullstill = () => {
    setQ(''); setKjoenn([]); setAldFra(''); setAldTil(''); setHFra(''); setHTil('')
    setFasetter({}); setKunValgte(false)
  }

  // Hovedfiltrene står alltid framme; resten bak «Flere filtre». En caster
  // starter nesten alltid med kjønn og alder.
  const alltid: Fasett[] = ['dialects', 'skills']
  const bakLuke = FASETTER.filter((f) => !alltid.includes(f))

  const alderstekst = (k: Kandidat) => {
    const { playingAgeFrom: f, playingAgeTo: tl } = k
    if (f != null && tl != null) return t('plays_age', { from: f, to: tl })
    if (f != null) return t('plays_age_from', { from: f })
    if (tl != null) return t('plays_age_to', { to: tl })
    return k.modelAges.length ? null : t('unknown_age')
  }

  return (
    <div>
      {/* Søk + hovedfiltre */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('search_ph')}
          className="px-3 py-2 border rounded-lg text-sm flex-1 min-w-[180px]" style={kant} />
        <span className="text-sm text-[var(--text-muted,#6B6358)] tabular-nums">
          {treff.length === 0 ? t('hits_none') : t('hits', { n: treff.length, total: kandidater.length })}
        </span>
        {antallFiltre > 0 && (
          <button type="button" onClick={nullstill} className="text-sm text-[var(--ember-deep)] hover:underline">
            {t('clear')}
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-[var(--text-faint,#8A8175)] w-24">{t('f_gender')}</span>
        {KJOENN.map((g) => (
          <Chip key={g} paa={kjoenn.includes(g)} antall={kjoennTelling[g]} onClick={() => vekslKjoenn(g)}>
            {t(`gender_${g}`)}
          </Chip>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-[var(--text-faint,#8A8175)] w-24">{t('f_age')}</span>
        <input value={aldFra} onChange={(e) => setAldFra(e.target.value)} placeholder={t('age_from')} inputMode="numeric"
          className="w-20 px-2 py-1.5 border rounded-lg text-sm" style={kant} />
        <span className="text-[var(--text-faint,#8A8175)]">–</span>
        <input value={aldTil} onChange={(e) => setAldTil(e.target.value)} placeholder={t('age_to')} inputMode="numeric"
          className="w-20 px-2 py-1.5 border rounded-lg text-sm" style={kant} />
      </div>

      {alltid.map((f) => (
        <div key={f} className="flex flex-wrap items-center gap-2 mb-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-[var(--text-faint,#8A8175)] w-24">{t(`f_${f}`)}</span>
          {VOKABULAR[f].map((v) => (
            <Chip key={v} paa={(fasetter[f] ?? []).includes(v)} antall={tellinger[f][v]} onClick={() => veksle(f, v)}>
              {t(`${f}_${v}`)}
            </Chip>
          ))}
        </div>
      ))}

      <button type="button" onClick={() => setUtvidet((v) => !v)}
        className="text-sm text-[var(--ember-deep)] hover:underline mb-3">
        {utvidet ? t('fewer_filters') : t('more_filters')}
      </button>

      {utvidet && (
        <div className="rounded-xl border p-4 mb-4" style={{ ...kant, background: 'var(--paper-raised)' }}>
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-[var(--text-faint,#8A8175)] w-24">{t('f_height')}</span>
            <input value={hFra} onChange={(e) => setHFra(e.target.value)} placeholder={t('height_from')} inputMode="numeric"
              className="w-24 px-2 py-1.5 border rounded-lg text-sm" style={kant} />
            <span className="text-[var(--text-faint,#8A8175)]">–</span>
            <input value={hTil} onChange={(e) => setHTil(e.target.value)} placeholder={t('height_to')} inputMode="numeric"
              className="w-24 px-2 py-1.5 border rounded-lg text-sm" style={kant} />
          </div>
          {bakLuke.map((f) => (
            <div key={f} className="flex flex-wrap items-center gap-2 mb-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-[var(--text-faint,#8A8175)] w-24">{t(`f_${f}`)}</span>
              {VOKABULAR[f].map((v) => (
                <Chip key={v} paa={(fasetter[f] ?? []).includes(v)} antall={tellinger[f][v]} onClick={() => veksle(f, v)}>
                  {t(`${f}_${v}`)}
                </Chip>
              ))}
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3 mb-3">
        <span className="text-sm font-medium">{t('selected_n', { n: valgte.length })}</span>
        {valgte.length > 0 && (
          <button type="button" onClick={() => setKunValgte((v) => !v)}
            className="text-sm text-[var(--ember-deep)] hover:underline">
            {kunValgte ? t('show_all') : t('show_selected')}
          </button>
        )}
        {/* Uten denne linja blir resten av kortene bare gra, og ingen far vite
            hvorfor. En deaktivert flate som ikke forklarer seg, ser ut som en
            feil. */}
        {valgte.length >= maks && (
          <span className="text-sm text-amber-700">{t('max_reached', { n: maks })}</span>
        )}
      </div>

      {avkuttet && (
        <p className="text-xs text-[var(--text-faint,#8A8175)] mb-3">
          {t('truncated', { n: kandidater.length, total: totalt ?? kandidater.length })}
        </p>
      )}

      {synlige.length === 0 ? (
        <p className="text-sm text-[var(--text-muted,#6B6358)] mb-4">{t('no_hits_body')}</p>
      ) : (
        <div className="grid gap-3 mb-5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))' }}>
          {synlige.map((k) => {
            const paa = valgte.includes(k.id)
            const alder = alderstekst(k)
            // Fullt utvalg låser ikke de valgte — man skal alltid kunne ta noen av.
            const sperret = !paa && valgte.length >= maks
            return (
              <button key={k.id} type="button" onClick={() => vekslValgt(k.id)} disabled={sperret}
                aria-pressed={paa}
                className="rounded-xl border overflow-hidden text-left transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ borderColor: paa ? 'var(--ember-deep)' : 'var(--ds-border, #E2D9C8)', borderWidth: paa ? 2 : 1 }}>
                {k.photo
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={k.photo} alt="" loading="lazy" className="w-full aspect-[4/3] object-cover object-top" />
                  : <div className="w-full aspect-[4/3] flex items-center justify-center text-3xl font-bold"
                      style={{ background: 'var(--ember-tint-bg)', color: 'var(--ember-deep)' }} aria-hidden="true">
                      {initialer(k.name)}
                    </div>}
                <div className="px-3 py-2">
                  <div className="text-sm font-medium flex items-center gap-2 flex-wrap">
                    {k.name}
                    {k.isDemo && (
                      <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded-full border"
                        style={{ ...kant, color: 'var(--text-muted, #6B6358)' }}>Test</span>
                    )}
                  </div>
                  <div className="text-xs text-[var(--text-faint,#8A8175)] mt-0.5">
                    {[
                      k.gender ? t(`gender_${k.gender}`) : null,
                      alder,
                      k.heightCm ? `${k.heightCm} ${t('admin_cm')}` : null,
                    ].filter(Boolean).join(' · ')}
                  </div>
                  {k.modelAges.length > 0 && (
                    <div className="text-xs text-[var(--ember-deep)] mt-0.5">
                      {k.modelAges.length === 1 ? t('has_models_one') : t('has_models', { n: k.modelAges.length })}
                    </div>
                  )}
                </div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

// Eksportert så skjemaet hos forvalteren kan gjenbruke samme port uten å
// duplisere lista over art. 9-fasetter.
export { KREVER_SAMTYKKE }
