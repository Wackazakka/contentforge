'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useAuth } from '@/lib/authContext'
import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { CenterForgeLogo } from '@/components/CenterForgeLogo'
import { TwinLedgerLogo } from '@/components/TwinLedgerLogo'
import { LangToggle } from '@/components/LangToggle'
import { useTenant } from '@/lib/tenantContext'
import { isSimpleMode } from '@/lib/verticals'
import { useDashboardRole } from '@/lib/useDashboardRole'

const HANKEN = 'var(--font-hanken), sans-serif'

export default function NavBar() {
  const pathname = usePathname()
  const router = useRouter()
  const { signOut, session } = useAuth()
  const [credits, setCredits] = useState<number | null>(null)
  // Roller avgjøres server-side og deles med dashbord-landingen via én hook:
  // admin (tenant-admin), actor (forvaltningsavtale i denne banken), customer
  // (har produsert eller kjøpt her). Se lib/useDashboardRole.ts.
  const role = useDashboardRole()
  const voiceBankAdmin = role.admin
  const actorLedger = role.actor
  const t = useTranslations('nav')
  const tLogin = useTranslations('login')
  const tKonto = useTranslations('account')
  const tenant = useTenant()

  // Enkel modus (Standard Ropert, 4/9): Publiser (krever Facebook-side og
  // Instagram-bedriftskonto), Kalender og Kreditter er byraaflater — folk
  // som saa vidt sender e-post skal se Oversikt, Konto og Logg ut.
  const enkel = isSimpleMode(tenant.vertical)
  // Per-tenant av/paa for de samme to flatene (IndigoBoom 11/9). Enkel modus
  // skjuler dem for en hel vertikal; dette flagget gjoer det for én merkevare,
  // og er ment aa kunne skrus tilbake paa uten en ny deploy.
  const publisering = tenant.publishing_enabled !== false
  // Menyen er tre GRUPPER, ikke én liste (Lars 16/9: «stemme-eier og kunde
  // blandes sammen»). Hver gruppe eies av én rolle og tegnes med skille:
  //   produksjon  — kundens verktøy (Oversikt, Publiser, Kalender, Kreditter)
  //   forvaltning — admin (Stemmebank, Avregning, Påslag, Partnere, API-nøkler)
  //   meg         — rettighetshaverens egen hovedbok
  type NavLink = { href: string; label: string }
  // Invoice-tenants (white-label via partner) skal ikke se CenterForge-priser/billing
  const produksjon: NavLink[] = [
    { href: '/dashboard', label: t('overview') },
    // Kundens katalog over medvirkende (Lars 17/9, omdøpt 20/9). Kun der
    // rettighetsforvaltningen er på, og ikke i enkel modus (Standard Ropert).
    // Het «Stemmer», men inneholder BÅDE stemmer og ansikter — og navnet var
    // dessuten valgt for å unngå forveksling med admin-fanen, ikke for å
    // beskrive innholdet. «Medvirkende» sier hva det er.
    ...(enkel || tenant.twinledger_enabled === false ? [] : [
      { href: '/dashboard/stemmer', label: t('voices') },
      // Audition hørte hjemme her fra dagen den ble bygget; den manglet i menyen.
      { href: '/audition', label: t('audition') },
    ]),
    ...(enkel || !publisering ? [] : [
      { href: '/dashboard/publish', label: t('publish') },
      { href: '/dashboard/calendar', label: t('calendar') },
    ]),
    ...(enkel ? [] : tenant.billing_mode === 'invoice'
      ? [{ href: '/dashboard/credits', label: t('buy_credits') }]
      : [{ href: '/dashboard/billing', label: t('billing') }]),
  ]
  // Admin-lenker (kun tenant-admins — vanlige artister ser dem aldri).
  // Stemmebanken er skjult for artist-tenanter inntil videre (Lars 1/8):
  // skuespiller-royalty er ikke tema for IndigoBoom ennå.
  const forvaltning: NavLink[] = voiceBankAdmin
    ? [
        // Eksplisitt produktflagg — foer utledet av vertical==='music', som var
        // en tilfeldighet som ventet paa aa bite naar en ny vertikal kom til.
        ...(tenant.twinledger_enabled === false ? [] : [{ href: '/dashboard/voice-bank', label: t('voicebank') }]),
        { href: '/dashboard/avregning', label: t('settlement') },
        { href: '/dashboard/paaslag', label: t('markup') },
        // Partnere og API-nøkler er «avansert admin» og skjules for tjenester
        // som ikke trenger dem ennå (Lars 3/8: «ikke så overveldende i
        // starten»). Påslag og Avregning blir stående — de handler om
        // pengene deres, og dem trenger de fra dag én.
        ...(tenant.show_advanced_admin !== false
          ? [{ href: '/dashboard/partners', label: t('partners') }, { href: '/dashboard/api-keys', label: t('apikeys') }]
          : []),
      ]
    : []
  // Rettighetshaverens egen hovedbok — utenfor dashbordet, se app/min-stemme.
  const meg: NavLink[] = actorLedger ? [{ href: '/min-stemme', label: t('myledger') }] : []

  // Rekkefølge: rights-vertikalen (VoiceBank) har forvaltningen som
  // hovedforretning og får den først; alle andre tenanter har produksjonen
  // først. En REN rettighetshaver (ikke admin, ikke kunde) ser bare sin egen
  // hovedbok — produksjonsflatene angår henne ikke.
  // ⚠️ VENT PÅ ROLLEN FØR NOE TEGNES. `role.admin` er usann mens oppslaget
  // pågår, så uten denne vakta tegnes menyen først uten «Forvaltning» og så
  // med — admin-menyen POPPER INN etter to nettverkskall. I det halvsekundet
  // ser en admin et dashbord uten admin-meny, og en ren rettighetshaver ser
  // produksjonsmenyen blinke før den kollapser til bare «Meg».
  //
  // Tomt er ærligere enn feil: rammen, logoen og utloggingen står, og lenkene
  // kommer samlet når vi vet hvem som spør.
  const navGroups: NavLink[][] = !role.loaded
    ? []
    : role.actorOnly
    ? [meg]
    : (tenant.vertical === 'rights' ? [forvaltning, produksjon, meg] : [produksjon, forvaltning, meg]).filter((g) => g.length > 0)

  useEffect(() => {
    const userId = session?.user?.id
    if (!userId) return
    fetch(`/api/credits?userId=${userId}`)
      .then((r) => r.json())
      .then((d) => setCredits(d.balance ?? null))
      .catch(() => {})
  }, [session])

  const handleLogout = async () => {
    await signOut()
    router.push('/login')
  }

  // ⚠️ TENANT-STYRT, IKKE GLOBALT. NavBar tegner dashbordet for ALLE
  // tenantene. Sidemenyen er TwinLedgers redesign (Claude Design 7); de andre
  // beholder topplinja. Samme grunn som at paletten ligger i tenant.colors og
  // ikke i :root — en layoutendring her ville flyttet menyen for VoiceBank,
  // PromoMaker, Bombaza og BådeOg uten at noen hadde bedt om det.
  const sidemeny = tenant.slug === 'twinledger'

  const gruppenavn = [t('group_production'), t('group_management'), t('group_me')]
  // Rekkefølgen på gruppene varierer med vertikal, så navnet må følge
  // INNHOLDET og ikke indeksen: forvaltning først hos rights-tenanter.
  const navnFor = (g: NavLink[]) =>
    g === forvaltning ? gruppenavn[1] : g === meg ? gruppenavn[2] : gruppenavn[0]

  if (sidemeny) {
    return (
      <nav aria-label="Dashbord" style={{
        position: 'fixed', left: 0, top: 0, bottom: 0, width: 236, zIndex: 50,
        background: 'var(--ink)', display: 'flex', flexDirection: 'column',
        overflowY: 'auto',
      }} className="cf-sidenav">
        <div style={{ padding: '22px 20px 18px' }}>
          <Link href="/dashboard" style={{ textDecoration: 'none' }}>
            <TwinLedgerLogo size={20} variant="dark" />
          </Link>
        </div>

        <div style={{ flex: 1, paddingBottom: 12 }}>
          {navGroups.map((group, gi) => (
            <div key={gi} style={{ marginBottom: 18 }}>
              {/* Gruppeoverskrift i stedet for en tynn strek: «Avregning» og
                  «Kreditter» hører til to ulike verdener, og et NAVN sier
                  hvilke — en strek sier bare at det er et skille. */}
              <p style={{
                fontFamily: 'var(--font-cfmono), ui-monospace, monospace', fontSize: 10,
                fontWeight: 600, letterSpacing: '0.16em', textTransform: 'uppercase',
                color: '#6B6B72', margin: '0 0 6px', padding: '0 20px',
              }}>{navnFor(group)}</p>
              {group.map(({ href, label }) => {
                const active = pathname === href || (href !== '/dashboard' && pathname.startsWith(href))
                return (
                  <Link key={href} href={href} style={{
                    display: 'block', fontFamily: HANKEN, fontSize: 14.5,
                    fontWeight: active ? 600 : 500,
                    color: active ? 'var(--paper)' : '#C9C9CE',
                    background: active ? '#2A2A2E' : 'transparent',
                    borderLeft: `3px solid ${active ? 'var(--ember)' : 'transparent'}`,
                    padding: '9px 20px 9px 17px', textDecoration: 'none',
                  }}>{label}</Link>
                )
              })}
            </div>
          ))}
        </div>

        <div style={{ borderTop: '1px solid #2A2A2E', padding: '14px 20px 20px', display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'flex-start' }}>
          {tenant.show_language_toggle !== false && <LangToggle />}
          {session && (
            <Link href="/dashboard/konto" style={{ fontFamily: HANKEN, fontSize: 14, color: '#C9C9CE', textDecoration: 'none' }}>{tKonto('nav')}</Link>
          )}
          {session ? (
            <button onClick={handleLogout} style={{ fontFamily: HANKEN, fontSize: 14, color: '#C9C9CE', background: 'transparent', border: 'none', cursor: 'pointer', padding: 0 }}>{t('logout')}</button>
          ) : (
            <Link href="/login" style={{ fontFamily: HANKEN, fontSize: 14, color: 'var(--ember)', textDecoration: 'none' }}>{tLogin('signIn')}</Link>
          )}
        </div>
      </nav>
    )
  }

  return (
    <nav
      style={{
        position: 'sticky', top: 0, zIndex: 50,
        backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)',
        background: 'color-mix(in srgb, var(--paper) 82%, transparent)',
        // Var hardkodet #E2D9C8 — en beige strek som lyste opp paa en moerk
        // drakt (Lars 3/8). Foelger naa tenantens rammefarge.
        borderBottom: '1px solid var(--ds-border)',
      }}
    >
      <div className="cf-nav-row" style={{ maxWidth: 1180, margin: '0 auto', padding: '13px 26px', display: 'flex', alignItems: 'center', gap: 20 }}>
        <Link href="/dashboard" style={{ textDecoration: 'none', flex: 'none' }}>
          <CenterForgeLogo size={28} wordmarkSize={19} />
        </Link>

        <nav className="cf-nav-links" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, flexWrap: 'wrap' }}>
          {navGroups.map((group, gi) => (
            <span key={gi} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              {/* Skillestrek mellom gruppene — det er skillet som forteller at
                  «Avregning» og «Kreditter» hører til to ulike verdener. */}
              {gi > 0 && <span aria-hidden="true" style={{ width: 1, height: 18, background: 'var(--ds-border)', margin: '0 6px' }} />}
              {group.map(({ href, label }) => {
                const active = pathname === href || (href !== '/dashboard' && pathname.startsWith(href))
                return (
                  <Link
                    key={href}
                    href={href}
                    style={{
                      display: 'inline-flex', alignItems: 'center', fontFamily: HANKEN, fontSize: 15,
                      fontWeight: active ? 600 : 500,
                      color: active ? 'var(--ember-deep)' : 'var(--text-muted)',
                      background: active ? 'var(--ember-tint-bg)' : 'transparent',
                      border: active ? '1px solid var(--ember-tint-border)' : '1px solid transparent',
                      borderRadius: 999, padding: '8px 16px', textDecoration: 'none',
                    }}
                  >
                    {label}
                  </Link>
                )
              })}
            </span>
          ))}
        </nav>

        <div style={{ flex: 'none', display: 'flex', alignItems: 'center', gap: 12 }}>
          {credits !== null && tenant.billing_mode !== 'invoice' && (
            <Link
              href="/dashboard/billing"
              title="Credits remaining"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 5, fontFamily: HANKEN, fontSize: 13, fontWeight: 600,
                color: 'var(--ember-deep)', background: 'var(--ember-tint-bg)', border: '1px solid var(--ember-tint-border)', borderRadius: 999,
                padding: '7px 13px', textDecoration: 'none',
              }}
            >
              {t('credits', { count: credits })}
            </Link>
          )}

          {/* Skjules paa tjenester som bare tilbyr ett spraak (Lars 3/8) */}
          {tenant.show_language_toggle !== false && <LangToggle />}

          {/* Sesjonen er PER DOMENE (localStorage) — er du innlogget på ett white-label,
              er du ikke det på et annet. «Logg ut» ble tidligere vist ubetinget, så navet
              påsto at du var innlogget mens siden under sa «Ikke innlogget». */}
          {/* Kontoen — der man bytter passord (Lars 3/8). Vises kun innlogget. */}
          {session && (
            <Link
              href="/dashboard/konto"
              className="cf-nav-link"
              style={{ fontFamily: HANKEN, fontSize: 14, fontWeight: 500, color: 'var(--text-muted)', textDecoration: 'none' }}
            >
              {tKonto('nav')}
            </Link>
          )}

          {session ? (
            <button
              onClick={handleLogout}
              className="cf-nav-link"
              style={{ fontFamily: HANKEN, fontSize: 14, fontWeight: 500, color: 'var(--text-muted)', background: 'transparent', border: 'none', cursor: 'pointer', padding: 0 }}
            >
              {t('logout')}
            </button>
          ) : (
            <Link
              href="/login"
              className="cf-nav-link"
              style={{ fontFamily: HANKEN, fontSize: 14, fontWeight: 500, color: 'var(--ember-deep)', textDecoration: 'none' }}
            >
              {tLogin('signIn')}
            </Link>
          )}
        </div>
      </div>
    </nav>
  )
}
