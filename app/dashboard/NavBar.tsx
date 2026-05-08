'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

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

const navLinks = [
  { href: '/dashboard', label: 'Oversikt' },
  { href: '/dashboard/products', label: 'Produkter' },
  { href: '/dashboard/publish', label: 'Publiser' },
]

export default function NavBar() {
  const pathname = usePathname()

  return (
    <nav className="sticky top-0 z-50 border-b" style={{ backgroundColor: '#ffffff', borderColor: '#e5e2d9' }}>
      <div className="max-w-5xl mx-auto px-6 h-14 flex items-center justify-between">
        <Link href="/dashboard" className="flex items-center gap-2">
          <HexagonIcon />
          <span className="text-base font-bold tracking-tight" style={{ color: '#0C447C' }}>
            Center<span style={{ color: '#378ADD' }}>Forge</span>
          </span>
        </Link>
        <div className="flex items-center gap-1">
          {navLinks.map(({ href, label }) => {
            const active = pathname === href || (href !== '/dashboard' && pathname.startsWith(href))
            return (
              <Link
                key={href}
                href={href}
                className="px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
                style={active
                  ? { backgroundColor: '#EBF4FF', color: '#185FA5' }
                  : { color: '#6b7280' }
                }
                onMouseEnter={(e: any) => { if (!active) e.currentTarget.style.backgroundColor = '#f3f4f6' }}
                onMouseLeave={(e: any) => { if (!active) e.currentTarget.style.backgroundColor = 'transparent' }}
              >
                {label}
              </Link>
            )
          })}
        </div>
      </div>
    </nav>
  )
}
