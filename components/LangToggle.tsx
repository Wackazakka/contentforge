'use client'

import { useLocale } from 'next-intl'
import { useRouter } from 'next/navigation'

/**
 * NO/EN language toggle. Shows the *other* language code (the one you'd switch to),
 * matching the Daylight Studio design. Persists via the NEXT_LOCALE cookie and
 * refreshes server components so all next-intl copy swaps live.
 */
export function LangToggle() {
  const locale = useLocale()
  const router = useRouter()
  const other = locale === 'no' ? 'en' : 'no'

  function toggle() {
    document.cookie = `NEXT_LOCALE=${other}; path=/; max-age=31536000`
    router.refresh()
  }

  return (
    <button
      onClick={toggle}
      aria-label={`Switch language to ${other.toUpperCase()}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        fontFamily: 'var(--font-cfmono), monospace',
        fontSize: 12,
        fontWeight: 500,
        letterSpacing: '0.06em',
        color: 'var(--text-muted)',
        background: 'transparent',
        border: '1px solid var(--ds-border-strong)',
        borderRadius: 999,
        padding: '7px 12px',
        cursor: 'pointer',
        transition: 'color 0.15s, border-color 0.15s',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.color = 'var(--ink)'
        e.currentTarget.style.borderColor = '#b3a78f'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.color = 'var(--text-muted)'
        e.currentTarget.style.borderColor = 'var(--ds-border-strong)'
      }}
    >
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <circle cx="12" cy="12" r="9" />
        <path d="M3 12h18M12 3c2.5 2.6 2.5 15.4 0 18M12 3c-2.5 2.6-2.5 15.4 0 18" />
      </svg>
      {other.toUpperCase()}
    </button>
  )
}
