'use client'

import { useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { useCastingFiltre, useKandidatlinje } from '@/components/CastingFiltre'
import CastingSidebar from '@/components/CastingSidebar'
import { OFFENTLIGE_FASETTER, type Kandidat } from '@/lib/castingAttributes'
import type { PublicActor } from '@/lib/publicActors'

// Katalogen (Claude Design 5A, 21.09.2026).
//
// 🔑 FILTRENE FLYTTET TIL EN KOLONNE. De lå over rutenettet og viste hver
// eneste fasett med antall 0 — nullene var det tydeligste på sida. I kolonnen
// skjules det som ikke finnes; se CastingSidebar.
//
// Kortene er firkantede, uten skygge, med AVSPILLING I KORTET: en regissør
// skal kunne høre stemmen uten å åpne profilen. Sirkelen er det eneste runde
// elementet designet tillater.
//
// Filterlogikken deles fortsatt med Audition (useCastingFiltre) — de to
// flatene skal aldri finne ulike folk. Bare chromet er forskjellig.
//
// ⚠️ Spilleområde (art. 9) filtreres det ikke på her, og feltet kommer ikke ut
// fra publicActors i det hele tatt. Se OFFENTLIGE_FASETTER.

type Aktiva = 'alle' | 'stemme' | 'ansikt'

const MONO = 'var(--font-cfmono), ui-monospace, monospace'
const DISPLAY = 'var(--font-archivo), system-ui, sans-serif'

// Bølgeformen er dekor, ikke data — vi har ikke amplituden. Et fast mønster
// er ærligere enn tilfeldige høyder som later som de betyr noe.
const BOLGE = [40, 75, 55, 90, 45, 70, 35, 85, 50, 65, 30, 80, 45, 60, 38]

function somKandidat(a: PublicActor): Kandidat {
  return {
    id: a.id, name: a.name, photo: a.photos[0] ?? null, isDemo: a.isDemo,
    gender: (a.gender as Kandidat['gender']) ?? null,
    playingAgeFrom: a.playingAgeFrom, playingAgeTo: a.playingAgeTo,
    heightCm: a.heightCm, attributes: a.attributes, modelAges: a.modelAges,
  }
}

export default function GalleriClient({ actors }: { actors: PublicActor[] }) {
  const t = useTranslations('gallery')
  const tc = useTranslations('casting')
  const linje = useKandidatlinje()
  const [aktiva, setAktiva] = useState<Aktiva>('alle')
  const [spiller, setSpiller] = useState<string | null>(null)
  const audio = useRef<HTMLAudioElement | null>(null)

  const antall = useMemo(() => ({
    alle: actors.length,
    stemme: actors.filter((a) => a.hasVoice).length,
    ansikt: actors.filter((a) => a.hasFace).length,
  }), [actors])

  // Stemme/ansikt-skillet kommer FØR castingfiltrene: det avgjør hva slags
  // vare man ser på, ikke hvem som passer rollen.
  const etterAktiva = useMemo(
    () => actors.filter((a) => aktiva === 'alle' || (aktiva === 'stemme' ? a.hasVoice : a.hasFace)),
    [actors, aktiva])

  const kandidater = useMemo(() => etterAktiva.map(somKandidat), [etterAktiva])
  const s = useCastingFiltre(kandidater, OFFENTLIGE_FASETTER)

  const synlige = useMemo(() => {
    const treff = new Set(s.treff.map((k) => k.id))
    return etterAktiva.filter((a) => treff.has(a.id))
  }, [etterAktiva, s.treff])

  const toggle = (a: PublicActor) => {
    const url = a.samples[0]
    if (!url) return
    if (spiller === a.id) { audio.current?.pause(); setSpiller(null); return }
    audio.current?.pause()
    const el = new Audio(url)
    el.onended = () => setSpiller((x) => (x === a.id ? null : x))
    el.onerror = () => setSpiller((x) => (x === a.id ? null : x))
    audio.current = el
    setSpiller(a.id)
    el.play().catch(() => setSpiller(null))
  }

  const visAktiva = antall.stemme > 0 && antall.ansikt > 0 && (antall.stemme < antall.alle || antall.ansikt < antall.alle)

  // Har ingen fylt castingfelt, har kolonnen ingenting å vise. Da sier vi det
  // rett ut i stedet for å la en tom kolonne stå og se ødelagt ut.
  const harCastingdata = useMemo(
    () => kandidater.some((k) => k.gender || k.playingAgeFrom != null || k.playingAgeTo != null
      || k.heightCm != null || Object.keys(k.attributes).length > 0),
    [kandidater])

  return (
    <>
      <style>{`
        .gal-layout { display: grid; grid-template-columns: 250px 1fr; gap: 0; border-top: 1px solid var(--ds-border); margin-top: 28px; }
        .gal-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 20px; margin-top: 24px; }
        .gal-card { background: var(--paper-raised); border: 1px solid var(--ds-border-strong); transition: border-color 0.15s ease; }
        .gal-card:hover { border-color: var(--ink); }
        .gal-play { width: 26px; height: 26px; border-radius: 50%; background: var(--ember-deep); color: var(--on-ember); display: flex; align-items: center; justify-content: center; font-size: 10px; border: 0; cursor: pointer; flex: none; }
        .gal-play[disabled] { background: transparent; border: 1px solid var(--ds-border-strong); color: var(--text-faint); cursor: default; }
        /* Kolonnen legger seg over rutenettet når det ikke er plass til begge. */
        @media (max-width: 859px) {
          .gal-layout { grid-template-columns: 1fr; }
          .gal-layout aside { border-right: 0; border-bottom: 1px solid var(--ds-border); }
        }
      `}</style>

      {visAktiva && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }} role="tablist" aria-label={t('filter_label')}>
          {([['alle', t('filter_all')], ['stemme', t('filter_voice')], ['ansikt', t('filter_face')]] as Array<[Aktiva, string]>).map(([k, label]) => {
            const paa = aktiva === k
            return (
              <button key={k} role="tab" aria-selected={paa} onClick={() => setAktiva(k)}
                style={{
                  padding: paa ? '7px 14px' : '6px 14px', fontSize: 13.5, cursor: 'pointer',
                  fontFamily: DISPLAY, fontWeight: 600,
                  color: paa ? 'var(--on-ember)' : 'var(--ink-soft)',
                  background: paa ? 'var(--ink)' : 'var(--paper-raised)',
                  border: paa ? 'none' : '1px solid var(--ds-border-strong)',
                }}>
                {label} <span style={{ opacity: 0.6, fontWeight: 400 }}>{antall[k]}</span>
              </button>
            )
          })}
        </div>
      )}

      <div className="gal-layout">
        {harCastingdata ? (
          <CastingSidebar alle={kandidater} tilstand={s} fasetter={OFFENTLIGE_FASETTER} />
        ) : (
          <aside style={{ borderRight: '1px solid var(--ds-border)', background: 'var(--paper-sunken)', padding: '26px 28px 40px' }}>
            <p style={{ fontSize: 13.5, lineHeight: 1.55, color: 'var(--text-muted)', margin: 0 }}>{tc('filters_empty')}</p>
          </aside>
        )}

        <div style={{ padding: '22px 0 40px 28px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
            <span style={{ fontFamily: MONO, fontSize: 10.5, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--text-faint)' }}>
              {s.treff.length === 0 ? tc('hits_none') : tc('hits', { n: s.treff.length, total: kandidater.length })}
            </span>
            <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontFamily: MONO, fontSize: 10.5, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--text-faint)' }}>{tc('sort')}</span>
              <span style={{ fontSize: 14, color: 'var(--ink)', borderBottom: '1.5px solid var(--ink)', paddingBottom: 1 }}>{tc('sort_recent')}</span>
            </span>
          </div>

          {synlige.length === 0 ? (
            <p style={{ color: 'var(--ink-soft)', marginTop: 24 }}>{tc('no_hits_body')}</p>
          ) : (
            <div className="gal-grid">
              {synlige.map((a) => {
                const erPaa = spiller === a.id
                const under = linje(somKandidat(a))
                return (
                  <article key={a.id} className="gal-card">
                    <Link href={`/stemme/${a.id}`} style={{ display: 'block' }} aria-label={a.name}>
                      {a.photos[0] ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        // object-top: i en castingkatalog ER ansiktet varen, og
                        // en sentrert 4:3-beskjæring kapper det bort.
                        <img src={a.photos[0]} alt={a.name} loading="lazy" style={{ width: '100%', aspectRatio: '4/3', objectFit: 'cover', objectPosition: 'top', display: 'block' }} />
                      ) : (
                        <div style={{ aspectRatio: '4/3', background: '#E4E4E0', display: 'flex', alignItems: 'flex-end', padding: 12 }}>
                          <span style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-faint)' }}>{tc('portrait')}</span>
                        </div>
                      )}
                    </Link>
                    <div style={{ padding: '14px 16px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <h3 style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 17, color: 'var(--ink)', margin: 0, letterSpacing: '-0.01em' }}>
                        <Link href={`/stemme/${a.id}`} style={{ color: 'inherit', textDecoration: 'none' }}>{a.name}</Link>
                      </h3>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {a.isDemo && <Merke nøytral>{t('chip_example')}</Merke>}
                        {a.hasVoice && <Merke>{t('chip_voice')}</Merke>}
                        {a.hasFace && <Merke>{t('chip_face')}</Merke>}
                      </div>
                      {under && <p style={{ fontSize: 13.5, color: 'var(--text-muted)', margin: 0 }}>{under}</p>}

                      {/* Avspilling i kortet: en regissør skal kunne høre
                          stemmen uten å åpne profilen. */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4, paddingTop: 12, borderTop: '1px solid var(--ds-border)' }}>
                        <button className="gal-play" onClick={() => toggle(a)} disabled={!a.samples[0]}
                          aria-pressed={erPaa} aria-label={a.samples[0] ? (erPaa ? t('stop') : t('play')) : t('no_sample')}>
                          <span aria-hidden="true">{erPaa ? '■' : '▶'}</span>
                        </button>
                        {a.samples[0] ? (
                          <>
                            <span style={{ display: 'flex', alignItems: 'flex-end', gap: 2.5, height: 18, flex: 1 }} aria-hidden="true">
                              {BOLGE.map((h, i) => (
                                <span key={i} style={{ width: 2.5, height: `${h}%`, background: erPaa ? 'var(--ember-deep)' : 'var(--ds-border-strong)' }} />
                              ))}
                            </span>
                            <Link href={`/stemme/${a.id}`} style={{ fontFamily: MONO, fontSize: 11, color: 'var(--ember-deep)', textDecoration: 'none', flex: 'none' }}>
                              {t('see_more')}
                            </Link>
                          </>
                        ) : (
                          <span style={{ fontSize: 12.5, color: 'var(--text-faint)' }}>{t('no_sample')}</span>
                        )}
                      </div>
                    </div>
                  </article>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </>
  )
}

/** Firkantet mono-etikett. Eksempelmerket er nøytralt, ikke ember: det er en
 *  opplysning om at kortet ikke er en bookbar person, ikke en egenskap. */
function Merke({ children, nøytral }: { children: React.ReactNode; nøytral?: boolean }) {
  return (
    <span style={{
      fontFamily: MONO, fontSize: 9.5, fontWeight: 600, letterSpacing: '0.12em',
      textTransform: 'uppercase', padding: '4px 7px',
      color: nøytral ? 'var(--text-muted)' : 'var(--ember-deep)',
      background: nøytral ? 'transparent' : 'var(--ember-tint-bg)',
      border: nøytral ? '1px solid var(--ds-border-strong)' : 'none',
    }}>{children}</span>
  )
}
