'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useAuth } from '@/lib/authContext'
import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'

function HexagonIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <polygon
        points="12,2.5 20.8,7.75 20.8,16.25 12,21.5 3.2,16.25 3.2,7.75"
        stroke="#D3D1C7"
        strokeWidth="1"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  )
}

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

  function setLocale(locale: string) {
    document.cookie = `NEXT_LOCALE=${locale}; path=/; max-age=31536000`
    router.refresh()
  }

  const currentLocale =
    typeof document !== 'undefined'
      ? document.cookie
          .split('; ')
          .find((row) => row.startsWith('NEXT_LOCALE='))
          ?.split('=')[1] ?? 'en'
      : 'en'

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
    <nav className="sticky top-0 z-50 border-b" style={{ backgroundColor: '#ffffff', borderColor: '#e5e2d9' }}>
      <div className="max-w-5xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-2">
        <Link href="/dashboard" className="flex items-center gap-2 flex-shrink-0">
          <HexagonIcon />
          <span className="text-base font-bold tracking-tight" style={{ color: '#0C447C' }}>
            Center<span style={{ color: '#378ADD' }}>Forge</span>
          </span>
        </Link>

        <div className="flex items-center gap-0.5 sm:gap-1">
          {navLinks.map(({ href, label }) => {
            const active = pathname === href || (href !== '/dashboard' && pathname.startsWith(href))
            return (
              <Link
                key={href}
                href={href}
                className="px-2 sm:px-3 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-colors"
                style={active
                  ? { backgroundColor: '#EBF4FF', color: '#185FA5' }
                  : { color: '#6b7280' }
                }
              >
                {label}
              </Link>
            )
          })}
          {credits !== null && (
            <Link
              href="/dashboard/billing"
              className="ml-1 sm:ml-2 px-2 sm:px-3 py-1 rounded-lg text-xs font-semibold border"
              style={{ color: '#185FA5', borderColor: '#378ADD', backgroundColor: '#EBF4FF' }}
              title="Credits remaining"
            >
              {t('credits', { count: credits })}
            </Link>
          )}

          {/* Language switcher */}
          <div className="ml-1 sm:ml-2 flex items-center gap-0.5 border rounded-lg overflow-hidden text-xs font-semibold" style={{ borderColor: '#d1cec7' }}>
            <button
              onClick={() => setLocale('en')}
              className="px-2 py-1.5 transition-colors"
              style={currentLocale !== 'no'
                ? { backgroundColor: '#185FA5', color: '#fff' }
                : { color: '#9ca3af' }}
            >
              EN
            </button>
            <button
              onClick={() => setLocale('no')}
              className="px-2 py-1.5 transition-colors"
              style={currentLocale === 'no'
                ? { backgroundColor: '#185FA5', color: '#fff' }
                : { color: '#9ca3af' }}
            >
              NO
            </button>
          </div>

          <button
            onClick={handleLogout}
            className="ml-1 sm:ml-2 px-2 sm:px-3 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-colors"
            style={{ color: '#9ca3af' }}
          >
            {t('logout')}
          </button>
        </div>
      </div>
    </nav>
  )
}
