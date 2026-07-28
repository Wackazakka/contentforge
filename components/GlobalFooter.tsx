'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useTenant } from '@/lib/tenantContext'

const MONO = 'var(--font-cfmono), monospace'
const HANKEN = 'var(--font-hanken), sans-serif'

// Global bunnstripe på alle sider. Landingssiden har sin egen rike footer og hopper over denne.
export default function GlobalFooter() {
  const pathname = usePathname()
  const t = useTranslations('home')
  const tenant = useTenant()

  if (pathname === '/') return null

  return (
    <footer
      style={{
        marginTop: 'auto',
        borderTop: '1px solid color-mix(in srgb, var(--ink) 12%, transparent)',
        padding: '18px 28px 22px',
      }}
    >
      <div
        style={{
          maxWidth: 1180,
          margin: '0 auto',
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
        }}
      >
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 20 }}>
          <Link href="/white-label" className="cf-nav-link" style={{ fontFamily: HANKEN, fontSize: 13, color: 'var(--ink)', opacity: 0.6, textDecoration: 'none' }}>{t('foot_whitelabel')}</Link>
          <Link href="/privacy" className="cf-nav-link" style={{ fontFamily: HANKEN, fontSize: 13, color: 'var(--ink)', opacity: 0.6, textDecoration: 'none' }}>{t('foot_privacy')}</Link>
          <Link href="/terms" className="cf-nav-link" style={{ fontFamily: HANKEN, fontSize: 13, color: 'var(--ink)', opacity: 0.6, textDecoration: 'none' }}>{t('foot_terms')}</Link>
        </div>
        {tenant.billing_mode === 'invoice' && (
          <span style={{ fontFamily: MONO, fontSize: 11.5, letterSpacing: '0.04em', color: 'var(--ink)', opacity: 0.5 }}>Powered by Norditech</span>
        )}
      </div>
    </footer>
  )
}
