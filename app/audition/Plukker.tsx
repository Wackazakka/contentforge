'use client'

import { useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import CastingFiltre, { useCastingFiltre, useKandidatlinje } from '@/components/CastingFiltre'
import type { Kandidat } from '@/lib/castingAttributes'

// Castingplukkeren (Lars 20.09.2026).
//
// 🔑 HVORFOR DEN ERSTATTET RUTENETTET: «Når vi har flere hundre å velge mellom
// må vi ha mulighet til å søke.» Et rutenett av portretter slutter å virke rundt
// tjue oppføringer — da leter man ikke lenger, man bare blar.
//
// Filterlinja er delt med det åpne galleriet (components/CastingFiltre), så de
// to flatene av samme bank aldri finner ulike folk. Her er forskjellen at man
// PLUKKER inntil åtte; i galleriet blar man.
//
// Filtreringen skjer LOKALT over hele kandidatsettet (ruta sender det i ett
// svar). En caster klikker seg gjennom mange kombinasjoner på få sekunder;
// et rundturskall per klikk ville gjort utvalget tregt å utforske.
//
// Bevisst, ikke en forglemmelse: allerede valgte skuespillere vises alltid,
// også når de faller utenfor filteret. Ellers forsvinner noen du har krysset
// av, uten et ord — og runden starter med færre enn du trodde.

const kant = { borderColor: 'var(--ds-border, #E2D9C8)' }
const initialer = (n: string) =>
  n.split(/\s+/).filter(Boolean).slice(0, 2).map((d) => d[0]?.toUpperCase() ?? '').join('')

export default function Plukker({ kandidater, valgte, setValgte, totalt, avkuttet, maks = 8 }: {
  kandidater: Kandidat[]
  valgte: string[]
  setValgte: (ids: string[]) => void
  totalt?: number
  avkuttet?: boolean
  maks?: number
}) {
  const t = useTranslations('casting')
  const linje = useKandidatlinje()
  // Det innloggede castingverktøyet ser ALLE fasetter, spilleområde inkludert:
  // samtykket vi har innhentet gjelder nettopp casting. Den åpne katalogen ser
  // et snevrere sett (OFFENTLIGE_FASETTER).
  const s = useCastingFiltre(kandidater)
  const [kunValgte, setKunValgte] = useState(false)

  const synlige = useMemo(() => {
    const iTreff = new Set(s.treff.map((k) => k.id))
    const bortfiltrertValgt = kandidater.filter((k) => valgte.includes(k.id) && !iTreff.has(k.id))
    const alle = [...s.treff, ...bortfiltrertValgt]
    return kunValgte ? alle.filter((k) => valgte.includes(k.id)) : alle
  }, [s.treff, kandidater, valgte, kunValgte])

  const vekslValgt = (id: string) =>
    setValgte(valgte.includes(id) ? valgte.filter((x) => x !== id) : [...valgte, id])

  return (
    <div>
      <CastingFiltre tilstand={s} totaltAntall={kandidater.length} />

      <div className="flex flex-wrap items-center gap-3 mb-3">
        <span className="text-sm font-medium">{t('selected_n', { n: valgte.length })}</span>
        {valgte.length > 0 && (
          <button type="button" onClick={() => setKunValgte((v) => !v)}
            className="text-sm text-[var(--ember-deep)] hover:underline">
            {kunValgte ? t('show_all') : t('show_selected')}
          </button>
        )}
        {/* Uten denne linja blir resten av kortene bare grå, og ingen får vite
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
                  <div className="text-xs text-[var(--text-faint,#8A8175)] mt-0.5">{linje(k)}</div>
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
