import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { getTenant } from '@/lib/tenantServer'
import { getPublicActors } from '@/lib/publicActors'
import { CenterForgeLogo } from '@/components/CenterForgeLogo'
import GalleriClient from './GalleriClient'

// Galleriet (Lars 17/9): stedet en som IKKE er kunde kan se og høre stemmene og
// ansiktene i banken. Før dette fantes bare visittkort man måtte få lenken til,
// og stemmemenyen i editoren — som krever konto. Forsiden lovet stemmer ingen
// kunne høre.
//
// Viser kun det skuespilleren selv har publisert, og kun det som er
// tilgjengelig på dette domenet (lib/publicActors.ts). Ingen priser: de er
// byråets forhold, og avhenger av kjeden kunden kommer inn gjennom.

export async function generateMetadata(): Promise<Metadata> {
  const tenant = await getTenant()
  return {
    title: `Stemmer og ansikter — ${tenant.app_name}`,
    description: `Hør stemmene og se ansiktene ${tenant.app_name} forvalter. Ekte mennesker, lisensiert bruk, betalt for hver gang.`,
  }
}

export default async function StemmerPage() {
  const tenant = await getTenant()
  // Tjenester uten rettighetsforvaltning (f.eks. Standard Ropert) har ingen bank å vise.
  if (tenant.twinledger_enabled === false) notFound()
  const actors = await getPublicActors(tenant)

  return (
    <div className="min-h-screen bg-[var(--paper)] text-[var(--ink,#1C1A16)]">
      <header className="max-w-5xl mx-auto px-6 pt-6 pb-5 flex items-center gap-4 flex-wrap">
        <Link href="/" style={{ textDecoration: 'none' }}><CenterForgeLogo size={28} wordmarkSize={18} /></Link>
        <div className="ml-auto flex items-center gap-5 text-sm">
          <Link href="/bli-stemme" className="text-[var(--text-muted,#6B6358)] hover:text-[var(--ink,#1C1A16)]">Bli en stemme</Link>
          <Link href="/login" className="text-[var(--text-muted,#6B6358)] hover:text-[var(--ink,#1C1A16)]">Logg inn</Link>
        </div>
      </header>
      <hr style={{ border: 0, height: 1, background: 'var(--ds-border, #E2D9C8)' }} />

      <main className="max-w-5xl mx-auto px-6 py-12">
        <p className="text-xs font-semibold tracking-[0.16em] uppercase text-[var(--text-faint,#8A8175)] mb-3">{tenant.app_name}</p>
        <h1 className="text-4xl font-bold mb-3" style={{ letterSpacing: '-0.02em' }}>Stemmer og ansikter</h1>
        <p className="text-lg text-[var(--ink-soft,#4A443B)] max-w-2xl mb-10">
          Ekte mennesker som har sagt ja til at stemmen eller ansiktet deres kan brukes i din produksjon —
          og som får betalt hver gang det skjer. Hør prøvene, og gå inn på den du vil vite mer om.
        </p>

        {actors.length === 0 ? (
          <div className="rounded-xl border p-8 max-w-xl" style={{ background: 'var(--paper-raised)', borderColor: 'var(--ds-border, #E2D9C8)' }}>
            <h2 className="font-semibold text-lg mb-2">Utvalget er på vei</h2>
            <p className="text-[var(--ink-soft,#4A443B)] mb-5">
              Ingen har publisert visittkortet sitt ennå. De første stemmene legges ut her så snart de er klare.
            </p>
            <div className="flex gap-3 flex-wrap">
              <Link href="/bli-stemme" className="px-5 py-2.5 rounded-lg font-semibold text-[var(--on-ember)] bg-[var(--ember-deep)] hover:opacity-90">Bli en stemme i banken</Link>
              <Link href="/" className="px-5 py-2.5 rounded-lg font-semibold border hover:border-[var(--ember-deep)]" style={{ borderColor: 'var(--ds-border, #E2D9C8)' }}>Til forsiden</Link>
            </div>
          </div>
        ) : (
          <GalleriClient actors={actors} />
        )}

        <div className="mt-16 pt-8 text-sm text-[var(--text-muted,#6B6358)] flex flex-wrap gap-x-8 gap-y-3 justify-between" style={{ borderTop: '1px solid var(--ds-border, #E2D9C8)' }}>
          <span>Vil du bruke en av dem? <Link href="/register" className="text-[var(--ember-deep)] hover:underline font-medium">Opprett konto</Link> — stemmene ligger klare i verktøyet.</span>
          <span>Er du skuespiller? <Link href="/bli-stemme" className="text-[var(--ember-deep)] hover:underline font-medium">Bli en stemme i banken</Link>.</span>
        </div>
      </main>
    </div>
  )
}
