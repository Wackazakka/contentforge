'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useAuth } from '@/lib/authContext'
import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { CenterForgeLogo } from '@/components/CenterForgeLogo'
import { LangToggle } from '@/components/LangToggle'
import { useTenant } from '@/lib/tenantContext'

const HANKEN = 'var(--font-hanken), sans-serif'

export default function NavBar() {
  const pathname = usePathname()
  const router = useRouter()
  const { signOut, session } = useAuth()
  const [credits, setCredits] = useState<number | null>(null)
  const [voiceBankAdmin, setVoiceBankAdmin] = useState(false)
  const t = useTranslations('nav')
  const tLogin = useTranslations('login')
  const tKonto = useTranslations('account')
  const tenant = useTenant()

  // Invoice-tenants (white-label via partner) skal ikke se CenterForge-priser/billing
  const navLinks = [
    { href: '/dashboard', label: t('overview') },
    { href: '/dashboard/publish', label: t('publish') },
    { href: '/dashboard/calendar', label: t('calendar') },
    ...(tenant.billing_mode === 'invoice'
      ? [{ href: '/dashboard/credits', label: t('buy_credits') }]
      : [{ href: '/dashboard/billing', label: t('billing') }]),
    // Admin-lenker (kun tenant-admins — vanlige artister ser dem aldri).
    // Stemmebanken er skjult for artist-tenanter inntil videre (Lars 1/8):
    // skuespiller-royalty er ikke tema for IndigoBoom ennå.
    ...(voiceBankAdmin
      ? [
          // Eksplisitt produktflagg — foer utledet av vertical==='music', som var
          // en tilfeldighet som ventet paa aa bite naar en ny vertikal kom til.
          ...(tenant.twinledger_enabled === false ? [] : [{ href: '/dashboard/voice-bank', label: t('voicebank') }]),
          // Partnere og API-nøkler er «avansert admin» og skjules for tjenester
          // som ikke trenger dem ennå (Lars 3/8: «ikke så overveldende i
          // starten»). Påslag og Avregning blir stående — de handler om
          // pengene deres, og dem trenger de fra dag én.
          ...(tenant.show_advanced_admin !== false
            ? [{ href: '/dashboard/partners', label: t('partners') }]
            : []),
          { href: '/dashboard/paaslag', label: t('markup') },
          { href: '/dashboard/avregning', label: t('settlement') },
          ...(tenant.show_advanced_admin !== false
            ? [{ href: '/dashboard/api-keys', label: t('apikeys') }]
            : []),
        ]
      : []),
  ]

  // Rights-vertikalen (VoiceBank): rettighetsforvaltningen ER hovedforretningen,
  // saa Stemmebank og Avregning loeftes fremst for admins. Ren omstokking av
  // allerede-bygde elementer — definisjonene over eies fortsatt ett sted, og
  // aktiv-markeringen er href-basert og upaavirket. Ikke-admins (byraaets
  // kunder) og alle andre tenanter beholder produksjonsrekkefoelgen.
  if (tenant.vertical === 'rights' && voiceBankAdmin) {
    const foerst = ['/dashboard/voice-bank', '/dashboard/avregning']
    navLinks.sort((a, b) => {
      const ia = foerst.indexOf(a.href); const ib = foerst.indexOf(b.href)
      if (ia !== -1 || ib !== -1) return (ia === -1 ? foerst.length : ia) - (ib === -1 ? foerst.length : ib)
      return 0 // stabil sort bevarer resten av rekkefoelgen
    })
  }

  // Stemmebank-lenken vises kun for tenant-admins (avgjøres server-side)
  useEffect(() => {
    const token = session?.access_token
    if (!token) return
    fetch('/api/voice-bank/admin', { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => setVoiceBankAdmin(r.ok))
      .catch(() => {})
  }, [session])

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
          {navLinks.map(({ href, label }) => {
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
