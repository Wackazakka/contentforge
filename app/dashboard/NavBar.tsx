'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useAuth } from '@/lib/authContext'
import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { CenterForgeLogo } from '@/components/CenterForgeLogo'
import { LangToggle } from '@/components/LangToggle'

const HANKEN = 'var(--font-hanken), sans-serif'

export default function NavBar() {
  const pathname = usePathname()
  const router = useRouter()
  const { signOut, session } = useAuth()
  const [credits, setCredits] = useState<number | null>(null)
  const t = useTranslations('nav')

  const navLinks = [
    { href: '/dashboard', label: t('overview') },
    { href: '/dashboard/publish', label: t('publish') },
    { href: '/dashboard/calendar', label: t('calendar') },
    { href: '/dashboard/billing', label: t('billing') },
  ]

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
        background: 'rgba(244,238,226,0.82)', borderBottom: '1px solid #E2D9C8',
      }}
    >
      <div style={{ maxWidth: 1180, margin: '0 auto', padding: '13px 26px', display: 'flex', alignItems: 'center', gap: 20 }}>
        <Link href="/dashboard" style={{ textDecoration: 'none', flex: 'none' }}>
          <CenterForgeLogo size={28} wordmarkSize={19} />
        </Link>

        <nav style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, flexWrap: 'wrap' }}>
          {navLinks.map(({ href, label }) => {
            const active = pathname === href || (href !== '/dashboard' && pathname.startsWith(href))
            return (
              <Link
                key={href}
                href={href}
                style={{
                  display: 'inline-flex', alignItems: 'center', fontFamily: HANKEN, fontSize: 15,
                  fontWeight: active ? 600 : 500,
                  color: active ? '#C5451B' : '#6B6358',
                  background: active ? '#F8E7DB' : 'transparent',
                  border: active ? '1px solid #EBC9B2' : '1px solid transparent',
                  borderRadius: 999, padding: '8px 16px', textDecoration: 'none',
                }}
              >
                {label}
              </Link>
            )
          })}
        </nav>

        <div style={{ flex: 'none', display: 'flex', alignItems: 'center', gap: 12 }}>
          {credits !== null && (
            <Link
              href="/dashboard/billing"
              title="Credits remaining"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 5, fontFamily: HANKEN, fontSize: 13, fontWeight: 600,
                color: '#C5451B', background: '#F8E7DB', border: '1px solid #EBC9B2', borderRadius: 999,
                padding: '7px 13px', textDecoration: 'none',
              }}
            >
              {t('credits', { count: credits })}
            </Link>
          )}

          <LangToggle />

          <button
            onClick={handleLogout}
            className="cf-nav-link"
            style={{ fontFamily: HANKEN, fontSize: 14, fontWeight: 500, color: '#6B6358', background: 'transparent', border: 'none', cursor: 'pointer', padding: 0 }}
          >
            {t('logout')}
          </button>
        </div>
      </div>
    </nav>
  )
}
