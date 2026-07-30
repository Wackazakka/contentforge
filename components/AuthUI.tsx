'use client'

import Link from 'next/link'
import { CSSProperties, InputHTMLAttributes, ReactNode } from 'react'
import { CenterForgeLogo } from '@/components/CenterForgeLogo'
import { LangToggle } from '@/components/LangToggle'

const HANKEN = 'var(--font-hanken), sans-serif'
const SERIF = 'var(--font-serif), serif'

/** Ember text-link style for "forgot password", mode switches, etc. */
export const emberLink: CSSProperties = {
  fontFamily: HANKEN,
  fontWeight: 700,
  color: 'var(--ember-deep)',
  background: 'transparent',
  border: 'none',
  cursor: 'pointer',
  padding: 0,
  textDecoration: 'none',
}

/**
 * Shared auth page chrome: paper background + grain, header (logo → landing,
 * language toggle), and a centered card with an ember glow, title and subtitle.
 */
export function AuthShell({
  title,
  subtitle,
  children,
  maxWidth = 440,
}: {
  title: ReactNode
  subtitle?: ReactNode
  children: ReactNode
  maxWidth?: number
}) {
  return (
    <div
      style={{
        position: 'relative',
        background: 'var(--paper)',
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        fontFamily: HANKEN,
        color: 'var(--ink)',
      }}
    >
      <div className="cf-grain" aria-hidden="true" />

      <header
        style={{
          position: 'relative', zIndex: 2,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 20,
          padding: '18px 28px', maxWidth: 1180, margin: '0 auto', width: '100%',
        }}
      >
        <Link href="/" style={{ textDecoration: 'none' }}>
          <CenterForgeLogo size={28} wordmarkSize={19} />
        </Link>
        <LangToggle />
      </header>

      <main
        style={{
          position: 'relative', zIndex: 2, flex: 1,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '24px 24px 64px',
        }}
      >
        <div style={{ position: 'relative', width: '100%', maxWidth }}>
          <div
            aria-hidden="true"
            style={{
              position: 'absolute', inset: '-12% -8% 30% -8%',
              background: 'radial-gradient(50% 50% at 50% 30%,color-mix(in srgb, var(--ember) 14%, transparent),transparent 70%)',
              pointerEvents: 'none',
            }}
          />
          <div
            style={{
              position: 'relative', background: 'var(--paper-raised)', border: '1px solid var(--ds-border)',
              borderRadius: 22, padding: '38px 34px', boxShadow: '0 40px 80px -45px color-mix(in srgb, var(--ink) 45%, transparent)',
            }}
          >
            <h1 style={{ fontFamily: SERIF, fontWeight: 400, fontSize: 34, lineHeight: 1.06, letterSpacing: '-0.01em', color: 'var(--ink)', margin: '0 0 8px' }}>{title}</h1>
            {subtitle ? (
              <p style={{ fontFamily: HANKEN, fontSize: 14.5, lineHeight: 1.55, color: 'var(--text-muted)', margin: '0 0 24px' }}>{subtitle}</p>
            ) : (
              <div style={{ height: 16 }} />
            )}
            {children}
          </div>
        </div>
      </main>
    </div>
  )
}

type AuthFieldProps = InputHTMLAttributes<HTMLInputElement> & {
  label: ReactNode
  hint?: ReactNode
  rightSlot?: ReactNode
}

/** Labelled input with the Daylight ember focus ring (via .cf-input). */
export function AuthField({ label, hint, rightSlot, ...inputProps }: AuthFieldProps) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, gap: 12 }}>
        <label style={{ fontFamily: HANKEN, fontSize: 14, fontWeight: 600, color: 'var(--ink-soft)' }}>{label}</label>
        {rightSlot}
      </div>
      <input className="cf-input" {...inputProps} />
      {hint && <p style={{ fontFamily: HANKEN, fontSize: 12.5, color: 'var(--text-faint)', margin: '7px 0 0' }}>{hint}</p>}
    </div>
  )
}

/** Full-width ink submit button. */
export function AuthSubmit({
  loading,
  loadingLabel,
  children,
}: {
  loading?: boolean
  loadingLabel?: ReactNode
  children: ReactNode
}) {
  return (
    <button
      type="submit"
      disabled={loading}
      className="cf-btn-ink"
      style={{
        width: '100%', fontFamily: HANKEN, fontWeight: 700, fontSize: 16, color: 'var(--paper)',
        background: 'var(--ink)', border: 'none', borderRadius: 12, padding: 15,
        cursor: loading ? 'not-allowed' : 'pointer', marginTop: 6,
        boxShadow: '0 12px 28px -14px color-mix(in srgb, var(--ink) 60%, transparent)', opacity: loading ? 0.7 : 1,
      }}
    >
      {loading ? loadingLabel : children}
    </button>
  )
}

/** Error / success banner in the Daylight palette. */
export function AuthBanner({ variant = 'error', children }: { variant?: 'error' | 'success'; children: ReactNode }) {
  const palette =
    variant === 'error'
      ? { color: 'var(--ember-deep)', background: '#FBEAE6', border: '1px solid #F0C4B8' }
      : { color: '#3F7A4E', background: '#E4EFE0', border: '1px solid #CADBC4' }
  return (
    <div style={{ ...palette, borderRadius: 11, padding: '12px 14px', marginBottom: 18, fontFamily: HANKEN, fontSize: 14, lineHeight: 1.5 }}>
      {children}
    </div>
  )
}

/** Centered switch row at the bottom of a card ("Don't have an account? Sign up"). */
export function AuthSwitch({ prompt, linkLabel, href }: { prompt?: ReactNode; linkLabel: ReactNode; href: string }) {
  return (
    <div style={{ textAlign: 'center', marginTop: 22, fontFamily: HANKEN, fontSize: 14, color: 'var(--text-muted)' }}>
      {prompt ? <>{prompt} </> : null}
      <Link href={href} style={{ ...emberLink, fontSize: 14 }}>{linkLabel}</Link>
    </div>
  )
}
