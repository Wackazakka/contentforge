'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { KJOENN, VOKABULAR, tellFasett, filtrer, type Fasett, type Kandidat } from '@/lib/castingAttributes'
import type { FilterTilstand } from '@/components/CastingFiltre'

// Filterkolonnen i den åpne katalogen (Claude Design 5A, 21.09.2026).
//
// 🔑 HVORFOR EN KOLONNE OG IKKE CHIPS PÅ TVERS: chipsradene lå over rutenettet
// og viste hver eneste fasett med antall 0. Nullene var det tydeligste
// signalet på sida — ikke katalogen, men at hylla er tom. I en kolonne kan
// fasettene i stedet FORSVINNE når de ikke finnes.
//
// Regelen er tredelt, og forskjellen mellom de to siste er hele poenget:
//   · Finnes verdien ikke i banken i det hele tatt → skjules helt.
//   · Finnes den, men gir 0 treff med de andre filtrene → vises dempet, så
//     man ser HVORFOR den ikke er der.
//   · Finnes ingen verdier i en fasett → hele fasetten forsvinner.
//
// Lange lister klippes til fem med «Vis alle ti». Ti dialekter i en 250px
// kolonne skyver alt annet under skjermkanten.

const MONO = 'var(--font-cfmono), ui-monospace, monospace'
const SYNLIGE_FORST = 5

function Etikett({ children }: { children: React.ReactNode }) {
  return (
    <p style={{ fontFamily: MONO, fontSize: 10.5, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--text-faint)', margin: '0 0 10px' }}>
      {children}
    </p>
  )
}

/** Verdier som finnes i banken i det hele tatt — uavhengig av gjeldende filtre. */
function finnesIBanken(alle: Kandidat[], f: Fasett): string[] {
  const c = tellFasett(alle, f)
  return VOKABULAR[f].filter((v) => c[v] > 0)
}

export default function CastingSidebar({ alle, tilstand: s, fasetter }: {
  /** Hele kandidatsettet, ufiltrert. Avgjør hva som i det hele tatt finnes. */
  alle: Kandidat[]
  tilstand: FilterTilstand
  fasetter: readonly Fasett[]
}) {
  const t = useTranslations('casting')
  const [utvidet, setUtvidet] = useState<Record<string, boolean>>({})

  // Kjønn står alltid først og som piller — det er filteret alle bruker.
  const kjoennFinnes = KJOENN.filter((g) => alle.some((k) => k.gender === g))

  return (
    <aside style={{
      borderRight: '1px solid var(--ds-border)', background: 'var(--paper-sunken)',
      padding: '26px 28px 40px', display: 'flex', flexDirection: 'column', gap: 26,
    }}>
      {kjoennFinnes.length > 0 && (
        <div>
          <Etikett>{t('f_gender')}</Etikett>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {kjoennFinnes.map((g) => {
              const paa = s.kjoenn.includes(g)
              return (
                <button key={g} type="button" onClick={() => s.vekslKjoenn(g)} aria-pressed={paa}
                  style={{
                    fontSize: 13.5, padding: paa ? '6px 12px' : '5px 12px', cursor: 'pointer',
                    color: paa ? 'var(--on-ember)' : 'var(--ink-soft)',
                    background: paa ? 'var(--ink)' : 'var(--paper-raised)',
                    border: paa ? 'none' : '1px solid var(--ds-border-strong)',
                  }}>
                  {t(`gender_${g}`)}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Spillealder som intervall, ikke en liste med aldre. Stripa viser hvor
          i spennet 0–90 utvalget ligger, så tallene har en form å leses mot. */}
      <div>
        <Etikett>{t('f_age')}</Etikett>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <span style={{ flex: 1, height: 3, background: 'var(--ds-border-strong)', position: 'relative', display: 'block' }}>
            <span style={{
              position: 'absolute', top: 0, bottom: 0, background: 'var(--ember-deep)',
              left: `${Math.min(100, Math.max(0, (Number(s.aldFra) || 0) / 90 * 100))}%`,
              right: `${Math.min(100, Math.max(0, 100 - (Number(s.aldTil) || 90) / 90 * 100))}%`,
            }} />
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <input value={s.aldFra} onChange={(e) => s.setAldFra(e.target.value)} inputMode="numeric"
            placeholder={t('age_from')} aria-label={t('age_from')}
            style={{ width: 56, padding: '6px 8px', fontSize: 13, border: '1px solid var(--ds-border-strong)', background: 'var(--paper-raised)', color: 'var(--ink)' }} />
          <span style={{ color: 'var(--text-faint)' }}>–</span>
          <input value={s.aldTil} onChange={(e) => s.setAldTil(e.target.value)} inputMode="numeric"
            placeholder={t('age_to')} aria-label={t('age_to')}
            style={{ width: 56, padding: '6px 8px', fontSize: 13, border: '1px solid var(--ds-border-strong)', background: 'var(--paper-raised)', color: 'var(--ink)' }} />
        </div>
      </div>

      {fasetter.map((f) => {
        const finnes = finnesIBanken(alle, f)
        if (finnes.length === 0) return null
        // Tellingen regnes fra de ØVRIGE filtrene, ikke fra hele banken: et
        // tall som lover treff man ikke får, er verre enn ingen tall.
        const tell = tellFasett(filtrer(alle, { ...s.filter, facets: { ...s.fasetter, [f]: [] } }), f)
        const apen = utvidet[f]
        const vis = apen ? finnes : finnes.slice(0, SYNLIGE_FORST)
        return (
          <div key={f}>
            <Etikett>{t(`f_${f}`)}</Etikett>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7, fontSize: 14, color: 'var(--ink-soft)' }}>
              {vis.map((v) => {
                const paa = (s.fasetter[f] ?? []).includes(v)
                const tom = tell[v] === 0 && !paa
                return (
                  <button key={v} type="button" onClick={() => s.veksle(f, v)} aria-pressed={paa}
                    style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
                      gap: 8, background: 'none', border: 'none', padding: 0, cursor: tom ? 'default' : 'pointer',
                      textAlign: 'left', font: 'inherit',
                      color: paa ? 'var(--ember-deep)' : 'var(--ink-soft)',
                      fontWeight: paa ? 600 : 400, opacity: tom ? 0.4 : 1,
                    }}>
                    <span style={paa ? { borderBottom: '1.5px solid var(--ember-deep)' } : undefined}>{t(`${f}_${v}`)}</span>
                    <span style={{ fontFamily: MONO, fontSize: 12, color: 'var(--text-faint)', fontVariantNumeric: 'tabular-nums' }}>{tell[v] ?? 0}</span>
                  </button>
                )
              })}
              {finnes.length > SYNLIGE_FORST && (
                <button type="button" onClick={() => setUtvidet((p) => ({ ...p, [f]: !apen }))}
                  style={{ background: 'none', border: 'none', padding: 0, marginTop: 2, cursor: 'pointer', font: 'inherit', fontSize: 13, color: 'var(--ember-deep)', textAlign: 'left' }}>
                  {apen ? t('show_fewer') : t('show_all_n', { n: finnes.length })}
                </button>
              )}
            </div>
          </div>
        )
      })}

      {s.antallFiltre > 0 && (
        <button type="button" onClick={s.nullstill}
          style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', font: 'inherit', fontSize: 13.5, color: 'var(--ember-deep)', textAlign: 'left' }}>
          {t('clear')}
        </button>
      )}
    </aside>
  )
}
