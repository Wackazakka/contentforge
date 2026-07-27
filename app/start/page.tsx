'use client'

import Link from 'next/link'
import { CenterForgeLogo } from '@/components/CenterForgeLogo'

// Offentlig inngang: lag video uten konto. Draft-flyten er sesjonsløs;
// anonyme produksjoner samles under sentinel-produktet (NEXT_PUBLIC_ANON_PRODUCT_ID).
export default function StartPage() {
  const anonProductId = process.env.NEXT_PUBLIC_ANON_PRODUCT_ID
  const billingOn = process.env.NEXT_PUBLIC_BILLING_ENABLED === 'true'

  return (
    <div className="min-h-screen bg-[var(--paper)] flex flex-col">
      <header className="max-w-3xl mx-auto w-full px-6 py-6">
        <Link href="/"><CenterForgeLogo /></Link>
      </header>
      <main className="flex-1 flex items-center justify-center px-6 pb-16">
        <div className="max-w-xl w-full text-center">
          <h1 className="text-4xl font-extrabold text-[var(--ink)] mb-4" style={{ fontFamily: 'var(--font-archivo), sans-serif' }}>
            Lag en video — uten konto
          </h1>
          <p className="text-gray-600 mb-8">
            Beskriv temaet, godkjenn manus og bilder, og få en ferdig video med voiceover, musikk og
            valgfri AI-bevegelse. {billingOn ? 'Du betaler kun for det du produserer — ingen registrering nødvendig.' : 'Helt gratis i åpningsperioden.'}
          </p>

          {anonProductId ? (
            <Link
              href={`/dashboard/products/${anonProductId}/video/draft/new`}
              className="inline-block px-8 py-4 rounded-xl font-semibold text-white bg-[var(--ember-deep)] hover:bg-[var(--ink)] transition-colors text-lg"
            >
              🎬 Kom i gang
            </Link>
          ) : (
            <p className="text-gray-500">Anonym bruk åpner snart — <Link href="/register" className="text-[var(--ember-deep)] underline">registrer deg</Link> så lenge.</p>
          )}

          {billingOn && (
            <div className="mt-8 bg-[var(--ember-tint-bg)] border border-[var(--ember-tint-border)] rounded-xl px-5 py-4 text-sm text-[var(--ink)]">
              💡 <Link href="/register" className="font-semibold underline">Registrer deg gratis</Link> og få{' '}
              <span className="font-semibold">33 % rabatt</span> på alle produksjoner — pluss egne produkter,
              karakterer og publisering til sosiale medier.
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
