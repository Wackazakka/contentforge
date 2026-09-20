import Link from 'next/link'
import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { getTenant } from '@/lib/tenantServer'
import { getPublicActor } from '@/lib/publicActors'
import { CenterForgeLogo } from '@/components/CenterForgeLogo'
import { LangToggle } from '@/components/LangToggle'

// Offentlig presentasjonsside for en skuespiller — visittkort til innsalg:
// bilder, lydprøver og bio, i eierens (byråets) egen drakt. Vises kun hvis
// skuespilleren er publisert (is_public) OG tilgjengelig på dette domenet.
// Synlighetsregelen bor i lib/publicActors.ts og deles med galleriet
// (/stemmer), så et kort i galleriet aldri peker på en side som ikke finnes.

export async function generateMetadata({ params }: { params: Promise<{ actorId: string }> }): Promise<Metadata> {
  const { actorId } = await params
  const actor = await getPublicActor(await getTenant(), actorId)
  const t = await getTranslations('actorCard')
  if (!actor) return { title: t('not_found_title') }
  const hva = actor.hasVoice && actor.hasFace
    ? `${t('chip_voice_lc')} ${t('and')} ${t('chip_face_lc')}`
    : actor.hasFace ? t('chip_face_lc') : t('chip_voice_lc')
  return {
    title: actor.isDemo ? `${actor.name} — ${t('example_word')}` : `${actor.name} — ${hva}`,
    description: actor.bio?.slice(0, 150) || t('meta_fallback', { name: actor.name }),
  }
}

export default async function ActorPresentationPage({ params }: { params: Promise<{ actorId: string }> }) {
  const { actorId } = await params
  const tenant = await getTenant()
  const t = await getTranslations('actorCard')
  // Tjenester uten rettighetsforvaltning har ingen visittkort å vise — selv
  // om en delt skuespiller teknisk sett er tilgjengelig i editoren der.
  const actor = tenant.twinledger_enabled === false ? null : await getPublicActor(tenant, actorId)

  if (!actor) {
    return (
      <div className="min-h-screen bg-[var(--paper)] flex flex-col items-center justify-center px-4 gap-4">
        <p className="text-[var(--text-muted,#6B6358)]">{t('not_found')}</p>
        {tenant.twinledger_enabled !== false && (
          <Link href="/stemmer" className="text-[var(--ember-deep)] hover:underline font-medium">{t('all_link')}</Link>
        )}
      </div>
    )
  }

  const { photos, samples } = actor
  const kant = { borderColor: 'var(--ds-border, #E2D9C8)' }

  return (
    <div className="min-h-screen bg-[var(--paper)] text-[var(--ink,#1C1A16)]">
      <header className="max-w-2xl mx-auto px-4 pt-6 pb-2 flex items-center gap-4">
        <Link href="/" style={{ textDecoration: 'none' }}><CenterForgeLogo size={26} wordmarkSize={17} /></Link>
        <Link href="/stemmer" className="ml-auto text-sm text-[var(--text-muted,#6B6358)] hover:text-[var(--ember-deep)]">{t('back')}</Link>
        {tenant.show_language_toggle !== false && <LangToggle />}
      </header>

      <div className="max-w-2xl mx-auto px-4 py-10">
        {/* Eksempelprofil: si det FØR bildet og navnet. Et visittkort som ser
            ekte ut, oppdaget som uekte etterpå, koster mer tillit enn en tom
            hylle gjør. */}
        {actor.isDemo && (
          <div className="rounded-xl border p-4 mb-8 text-sm" style={{ ...kant, background: 'var(--paper-raised)' }}>
            <strong className="font-semibold">{t('example_lead')}</strong>{' '}
            <span className="text-[var(--ink-soft,#4A443B)]">
              {t('example_body', { name: actor.name })}
            </span>
          </div>
        )}

        {/* Hovedbilde + navn */}
        <div className="text-center mb-10">
          {photos[0] && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photos[0]} alt={actor.name}
              className="w-40 h-40 rounded-full object-cover mx-auto mb-6 border-4 shadow-lg" style={{ borderColor: 'var(--paper-raised)' }} />
          )}
          <h1 className="text-4xl font-bold mb-3" style={{ letterSpacing: '-0.02em' }}>{actor.name}</h1>
          <div className="flex items-center justify-center gap-2 mb-2 text-[11px] font-semibold uppercase tracking-wide">
            {actor.hasVoice && <span className="px-2.5 py-1 rounded-full" style={{ background: 'var(--ember-tint-bg)', color: 'var(--ember-deep)' }}>{t('chip_voice')}</span>}
            {actor.hasFace && <span className="px-2.5 py-1 rounded-full" style={{ background: 'var(--ember-tint-bg)', color: 'var(--ember-deep)' }}>{t('chip_face')}</span>}
          </div>
          <p className="text-sm uppercase tracking-widest text-[var(--text-faint,#8A8175)]">{t('managed_by', { tenant: actor.managedBy })}</p>
          {/* Ansiktssiden leverer genererte bilder — det er ikke et forbehold,
              det ER varen: kunden lisensierer MODELLEN, ikke et bildearkiv.
              Derfor står dette på alle ansiktsprofiler, ikke bare eksempler,
              og som opplysning framfor advarsel. (AI-åpenheten skal uansett
              følge en syntetisk frontfigur overalt.) */}
          {actor.hasFace && (
            <p className="text-sm text-[var(--text-muted,#6B6358)] mt-3 max-w-md mx-auto">
              {t('generated_note')}
            </p>
          )}
        </div>

        {/* Bio */}
        {actor.bio && (
          <p className="text-lg leading-relaxed text-[var(--ink-soft,#4A443B)] mb-10 whitespace-pre-line">{actor.bio}</p>
        )}

        {/* Film — øverst av prøvene. En regissør vurderer hvordan ansiktet
            oppfører seg i bevegelse og om stemmen og ansiktet hører sammen;
            stillbilder svarer ikke på noen av delene. */}
        {actor.videos.length > 0 && (
          <div className="mb-10">
            <h2 className="font-semibold mb-3">{t('watch')}</h2>
            <div className="space-y-4">
              {actor.videos.map((url, i) => (
                <video key={url} controls preload="metadata" playsInline src={url}
                  className="w-full rounded-xl border" style={{ ...kant, background: '#000' }}
                  aria-label={t('film_alt', { n: i + 1, name: actor.name })} />
              ))}
            </div>
          </div>
        )}

        {/* Lydprøver */}
        {samples.length > 0 && (
          <div className="mb-10">
            <h2 className="font-semibold mb-3">{t('listen')}</h2>
            <div className="space-y-3">
              {samples.map((url, i) => (
                <div key={url} className="rounded-xl border p-4" style={{ ...kant, background: 'var(--paper-raised)' }}>
                  <div className="text-xs text-[var(--text-faint,#8A8175)] mb-2">{t('sample_n', { n: i + 1 })}</div>
                  <audio controls preload="none" src={url} className="w-full" />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Flere bilder */}
        {photos.length > 1 && (
          <div className="mb-10">
            <h2 className="font-semibold mb-3">{t('photos')}</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {photos.slice(1).map((url) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={url} src={url} alt={actor.name} loading="lazy" className="w-full aspect-square object-cover rounded-xl border" style={kant} />
              ))}
            </div>
          </div>
        )}

        {/* Veien videre — et visittkort uten neste steg er en blindvei. På en
            eksempelprofil peker steget mot REKRUTTERING, ikke mot salg: det er
            det eneste ærlige neste steget så lenge ingen kan bookes. */}
        {actor.isDemo ? (
          <div className="rounded-xl border p-6 text-center" style={{ ...kant, background: 'var(--paper-raised)' }}>
            <h2 className="font-semibold text-lg mb-1">{t('demo_cta_title')}</h2>
            <p className="text-sm text-[var(--ink-soft,#4A443B)] mb-4 max-w-md mx-auto">
              {t('demo_cta_body')}
            </p>
            <div className="flex gap-3 justify-center flex-wrap">
              <Link href="/bli-stemme" className="px-5 py-2.5 rounded-lg font-semibold text-[var(--on-ember)] bg-[var(--ember-deep)] hover:opacity-90">{t('demo_cta_join')}</Link>
              <Link href="/stemmer" className="px-5 py-2.5 rounded-lg font-semibold border hover:border-[var(--ember-deep)]" style={kant}>{t('demo_cta_back')}</Link>
            </div>
          </div>
        ) : (
          <div className="rounded-xl border p-6 text-center" style={{ ...kant, background: 'var(--paper-raised)' }}>
            <h2 className="font-semibold text-lg mb-1">{t('cta_title', { first: actor.name.split(' ')[0] })}</h2>
            <p className="text-sm text-[var(--ink-soft,#4A443B)] mb-4 max-w-md mx-auto">
              {t('cta_body', { tenant: tenant.app_name, asset: actor.hasVoice ? t('cta_voice') : t('cta_face'), first: actor.name.split(' ')[0] })}
            </p>
            <div className="flex gap-3 justify-center flex-wrap">
              <Link href="/register" className="px-5 py-2.5 rounded-lg font-semibold text-[var(--on-ember)] bg-[var(--ember-deep)] hover:opacity-90">{t('cta_signup')}</Link>
              <Link href="/stemmer" className="px-5 py-2.5 rounded-lg font-semibold border hover:border-[var(--ember-deep)]" style={kant}>{t('cta_more')}</Link>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
