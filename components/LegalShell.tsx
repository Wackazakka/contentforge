import Link from 'next/link'
import { ReactNode } from 'react'
import { CenterForgeLogo } from '@/components/CenterForgeLogo'

const HANKEN = 'var(--font-hanken), sans-serif'
const SERIF = 'var(--font-serif), serif'
const MONO = 'var(--font-cfmono), monospace'

/**
 * Shared chrome for the legal pages (privacy / terms). Server component —
 * static content, no client state. The Privacy/Terms segmented control is two
 * links to the sibling routes; `active` drives the highlighted pill.
 */
export function LegalShell({
  active,
  title,
  updated,
  children,
}: {
  active: 'privacy' | 'terms'
  title: ReactNode
  updated: ReactNode
  children: ReactNode
}) {
  return (
    <div style={{ position: 'relative', background: 'var(--paper)', minHeight: '100vh', fontFamily: HANKEN, color: 'var(--ink)' }}>
      <div className="cf-grain" aria-hidden="true" />

      <header
        style={{
          position: 'sticky', top: 0, zIndex: 50,
          backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)',
          background: 'rgba(244,238,226,0.82)', borderBottom: '1px solid #E2D9C8',
        }}
      >
        <div style={{ maxWidth: 1180, margin: '0 auto', padding: '15px 28px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 20 }}>
          <Link href="/" style={{ textDecoration: 'none' }}>
            <CenterForgeLogo size={28} wordmarkSize={19} />
          </Link>
          <Link href="/" className="cf-nav-link" style={{ fontFamily: HANKEN, fontSize: 14, fontWeight: 500, color: '#6B6358', textDecoration: 'none' }}>
            ← Home
          </Link>
        </div>
      </header>

      <main style={{ position: 'relative', zIndex: 2, maxWidth: 760, margin: '0 auto', padding: 'clamp(40px,5vw,68px) 28px 80px' }}>
        <div className="cf-seg">
          <Link href="/privacy" aria-current={active === 'privacy' ? 'page' : undefined}>Privacy</Link>
          <Link href="/terms" aria-current={active === 'terms' ? 'page' : undefined}>Terms</Link>
        </div>

        <h1 style={{ fontFamily: SERIF, fontWeight: 400, fontSize: 'clamp(38px,5vw,54px)', lineHeight: 1.03, letterSpacing: '-0.01em', color: 'var(--ink)', margin: '0 0 10px' }}>{title}</h1>
        <div style={{ fontFamily: MONO, fontSize: 12, letterSpacing: '0.06em', color: '#A89C88', marginBottom: 40 }}>{updated}</div>

        <div className="cf-legal">{children}</div>
      </main>
    </div>
  )
}
