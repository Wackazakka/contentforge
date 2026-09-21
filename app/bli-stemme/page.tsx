import { getTranslations } from 'next-intl/server'
import { getTenant, getTenantCanonicalOrigin } from '@/lib/tenantServer'
import Link from 'next/link'
import { CenterForgeLogo } from '@/components/CenterForgeLogo'
import { TwinLedgerLogo } from '@/components/TwinLedgerLogo'
import { LangToggle } from '@/components/LangToggle'
import ApplyForm from './ApplyForm'

// «Bli en stemme i banken» — offentlig drop-in-inngang for skuespillere.
// Vises kun når tenanten har skrudd på accept_actor_applications (opt-in).
// Tenant-drakten kommer automatisk via CSS-vars på <html>.
//
// ═══ REDESIGN 21.09.2026 (Claude Design 5C) ═══
//
// 🔑 VILKÅRENE STÅR VED SIDEN AV SKJEMAET, IKKE BAK EN LENKE. En skuespiller
// sier ja til noe hen ikke kan se — hvordan klonen lages, hvem som får bruke
// den, hva som skjer hvis hen ombestemmer seg. Da kan ikke de tre stegene og
// angreretten ligge et klikk unna; de må stå der mens hen fyller ut.
//
// Venstrespalten er derfor statisk tekst (server), høyrespalten er skjemaet
// (klient). Skillet går der interaktiviteten faktisk begynner.

export async function generateMetadata() {
  const tenant = await getTenant()
  const t = await getTranslations('apply')
  // ÅPNET FOR INDEKSERING 21.09.2026 (Lars). Sto som «deles som lenke, ikke
  // søkeside» — men rekruttering er nettopp det denne sida er til for, og en
  // skuespiller som googler «leie ut stemmen min» skal kunne finne den.
  //
  // 🔑 MEN BARE NÅR DØRA FAKTISK ER ÅPEN. Er accept_actor_applications av,
  // viser sida «vi tar ikke imot søknader nå» — og et søkeresultat som fører
  // til et avslag er verre enn ingen treff. Da skal den ikke indekseres.
  const aapen = tenant.id !== 'root' && tenant.accept_actor_applications === true
  const kanIndekseres = aapen && tenant.allow_indexing === true
  return {
    title: t('meta_title', { tenant: tenant.app_name }),
    description: t('meta_description', { tenant: tenant.app_name }),
    ...(kanIndekseres
      ? { alternates: { canonical: `${await getTenantCanonicalOrigin(tenant)}/bli-stemme` } }
      : {}),
    robots: kanIndekseres ? { index: true, follow: true } : { index: false, follow: false },
  }
}

const MONO = 'var(--font-cfmono), ui-monospace, monospace'
const DISPLAY = 'var(--font-archivo), system-ui, sans-serif'
const SANS = 'var(--font-hanken), system-ui, sans-serif'
const GUTTER = 'clamp(20px, 4vw, 56px)'

export default async function BliStemmePage() {
  const tenant = await getTenant()
  const t = await getTranslations('apply')
  const open = tenant.id !== 'root' && tenant.accept_actor_applications === true

  const erTwinLedger = tenant.slug === 'twinledger'
  const logo = erTwinLedger ? <TwinLedgerLogo size={22} /> : <CenterForgeLogo size={26} wordmarkSize={17} />

  if (!open) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--paper)', color: 'var(--ink)', fontFamily: SANS, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <div style={{ maxWidth: 460 }}>
          <h1 style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 26, letterSpacing: '-0.03em', margin: '0 0 10px' }}>
            {t('closed_title', { tenant: tenant.app_name })}
          </h1>
          <p style={{ fontSize: 15, lineHeight: 1.55, color: 'var(--ink-soft)', margin: 0 }}>{t('closed_body')}</p>
        </div>
      </div>
    )
  }

  const steg = [
    ['01', t('step1_h'), t('step1_p')],
    ['02', t('step2_h'), t('step2_p')],
    ['03', t('step3_h'), t('step3_p')],
  ]

  return (
    <div style={{ minHeight: '100vh', background: 'var(--paper)', color: 'var(--ink)', fontFamily: SANS }}>
      <style>{`
        .bs-split { display: grid; grid-template-columns: 1fr 1fr; gap: 0; align-items: start; }
        @media (max-width: 899px) { .bs-split { grid-template-columns: 1fr; } .bs-form { border-left: 0 !important; } }
      `}</style>

      <header style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', padding: `18px ${GUTTER}`, background: 'var(--paper-raised)', borderBottom: '1px solid var(--ds-border)' }}>
        <Link href="/" style={{ textDecoration: 'none' }}>{logo}</Link>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '10px 18px', flexWrap: 'wrap', fontSize: 15 }}>
          <Link href="/stemmer" style={{ color: 'var(--ink-soft)', textDecoration: 'none' }}>{t('nav_cast')}</Link>
          {/* Alle som står på DENNE siden er rettighetshavere — søknadsskjemaet
              angår ingen andre. Da skal innloggingslenken herfra åpne
              hovedboken, ikke kundeinngangen. */}
          <Link href="/login?rolle=stemme" style={{ color: 'var(--ink-soft)', textDecoration: 'none' }}>{t('nav_login')}</Link>
          {tenant.show_language_toggle !== false && <LangToggle />}
        </div>
      </header>

      <div className="bs-split">
        <div style={{ padding: `clamp(36px, 5vw, 64px) ${GUTTER}` }}>
          <p style={{ fontFamily: MONO, fontSize: 11.5, fontWeight: 600, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--text-faint)', margin: '0 0 12px' }}>{t('side_eyebrow')}</p>
          <h1 style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 'clamp(30px, 3.6vw, 44px)', letterSpacing: '-0.035em', lineHeight: 1.06, margin: '0 0 16px', textWrap: 'balance' }}>{t('side_h1')}</h1>
          <p style={{ fontSize: 17, lineHeight: 1.55, color: 'var(--ink-soft)', margin: '0 0 36px', maxWidth: '32em' }}>{t('side_lede')}</p>

          {steg.map(([n, h, p2], i) => (
            <div key={n} style={{ display: 'flex', gap: 18, padding: '18px 0', borderTop: `1px solid ${i === 0 ? 'var(--ds-border-strong)' : 'var(--ds-border)'}` }}>
              <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color: 'var(--ember-deep)', flex: 'none', paddingTop: 2 }}>{n}</span>
              <span>
                <span style={{ display: 'block', fontFamily: DISPLAY, fontWeight: 700, fontSize: 17, letterSpacing: '-0.02em', marginBottom: 4 }}>{h}</span>
                <span style={{ display: 'block', fontSize: 14.5, lineHeight: 1.55, color: 'var(--ink-soft)' }}>{p2}</span>
              </span>
            </div>
          ))}

          {/* Angreretten står HER, ikke i en fotnote. Det er spørsmålet enhver
              skuespiller stiller seg før hen sender: hva om jeg ombestemmer meg? */}
          <p style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--text-muted)', borderTop: '1px solid var(--ds-border-strong)', paddingTop: 20, margin: 0, maxWidth: '34em' }}>
            {t('withdraw')}
          </p>
        </div>

        <div className="bs-form" style={{ borderLeft: '1px solid var(--ds-border)', background: 'var(--paper-sunken)', padding: `clamp(36px, 5vw, 64px) ${GUTTER}` }}>
          <ApplyForm />
        </div>
      </div>
    </div>
  )
}
