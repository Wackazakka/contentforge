'use client'

import { useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import CastingFiltre, { useCastingFiltre, useKandidatlinje } from '@/components/CastingFiltre'
import { OFFENTLIGE_FASETTER, type Kandidat } from '@/lib/castingAttributes'
import type { PublicActor } from '@/lib/publicActors'

// Filter + avspilling. Én lyd om gangen: starter du en ny prøve, stopper den
// forrige — tolv spillere som går oppå hverandre er ingen måte å velge stemme på.
//
// CASTINGFILTRENE (Lars 20.09.2026) står nå også her, ikke bare i Audition.
// Plukkeren bak innlogging hjelper ikke produsenten som kommer utenfra, og det
// er nettopp hen destinasjonen er for. Samme filterlinje, samme vokabular,
// samme matching — to flater av én bank skal ikke finne ulike folk.
//
// ⚠️ Med ÉN forskjell: spilleområde (art. 9) filtreres det ikke på her. Se
// OFFENTLIGE_FASETTER. Feltet kommer heller ikke ut fra publicActors.

type Aktiva = 'alle' | 'stemme' | 'ansikt'

const initialer = (navn: string) => navn.split(/\s+/).filter(Boolean).slice(0, 2).map((d) => d[0]?.toUpperCase() ?? '').join('')

/** Galleriets rad sett som castingkandidat — samme form filteret bruker overalt. */
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

  // Tilbake til de fulle radene — filteret arbeider på kandidatformen, men
  // kortet trenger bio, lydprøver og lenke.
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
    el.onended = () => setSpiller((s2) => (s2 === a.id ? null : s2))
    el.onerror = () => setSpiller((s2) => (s2 === a.id ? null : s2))
    audio.current = el
    setSpiller(a.id)
    el.play().catch(() => setSpiller(null))
  }

  // Aktiva-skillet vises bare når det faktisk skiller noe.
  const visAktiva = antall.stemme > 0 && antall.ansikt > 0 && (antall.stemme < antall.alle || antall.ansikt < antall.alle)

  // Castingfiltrene har ingenting å filtrere på før noen har fylt feltene, og
  // en filterlinje der hver eneste chip er grå, ser ut som en ødelagt side.
  // Da viser vi den ikke — men vi later heller ikke som om utvalget er filtrert.
  const harCastingdata = useMemo(
    () => kandidater.some((k) => k.gender || k.playingAgeFrom != null || k.playingAgeTo != null
      || k.heightCm != null || Object.keys(k.attributes).length > 0),
    [kandidater])

  return (
    <>
      {visAktiva && (
        <div className="flex gap-2 mb-6 flex-wrap" role="tablist" aria-label={t('filter_label')}>
          {([['alle', t('filter_all')], ['stemme', t('filter_voice')], ['ansikt', t('filter_face')]] as Array<[Aktiva, string]>).map(([k, label]) => {
            const paa = aktiva === k
            return (
              <button key={k} role="tab" aria-selected={paa} onClick={() => setAktiva(k)}
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

      {harCastingdata && (
        <div className="mb-8">
          <CastingFiltre tilstand={s} totaltAntall={kandidater.length} synligeFasetter={OFFENTLIGE_FASETTER} />
        </div>
      )}

      {synlige.length === 0 ? (
        <p className="text-[var(--ink-soft,#4A443B)] mb-6">{tc('no_hits_body')}</p>
      ) : (
        <div className="grid gap-5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))' }}>
          {synlige.map((a) => {
            const erPaa = spiller === a.id
            const under = linje(somKandidat(a))
            return (
              <article key={a.id} className="rounded-xl border overflow-hidden flex flex-col"
                style={{ background: 'var(--paper-raised)', borderColor: 'var(--ds-border, #E2D9C8)' }}>
                <Link href={`/stemme/${a.id}`} className="block" aria-label={a.name}>
                  {a.photos[0] ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    // object-top: portretter har ansiktet i øvre halvdel, og en
                    // sentrert 4:3-beskjæring kapper det bort. I en castingkatalog
                    // ER ansiktet varen.
                    <img src={a.photos[0]} alt={a.name} loading="lazy" className="w-full aspect-[4/3] object-cover object-top" />
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
                      {/* Eksempelmerket er bevisst nøytralt, ikke ember: det er en
                          opplysning om at kortet ikke er en bookbar person, ikke
                          en egenskap ved stemmen. */}
                      {a.isDemo && (
                        <span className="px-2 py-0.5 rounded-full border" style={{ color: 'var(--text-muted, #6B6358)', borderColor: 'var(--ds-border, #E2D9C8)' }}>{t('chip_example')}</span>
                      )}
                      {a.hasVoice && <span className="px-2 py-0.5 rounded-full" style={{ background: 'var(--ember-tint-bg)', color: 'var(--ember-deep)' }}>{t('chip_voice')}</span>}
                      {a.hasFace && <span className="px-2 py-0.5 rounded-full" style={{ background: 'var(--ember-tint-bg)', color: 'var(--ember-deep)' }}>{t('chip_face')}</span>}
                    </div>
                  </div>
                  {/* Castinglinja: det en regissør leser først, over bioen. */}
                  {under && <p className="text-xs text-[var(--text-faint,#8A8175)] -mt-1">{under}</p>}
                  {a.bio && (
                    <p className="text-sm text-[var(--ink-soft,#4A443B)]" style={{ display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{a.bio}</p>
                  )}
                  <div className="mt-auto pt-2 flex items-center gap-3">
                    {a.samples[0] ? (
                      <button onClick={() => toggle(a)} aria-pressed={erPaa}
                        className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-semibold text-[var(--on-ember)] bg-[var(--ember-deep)] hover:opacity-90">
                        <span aria-hidden="true">{erPaa ? '■' : '▶'}</span>{erPaa ? t('stop') : t('play')}
                      </button>
                    ) : (
                      <span className="text-xs text-[var(--text-faint,#8A8175)]">{t('no_sample')}</span>
                    )}
                    <Link href={`/stemme/${a.id}`} className="text-sm font-medium text-[var(--ember-deep)] hover:underline ml-auto">{t('see_more')}</Link>
                  </div>
                </div>
              </article>
            )
          })}
        </div>
      )}
    </>
  )
}
