import Link from 'next/link'
import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { OFFENTLIGE_FASETTER } from '@/lib/castingAttributes'
import { getTenant, getTenantCanonicalOrigin } from '@/lib/tenantServer'
import { getPublicActor } from '@/lib/publicActors'
import { CenterForgeLogo } from '@/components/CenterForgeLogo'
import { TwinLedgerLogo } from '@/components/TwinLedgerLogo'
import { LangToggle } from '@/components/LangToggle'

// Offentlig visittkort — det en regissør lander på fra katalogen eller en
// delt lenke. Vises kun hvis rettighetshaveren er publisert (is_public) OG
// tilgjengelig på dette domenet. Synlighetsregelen bor i lib/publicActors.ts
// og deles med galleriet, så et kort i katalogen aldri peker på en side som
// ikke finnes.
//
// ═══ REDESIGN 21.09.2026 (Claude Design 5B) ═══
//
// 🔑 FRA SMAL MIDTSTILT SPALTE TIL TO SPALTER. Den gamle siden var et rundt
// portrett over midtstilt tekst — en profilside, ikke et castingkort. Nå:
//
//   · Portrettet er FIRKANTET i 4:5, ikke en sirkel. En sirkel beskjærer
//     nettopp det en caster ser etter.
//   · Castingopplysningene er en TABELL, én rad per linje. De skal kunne
//     skumleses og sammenliknes mot et rollekrav, ikke leses som prosa.
//   · Prøvene står i rekkefølgen hør → se → bilder, og lydprøvene er ÉN liste
//     med ramme, ikke tre kort.
//
// Venstrespalten har `align-self: start` med vilje: den skal ikke strekkes til
// høyden av en lang bio.

export async function generateMetadata({ params }: { params: Promise<{ actorId: string }> }): Promise<Metadata> {
  const { actorId } = await params
  const actor = await getPublicActor(await getTenant(), actorId)
  const t = await getTranslations('actorCard')
  if (!actor) return { title: t('not_found_title') }
  const hva = actor.hasVoice && actor.hasFace
    ? `${t('chip_voice_lc')} ${t('and')} ${t('chip_face_lc')}`
    : actor.hasFace ? t('chip_face_lc') : t('chip_voice_lc')
  const tenant = await getTenant()
  const origin = await getTenantCanonicalOrigin(tenant)
  return {
    title: actor.isDemo ? `${actor.name} — ${t('example_word')}` : `${actor.name} — ${hva}`,
    description: actor.bio?.slice(0, 150) || t('meta_fallback', { name: actor.name }),
    alternates: { canonical: `${origin}/stemme/${actor.id}` },
    // ⚠️ Eksempelprofiler skal ALDRI i søkeindeksen. Merket står på sida, men
    // et søkeresultat viser ikke merket — og et kort som ser ut som en ekte
    // bookbar person er nøyaktig det vi ikke skal lage.
    ...(actor.isDemo ? { robots: { index: false, follow: false } } : {}),
  }
}

const MONO = 'var(--font-cfmono), ui-monospace, monospace'
const DISPLAY = 'var(--font-archivo), system-ui, sans-serif'
const SANS = 'var(--font-hanken), system-ui, sans-serif'
const GUTTER = 'clamp(20px, 4vw, 56px)'

export default async function ActorPresentationPage({ params }: { params: Promise<{ actorId: string }> }) {
  const { actorId } = await params
  const tenant = await getTenant()
  const t = await getTranslations('actorCard')
  const tc = await getTranslations('casting')
  // Tjenester uten rettighetsforvaltning har ingen visittkort å vise — selv om
  // en delt rettighetshaver teknisk sett er tilgjengelig i editoren der.
  const actor = tenant.twinledger_enabled === false ? null : await getPublicActor(tenant, actorId)
  const erTwinLedger = tenant.slug === 'twinledger'

  if (!actor) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--paper)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24, fontFamily: SANS }}>
        <p style={{ color: 'var(--text-muted)', margin: 0 }}>{t('not_found')}</p>
        {tenant.twinledger_enabled !== false && (
          <Link href="/stemmer" style={{ color: 'var(--ember-deep)', fontWeight: 600 }}>{t('all_link')}</Link>
        )}
      </div>
    )
  }

  const { photos, samples } = actor

  // Castingopplysningene som tabellrader. Tomme felt utelates — en rad som
  // sier «Høyde: —» er støy, ikke opplysning.
  const alder = actor.playingAgeFrom != null && actor.playingAgeTo != null
    ? tc('plays_age', { from: actor.playingAgeFrom, to: actor.playingAgeTo })
    : actor.playingAgeFrom != null ? tc('plays_age_from', { from: actor.playingAgeFrom })
    : actor.playingAgeTo != null ? tc('plays_age_to', { to: actor.playingAgeTo })
    : null
  const dialekter = (actor.attributes.dialects ?? []).map((v) => tc(`dialects_${v}`)).join(', ')
  const rader: Array<[string, string]> = [
    ...(actor.gender ? [[tc('f_gender'), tc(`gender_${actor.gender}`)] as [string, string]] : []),
    ...(alder ? [[tc('f_age'), alder.replace(/^\D+/, '')] as [string, string]] : []),
    ...(actor.heightCm ? [[tc('f_height'), `${actor.heightCm} ${tc('admin_cm')}`] as [string, string]] : []),
    ...(dialekter ? [[tc('f_dialects'), dialekter] as [string, string]] : []),
    ...(actor.modelAges.length ? [[tc('f_models'),
      actor.modelAges.length === 1 ? tc('has_models_one') : tc('has_models', { n: actor.modelAges.length })] as [string, string]] : []),
  ]
  // Ferdigheter og øvrige merker står som etiketter under tabellen — de er en
  // liste, ikke et oppslag med to sider.
  const merker = OFFENTLIGE_FASETTER
    .filter((f) => f !== 'dialects')
    .flatMap((f) => (actor.attributes[f] ?? []).map((v) => tc(`${f}_${v}`)))

  return (
    <div style={{ minHeight: '100vh', background: 'var(--paper)', color: 'var(--ink)', fontFamily: SANS }}>
      <style>{`
        .ac-split { display: grid; grid-template-columns: 420px 1fr; border-top: 1px solid var(--ds-border); }
        .ac-left { border-right: 1px solid var(--ds-border); background: var(--paper-sunken); align-self: start; }
        .ac-photos { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
        @media (max-width: 899px) {
          .ac-split { grid-template-columns: 1fr; }
          .ac-left { border-right: 0; border-bottom: 1px solid var(--ds-border); }
          .ac-photos { grid-template-columns: repeat(2, 1fr); }
        }
      `}</style>

      <header style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', padding: `18px ${GUTTER}`, background: 'var(--paper-raised)', borderBottom: '1px solid var(--ds-border)' }}>
        <Link href="/" style={{ textDecoration: 'none' }}>
          {erTwinLedger ? <TwinLedgerLogo size={22} /> : <CenterForgeLogo size={26} wordmarkSize={17} />}
        </Link>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '10px 18px', flexWrap: 'wrap', fontSize: 15 }}>
          <Link href="/stemmer" style={{ color: 'var(--ink-soft)', textDecoration: 'none' }}>{t('back')}</Link>
          {tenant.show_language_toggle !== false && <LangToggle />}
        </div>
      </header>

      {/* Eksempelprofil: si det FØR bildet og navnet. Et visittkort som ser
          ekte ut, oppdaget som uekte etterpå, koster mer tillit enn en tom
          hylle gjør. */}
      {actor.isDemo && (
        <div style={{ background: 'var(--band)', borderBottom: '1px solid var(--ds-border-strong)', padding: `14px ${GUTTER}`, fontSize: 14 }}>
          <strong style={{ fontWeight: 600 }}>{t('example_lead')}</strong>{' '}
          <span style={{ color: 'var(--ink-soft)' }}>{t('example_body', { name: actor.name })}</span>
        </div>
      )}

      <div className="ac-split">
        <div className="ac-left">
          {photos[0] ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photos[0]} alt={actor.name} style={{ width: '100%', aspectRatio: '4/5', objectFit: 'cover', objectPosition: 'top', display: 'block' }} />
          ) : (
            <div style={{ aspectRatio: '4/5', background: '#E4E4E0', display: 'flex', alignItems: 'flex-end', padding: 18 }}>
              <span style={{ fontFamily: MONO, fontSize: 10.5, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-faint)' }}>{tc('portrait')}</span>
            </div>
          )}
          <div style={{ padding: 24 }}>
            {rader.length > 0 && (
              <>
                <p style={{ fontFamily: MONO, fontSize: 10.5, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--text-faint)', margin: '0 0 14px' }}>{tc('admin_h2')}</p>
                {rader.map(([k, v], i) => (
                  <div key={k} style={{
                    display: 'flex', justifyContent: 'space-between', gap: 16, padding: '10px 0', fontSize: 14.5,
                    borderTop: `1px solid ${i === 0 ? 'var(--ds-border-strong)' : 'var(--ds-border)'}`,
                    ...(i === rader.length - 1 ? { borderBottom: '1px solid var(--ds-border-strong)' } : {}),
                  }}>
                    <span style={{ color: 'var(--text-muted)' }}>{k}</span>
                    <span style={{ color: 'var(--ink)', fontVariantNumeric: 'tabular-nums', textAlign: 'right' }}>{v}</span>
                  </div>
                ))}
              </>
            )}
            {merker.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 16 }}>
                {merker.map((m) => (
                  <span key={m} style={{ fontSize: 13, color: 'var(--ink-soft)', border: '1px solid var(--ds-border-strong)', background: 'var(--paper-raised)', padding: '5px 10px' }}>{m}</span>
                ))}
              </div>
            )}
            <p style={{ fontFamily: MONO, fontSize: 10.5, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-faint)', marginTop: 20, marginBottom: 0 }}>
              {t('managed_by', { tenant: actor.managedBy })}
            </p>
          </div>
        </div>

        <div style={{ padding: `clamp(28px, 3.5vw, 44px) ${GUTTER}` }}>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
            {actor.hasVoice && <Merke>{t('chip_voice')}</Merke>}
            {actor.hasFace && <Merke>{t('chip_face')}</Merke>}
          </div>
          <h1 style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 'clamp(34px, 4.4vw, 52px)', letterSpacing: '-0.035em', lineHeight: 1.04, margin: '0 0 18px' }}>{actor.name}</h1>
          {actor.bio && (
            <p style={{ fontSize: 17, lineHeight: 1.6, color: 'var(--ink-soft)', maxWidth: '38em', margin: '0 0 32px', whiteSpace: 'pre-line' }}>{actor.bio}</p>
          )}

          {/* HØR først. En stemme vurderes med ørene, og lydprøvene er én
              liste med ramme — ikke tre kort som later som de er tre saker. */}
          {samples.length > 0 && (
            <section style={{ marginBottom: 36 }}>
              <Overskrift>{t('listen')}</Overskrift>
              <div style={{ border: '1px solid var(--ds-border-strong)', background: 'var(--paper-raised)' }}>
                {samples.map((url, i) => (
                  <div key={url} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', borderTop: i === 0 ? 'none' : '1px solid var(--ds-border)' }}>
                    <span style={{ fontFamily: MONO, fontSize: 11, color: 'var(--text-faint)', flex: 'none', width: 62 }}>{t('sample_n', { n: i + 1 })}</span>
                    <audio controls preload="none" src={url} style={{ flex: 1, height: 34 }} />
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* SE. Film veier tyngst for en regissør: stillbilder sier ingenting
              om hvordan ansiktet oppfører seg i bevegelse. */}
          {actor.videos.length > 0 && (
            <section style={{ marginBottom: 36 }}>
              <Overskrift>{t('watch')}</Overskrift>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {actor.videos.map((url, i) => (
                  <video key={url} controls preload="metadata" playsInline src={url}
                    style={{ width: '100%', aspectRatio: '16/9', background: 'var(--ink)', border: '1px solid var(--ds-border-strong)', display: 'block' }}
                    aria-label={t('film_alt', { n: i + 1, name: actor.name })} />
                ))}
              </div>
              {/* Opplysning, ikke forbehold: kunden lisensierer MODELLEN, ikke
                  et bildearkiv. Står under filmen fordi det er der man ser at
                  materialet er generert. */}
              {actor.hasFace && (
                <p style={{ fontSize: 13.5, lineHeight: 1.55, color: 'var(--text-muted)', margin: '12px 0 0', maxWidth: '40em' }}>{t('generated_note')}</p>
              )}
            </section>
          )}

          {photos.length > 1 && (
            <section style={{ marginBottom: 36 }}>
              <Overskrift>{t('photos')}</Overskrift>
              <div className="ac-photos">
                {photos.slice(1).map((url) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={url} src={url} alt={actor.name} loading="lazy" style={{ width: '100%', aspectRatio: '1/1', objectFit: 'cover', border: '1px solid var(--ds-border)', display: 'block' }} />
                ))}
              </div>
            </section>
          )}

          {/* Veien videre. På en eksempelprofil peker steget mot REKRUTTERING,
              ikke mot salg: det er det eneste ærlige så lenge ingen kan bookes.
              Flata er venstrestilt med knappene til høyre — ikke midtstilt. */}
          <div style={{ border: '1px solid var(--ds-border-strong)', background: 'var(--paper-raised)', padding: 28, display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ flex: '1 1 300px' }}>
              <h2 style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 19, letterSpacing: '-0.02em', margin: '0 0 6px' }}>
                {actor.isDemo ? t('demo_cta_title') : t('cta_title', { first: actor.name.split(' ')[0] })}
              </h2>
              <p style={{ fontSize: 14.5, lineHeight: 1.55, color: 'var(--ink-soft)', margin: 0 }}>
                {actor.isDemo ? t('demo_cta_body') : t('cta_body', {
                  tenant: tenant.app_name,
                  asset: actor.hasVoice ? t('cta_voice') : t('cta_face'),
                  first: actor.name.split(' ')[0],
                })}
              </p>
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <Link href={actor.isDemo ? '/bli-stemme' : '/register'} style={knapp('ember')}>
                {actor.isDemo ? t('demo_cta_join') : t('cta_signup')}
              </Link>
              <Link href="/stemmer" style={knapp('ramme')}>
                {actor.isDemo ? t('demo_cta_back') : t('cta_more')}
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function Overskrift({ children }: { children: React.ReactNode }) {
  return (
    <h2 style={{ fontFamily: MONO, fontSize: 10.5, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--text-faint)', margin: '0 0 12px' }}>
      {children}
    </h2>
  )
}

function Merke({ children }: { children: React.ReactNode }) {
  return (
    <span style={{
      fontFamily: MONO, fontSize: 9.5, fontWeight: 600, letterSpacing: '0.12em',
      textTransform: 'uppercase', padding: '5px 8px',
      color: 'var(--ember-deep)', background: 'var(--ember-tint-bg)',
    }}>{children}</span>
  )
}

const knapp = (art: 'ember' | 'ramme'): React.CSSProperties => ({
  padding: '12px 22px',
  fontFamily: DISPLAY,
  fontWeight: 700,
  fontSize: 15,
  textDecoration: 'none',
  whiteSpace: 'nowrap',
  ...(art === 'ember'
    ? { background: 'var(--ember-deep)', color: 'var(--on-ember)', border: '1px solid var(--ember-deep)' }
    : { background: 'transparent', color: 'var(--ink)', border: '1px solid var(--ds-border-strong)' }),
})
