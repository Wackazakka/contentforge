import Link from 'next/link'

// Statiske biter fra design-handoffen (components.jsx) — server-kompatible.

export type Accent = 'sand' | 'green' | 'rose' | 'lilac'

export function OccasionChip({ label, accent = 'sand' }: { label: string; accent?: Accent }) {
  return <span className={`fd-chip fd-chip-${accent}`}>{label}</span>
}

export function StepCard({ n, title, accent = 'sand', children }: {
  n: number
  title: string
  accent?: Accent
  children: React.ReactNode
}) {
  return (
    <div className="fd-step">
      <span
        className="fd-step-num"
        style={{ background: `var(--fd-${accent}-bg)`, color: `var(--fd-${accent}-strong)` }}
      >
        {n}
      </span>
      <h3 className="fd-h3">{title}</h3>
      <p>{children}</p>
    </div>
  )
}

export function PriceRow({ label, amount, highlight = false, divider = true }: {
  label: string
  amount: string
  highlight?: boolean
  divider?: boolean
}) {
  const color = highlight ? 'var(--fd-mustard)' : undefined
  return (
    <>
      <div className="fd-price-row">
        <span style={{ color: color || '#E4D8DC' }}>{label}</span>
        <span className="fd-amount fd-num" style={{ color: color || 'var(--fd-paper)' }}>{amount}</span>
      </div>
      {divider && <div className="fd-price-divider" />}
    </>
  )
}

export function Cta({ href, children, tone = 'terracotta' }: {
  href: string
  children: React.ReactNode
  tone?: 'terracotta' | 'mustard'
}) {
  return (
    <Link href={href} className={tone === 'mustard' ? 'fd-cta fd-cta-mustard' : 'fd-cta'}>
      {children}
    </Link>
  )
}

export function CtaGhost({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} className="fd-cta-ghost">
      {children}
    </a>
  )
}
