'use client'

import { useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import { filtrer, type Kandidat } from '@/lib/castingAttributes'

// Plukkeren i auditionoppsettet (Claude Design 6A, 21.09.2026).
//
// 🔑 ET RUTENETT MED FASTE KOLONNER, IKKE KORT AV ULIK HØYDE. Hele Audition
// hviler på at alt unntatt skuespilleren er likt — varierer rammen,
// sammenlikner regissøren bilder i stedet for mennesker. Et rutenett av kort
// som spriker i høyde bryter med det allerede i utvalget.
//
// Søkefeltet søker på NAVN, DIALEKT OG SPILLEALDER i ett felt. En caster
// skriver «bergensk 40» før hen finner fram til et filterpanel, og da skal det
// virke.
//
// Lista klippes til åtte med «Vis alle N». Et fullt rutenett skyver
// prissammendraget og «Hør dem lese» under skjermkanten.

const MONO = 'var(--font-cfmono), ui-monospace, monospace'
const DISPLAY = 'var(--font-archivo), system-ui, sans-serif'
const SYNLIGE = 8

export default function Plukker({ kandidater, valgte, setValgte, maks = 8 }: {
  kandidater: Kandidat[]
  valgte: string[]
  setValgte: (ids: string[]) => void
  maks?: number
}) {
  const t = useTranslations('audition')
  const tc = useTranslations('casting')
  const [q, setQ] = useState('')
  const [alle, setAlle] = useState(false)

  // Kompakt linje: spillealder · dialekt. Kjønn og høyde er utelatt her med
  // vilje — i en fire-kolonners rute er det de to som skiller stemmer.
  const linje = (k: Kandidat) => {
    const alder = k.playingAgeFrom != null && k.playingAgeTo != null ? `${k.playingAgeFrom}–${k.playingAgeTo}`
      : k.playingAgeFrom != null ? `${k.playingAgeFrom}+`
      : k.playingAgeTo != null ? `–${k.playingAgeTo}` : null
    const dialekt = (k.attributes.dialects ?? []).map((v) => tc(`dialects_${v}`))[0] ?? null
    return [alder, dialekt].filter(Boolean).join(' · ')
  }

  // Fritekst treffer navn, dialekt og alder i ett. `filtrer` tar bare navn, så
  // resten legges på her — den er delt med katalogen og skal ikke vite om
  // dette feltet.
  const treff = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!s) return kandidater
    const tall = s.match(/\d+/)?.[0]
    return filtrer(kandidater, {}).filter((k) => {
      if (k.name.toLowerCase().includes(s)) return true
      if ((k.attributes.dialects ?? []).some((d) => tc(`dialects_${d}`).toLowerCase().includes(s))) return true
      if (tall) {
        const n = Number(tall)
        const fra = k.playingAgeFrom ?? 0, til = k.playingAgeTo ?? 120
        if (n >= fra && n <= til) return true
      }
      return false
    })
  }, [kandidater, q, tc])

  const vis = alle ? treff : treff.slice(0, SYNLIGE)
  const veksl = (id: string) =>
    setValgte(valgte.includes(id) ? valgte.filter((x) => x !== id) : [...valgte, id])

  return (
    <div>
      <style>{`
        .au-pick { display: grid; grid-template-columns: repeat(4, 1fr); border-top: 1px solid var(--ds-border-strong); border-left: 1px solid var(--ds-border-strong); }
        .au-pick > button { border-right: 1px solid var(--ds-border-strong); border-bottom: 1px solid var(--ds-border-strong); }
        @media (max-width: 720px) { .au-pick { grid-template-columns: repeat(2, 1fr); } }
      `}</style>

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 10, flexWrap: 'wrap' }}>
        <span style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 17, letterSpacing: '-0.02em' }}>{t('who_h')}</span>
        <span style={{ fontFamily: MONO, fontSize: 11, color: 'var(--text-faint)', marginLeft: 'auto' }}>
          {t('of_max', { n: valgte.length, max: maks })}
        </span>
      </div>

      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('search_ph')}
        style={{ width: '100%', padding: '12px 14px', fontSize: 14.5, border: '1px solid var(--ds-border-strong)', background: 'var(--paper-raised)', color: 'var(--ink)', marginBottom: 14, fontFamily: 'inherit' }} />

      {treff.length === 0 ? (
        <p style={{ fontSize: 14, color: 'var(--text-muted)', margin: 0 }}>{tc('no_hits_body')}</p>
      ) : (
        <>
          <div className="au-pick">
            {vis.map((k) => {
              const paa = valgte.includes(k.id)
              const sperret = !paa && valgte.length >= maks
              return (
                <button key={k.id} type="button" onClick={() => veksl(k.id)} disabled={sperret} aria-pressed={paa}
                  style={{
                    textAlign: 'left', padding: 0, cursor: sperret ? 'default' : 'pointer',
                    background: paa ? 'var(--ember-tint-bg)' : 'var(--paper-raised)',
                    opacity: sperret ? 0.4 : 1, border: 'none', font: 'inherit',
                  }}>
                  {k.photo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={k.photo} alt="" loading="lazy" style={{ width: '100%', aspectRatio: '4/3', objectFit: 'cover', objectPosition: 'top', display: 'block' }} />
                  ) : (
                    <div style={{ aspectRatio: '4/3', background: '#E4E4E0' }} />
                  )}
                  <div style={{ padding: '10px 12px 12px' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: DISPLAY, fontWeight: 700, fontSize: 14.5, color: 'var(--ink)', letterSpacing: '-0.01em' }}>
                      {k.name}
                      {paa && <span style={{ color: 'var(--ember-deep)' }} aria-hidden="true">✓</span>}
                    </span>
                    <span style={{ display: 'block', fontSize: 12.5, color: 'var(--text-muted)', marginTop: 2 }}>{linje(k)}</span>
                    {k.isDemo && (
                      <span style={{ display: 'inline-block', marginTop: 6, fontFamily: MONO, fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-muted)', border: '1px solid var(--ds-border-strong)', padding: '2px 5px' }}>
                        {t('chip_test')}
                      </span>
                    )}
                  </div>
                </button>
              )
            })}
          </div>
          {treff.length > SYNLIGE && (
            <button type="button" onClick={() => setAlle((v) => !v)}
              style={{ background: 'none', border: 'none', padding: '12px 0 0', cursor: 'pointer', font: 'inherit', fontSize: 14, color: 'var(--ember-deep)' }}>
              {alle ? tc('show_fewer') : t('show_all_n', { n: treff.length })}
            </button>
          )}
        </>
      )}

      {/* Uten denne linja blir resten av rutene bare grå, og ingen får vite
          hvorfor. En deaktivert flate som ikke forklarer seg, ser ut som feil. */}
      {valgte.length >= maks && (
        <p style={{ fontSize: 13.5, color: 'var(--ember-deep)', margin: '12px 0 0' }}>{tc('max_reached', { n: maks })}</p>
      )}
    </div>
  )
}
