import Link from 'next/link'
import type { Metadata } from 'next'
import { getTenant } from '@/lib/tenantServer'
import { getPublicActor } from '@/lib/publicActors'
import { CenterForgeLogo } from '@/components/CenterForgeLogo'

// Offentlig presentasjonsside for en skuespiller — visittkort til innsalg:
// bilder, lydprøver og bio, i eierens (byråets) egen drakt. Vises kun hvis
// skuespilleren er publisert (is_public) OG tilgjengelig på dette domenet.
// Synlighetsregelen bor i lib/publicActors.ts og deles med galleriet
// (/stemmer), så et kort i galleriet aldri peker på en side som ikke finnes.

export async function generateMetadata({ params }: { params: Promise<{ actorId: string }> }): Promise<Metadata> {
  const { actorId } = await params
  const actor = await getPublicActor(await getTenant(), actorId)
  if (!actor) return { title: 'Ikke funnet' }
  const hva = actor.hasVoice && actor.hasFace ? 'stemme og ansikt' : actor.hasFace ? 'ansikt' : 'stemme'
  return {
    title: `${actor.name} — ${hva}`,
    description: actor.bio?.slice(0, 150) || `Hør og se ${actor.name}.`,
  }
}

export default async function ActorPresentationPage({ params }: { params: Promise<{ actorId: string }> }) {
  const { actorId } = await params
  const tenant = await getTenant()
  const actor = await getPublicActor(tenant, actorId)

  if (!actor) {
    return (
      <div className="min-h-screen bg-[var(--paper)] flex flex-col items-center justify-center px-4 gap-4">
        <p className="text-[var(--text-muted,#6B6358)]">Denne siden finnes ikke.</p>
        {tenant.twinledger_enabled !== false && (
          <Link href="/stemmer" className="text-[var(--ember-deep)] hover:underline font-medium">Se alle stemmer og ansikter →</Link>
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
        <Link href="/stemmer" className="ml-auto text-sm text-[var(--text-muted,#6B6358)] hover:text-[var(--ember-deep)]">← Alle stemmer og ansikter</Link>
      </header>

      <div className="max-w-2xl mx-auto px-4 py-10">
        {/* Hovedbilde + navn */}
        <div className="text-center mb-10">
          {photos[0] && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photos[0]} alt={actor.name}
              className="w-40 h-40 rounded-full object-cover mx-auto mb-6 border-4 shadow-lg" style={{ borderColor: 'var(--paper-raised)' }} />
          )}
          <h1 className="text-4xl font-bold mb-3" style={{ letterSpacing: '-0.02em' }}>{actor.name}</h1>
          <div className="flex items-center justify-center gap-2 mb-2 text-[11px] font-semibold uppercase tracking-wide">
            {actor.hasVoice && <span className="px-2.5 py-1 rounded-full" style={{ background: 'var(--ember-tint-bg)', color: 'var(--ember-deep)' }}>Stemme</span>}
            {actor.hasFace && <span className="px-2.5 py-1 rounded-full" style={{ background: 'var(--ember-tint-bg)', color: 'var(--ember-deep)' }}>Ansikt</span>}
          </div>
          <p className="text-sm uppercase tracking-widest text-[var(--text-faint,#8A8175)]">Forvaltes av {actor.managedBy}</p>
        </div>

        {/* Bio */}
        {actor.bio && (
          <p className="text-lg leading-relaxed text-[var(--ink-soft,#4A443B)] mb-10 whitespace-pre-line">{actor.bio}</p>
        )}

        {/* Lydprøver */}
        {samples.length > 0 && (
          <div className="mb-10">
            <h2 className="font-semibold mb-3">Hør stemmen</h2>
            <div className="space-y-3">
              {samples.map((url, i) => (
                <div key={url} className="rounded-xl border p-4" style={{ ...kant, background: 'var(--paper-raised)' }}>
                  <div className="text-xs text-[var(--text-faint,#8A8175)] mb-2">Prøve {i + 1}</div>
                  <audio controls preload="none" src={url} className="w-full" />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Flere bilder */}
        {photos.length > 1 && (
          <div className="mb-10">
            <h2 className="font-semibold mb-3">Bilder</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {photos.slice(1).map((url) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={url} src={url} alt={actor.name} loading="lazy" className="w-full aspect-square object-cover rounded-xl border" style={kant} />
              ))}
            </div>
          </div>
        )}

        {/* Veien videre — et visittkort uten neste steg er en blindvei */}
        <div className="rounded-xl border p-6 text-center" style={{ ...kant, background: 'var(--paper-raised)' }}>
          <h2 className="font-semibold text-lg mb-1">Vil du bruke {actor.name.split(' ')[0]} i din produksjon?</h2>
          <p className="text-sm text-[var(--ink-soft,#4A443B)] mb-4 max-w-md mx-auto">
            Opprett en konto hos {tenant.app_name}, så ligger {actor.hasVoice ? 'stemmen' : 'ansiktet'} klar i verktøyet.
            {' '}{actor.name.split(' ')[0]} får betalt for hver bruk, og alt føres i en hovedbok begge parter kan se.
          </p>
          <div className="flex gap-3 justify-center flex-wrap">
            <Link href="/register" className="px-5 py-2.5 rounded-lg font-semibold text-[var(--on-ember)] bg-[var(--ember-deep)] hover:opacity-90">Opprett konto</Link>
            <Link href="/stemmer" className="px-5 py-2.5 rounded-lg font-semibold border hover:border-[var(--ember-deep)]" style={kant}>Se flere</Link>
          </div>
        </div>
      </div>
    </div>
  )
}
