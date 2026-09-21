import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { getTenant, getTenantCanonicalOrigin } from '@/lib/tenantServer'
import { getPublicActors } from '@/lib/publicActors'
import { CenterForgeLogo } from '@/components/CenterForgeLogo'
import { TwinLedgerLogo } from '@/components/TwinLedgerLogo'
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
    alternates: { canonical: `${await getTenantCanonicalOrigin(tenant)}/stemmer` },
  }
}

const MONO = 'var(--font-cfmono), ui-monospace, monospace'
const DISPLAY = 'var(--font-archivo), system-ui, sans-serif'
const SANS = 'var(--font-hanken), system-ui, sans-serif'
const GUTTER = 'clamp(20px, 4vw, 56px)'

export default async function StemmerPage() {
  const tenant = await getTenant()
  // Tjenester uten rettighetsforvaltning (f.eks. Standard Ropert) har ingen bank å vise.
  if (tenant.twinledger_enabled === false) notFound()
  const t = await getTranslations('gallery')
  const actors = await getPublicActors(tenant)
  // TwinLedger har eget ordmerke; white-labels beholder husets logo.
  const erTwinLedger = tenant.slug === 'twinledger'
  // Er alt vi har å vise eksempler, kan ikke ingressen love «ekte mennesker som
  // har sagt ja» — da lyver hylla. Første ekte publiserte rettighetshaver
  // snur teksten tilbake av seg selv.
  const kunEksempler = actors.length > 0 && actors.every((a) => a.isDemo)

  return (
    <div className="min-h-screen bg-[var(--paper)] text-[var(--ink)]" style={{ fontFamily: SANS }}>
      {/* Samme topplinje som forsiden: hvit flate med hairline under, i full
          bredde. Katalogen trenger hele bredden — 250px filterkolonne pluss et
          rutenett får ikke plass i en midtstilt spalte. */}
      <header style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', padding: `18px ${GUTTER}`, background: 'var(--paper-raised)', borderBottom: '1px solid var(--ds-border)' }}>
        <Link href="/" style={{ textDecoration: 'none' }}>
          {erTwinLedger ? <TwinLedgerLogo size={22} /> : <CenterForgeLogo size={28} wordmarkSize={18} />}
        </Link>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '10px 18px', flexWrap: 'wrap', fontSize: 15 }}>
          <Link href="/bli-stemme" style={{ color: 'var(--ink-soft)', textDecoration: 'none' }}>{t('become')}</Link>
          <Link href="/login" style={{ color: 'var(--ink-soft)', textDecoration: 'none' }}>{t('login')}</Link>
          {tenant.show_language_toggle !== false && <LangToggle />}
        </div>
      </header>

      <main style={{ padding: `clamp(36px, 5vw, 56px) ${GUTTER} 64px` }}>
        <p style={{ fontFamily: MONO, fontSize: 11.5, fontWeight: 600, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--text-faint)', margin: '0 0 12px' }}>{tenant.app_name}</p>
        <h1 style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 'clamp(30px, 3.8vw, 46px)', letterSpacing: '-0.03em', lineHeight: 1.08, margin: '0 0 14px' }}>{t('title')}</h1>
        {kunEksempler ? (
          <p style={{ fontSize: 17, lineHeight: 1.55, color: 'var(--ink-soft)', maxWidth: '36em', margin: 0 }}>
            {t('intro_demo_1')}<strong style={{ fontWeight: 600 }}>{t('intro_demo_em')}</strong>{t('intro_demo_2')}
            <Link href="/bli-stemme" className="text-[var(--ember-deep)] hover:underline font-medium">{t('intro_demo_link')}</Link>
          </p>
        ) : (
          <p style={{ fontSize: 17, lineHeight: 1.55, color: 'var(--ink-soft)', maxWidth: '36em', margin: 0 }}>
            {t('intro')}
          </p>
        )}

        {actors.length === 0 ? (
          <div style={{ border: '1px solid var(--ds-border-strong)', background: 'var(--paper-raised)', padding: 32, maxWidth: 560, marginTop: 28 }}>
            <h2 className="font-semibold text-lg mb-2">{t('empty_title')}</h2>
            <p className="text-[var(--ink-soft,#4A443B)] mb-5">
              {t('empty_body')}
            </p>
            <div className="flex gap-3 flex-wrap">
              <Link href="/bli-stemme" style={{ padding: '12px 24px', fontFamily: DISPLAY, fontWeight: 700, fontSize: 15, background: 'var(--ember-deep)', color: 'var(--on-ember)', textDecoration: 'none' }}>{t('become')}</Link>
              <Link href="/" style={{ padding: '12px 24px', fontFamily: DISPLAY, fontWeight: 700, fontSize: 15, border: '1px solid var(--ds-border-strong)', color: 'var(--ink)', textDecoration: 'none' }}>{t('to_front')}</Link>
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
