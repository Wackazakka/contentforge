import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { getTenant } from '@/lib/tenantServer'
import { getPublicActors } from '@/lib/publicActors'
import { CenterForgeLogo } from '@/components/CenterForgeLogo'
import { LangToggle } from '@/components/LangToggle'
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
  const t = await getTranslations('gallery')
  return {
    // Layouten legger selv på « · {tenant}» — ikke gjenta navnet her.
    title: t('title'),
    description: t('meta_description', { tenant: tenant.app_name }),
  }
}

export default async function StemmerPage() {
  const tenant = await getTenant()
  // Tjenester uten rettighetsforvaltning (f.eks. Standard Ropert) har ingen bank å vise.
  if (tenant.twinledger_enabled === false) notFound()
  const t = await getTranslations('gallery')
  const actors = await getPublicActors(tenant)
  // Er alt vi har å vise eksempler, kan ikke ingressen love «ekte mennesker som
  // har sagt ja» — da lyver hylla. Første ekte publiserte rettighetshaver
  // snur teksten tilbake av seg selv.
  const kunEksempler = actors.length > 0 && actors.every((a) => a.isDemo)

  return (
    <div className="min-h-screen bg-[var(--paper)] text-[var(--ink,#1C1A16)]">
      <header className="max-w-5xl mx-auto px-6 pt-6 pb-5 flex items-center gap-4 flex-wrap">
        <Link href="/" style={{ textDecoration: 'none' }}><CenterForgeLogo size={28} wordmarkSize={18} /></Link>
        <div className="ml-auto flex items-center gap-5 text-sm">
          <Link href="/bli-stemme" className="text-[var(--text-muted,#6B6358)] hover:text-[var(--ink,#1C1A16)]">{t('become')}</Link>
          <Link href="/login" className="text-[var(--text-muted,#6B6358)] hover:text-[var(--ink,#1C1A16)]">{t('login')}</Link>
          {tenant.show_language_toggle !== false && <LangToggle />}
        </div>
      </header>
      <hr style={{ border: 0, height: 1, background: 'var(--ds-border, #E2D9C8)' }} />

      <main className="max-w-5xl mx-auto px-6 py-12">
        <p className="text-xs font-semibold tracking-[0.16em] uppercase text-[var(--text-faint,#8A8175)] mb-3">{tenant.app_name}</p>
        <h1 className="text-4xl font-bold mb-3" style={{ letterSpacing: '-0.02em' }}>{t('title')}</h1>
        {kunEksempler ? (
          <p className="text-lg text-[var(--ink-soft,#4A443B)] max-w-2xl mb-10">
            {t('intro_demo_1')}<strong style={{ fontWeight: 600 }}>{t('intro_demo_em')}</strong>{t('intro_demo_2')}
            <Link href="/bli-stemme" className="text-[var(--ember-deep)] hover:underline font-medium">{t('intro_demo_link')}</Link>
          </p>
        ) : (
          <p className="text-lg text-[var(--ink-soft,#4A443B)] max-w-2xl mb-10">
            {t('intro')}
          </p>
        )}

        {actors.length === 0 ? (
          <div className="rounded-xl border p-8 max-w-xl" style={{ background: 'var(--paper-raised)', borderColor: 'var(--ds-border, #E2D9C8)' }}>
            <h2 className="font-semibold text-lg mb-2">{t('empty_title')}</h2>
            <p className="text-[var(--ink-soft,#4A443B)] mb-5">
              {t('empty_body')}
            </p>
            <div className="flex gap-3 flex-wrap">
              <Link href="/bli-stemme" className="px-5 py-2.5 rounded-lg font-semibold text-[var(--on-ember)] bg-[var(--ember-deep)] hover:opacity-90">{t('become')}</Link>
              <Link href="/" className="px-5 py-2.5 rounded-lg font-semibold border hover:border-[var(--ember-deep)]" style={{ borderColor: 'var(--ds-border, #E2D9C8)' }}>{t('to_front')}</Link>
            </div>
          </div>
        ) : (
          <GalleriClient actors={actors} />
        )}

        <div className="mt-16 pt-8 text-sm text-[var(--text-muted,#6B6358)] flex flex-wrap gap-x-8 gap-y-3 justify-between" style={{ borderTop: '1px solid var(--ds-border, #E2D9C8)' }}>
          {kunEksempler ? (
            <span>{t('footer_demo')} <Link href="/white-label" className="text-[var(--ember-deep)] hover:underline font-medium">{t('footer_demo_link')}</Link> {t('footer_demo_rest')}</span>
          ) : (
            <span>{t('footer_use')} <Link href="/register" className="text-[var(--ember-deep)] hover:underline font-medium">{t('footer_use_link')}</Link> {t('footer_use_rest')}</span>
          )}
          <span>{t('footer_actor')} <Link href="/bli-stemme" className="text-[var(--ember-deep)] hover:underline font-medium">{t('become')}</Link>.</span>
        </div>
      </main>
    </div>
  )
}
