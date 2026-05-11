'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/lib/authContext'

const ADMIN_EMAILS = ['kilevold@online.no']

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { session, loading, signOut } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (loading) return
    if (!session || !ADMIN_EMAILS.includes(session.user.email ?? '')) {
      router.replace('/login')
    }
  }, [session, loading, router])

  if (loading || !session || !ADMIN_EMAILS.includes(session.user.email ?? '')) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#F1EFE8' }}>
        <div className="text-gray-500">Loading...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#F1EFE8' }}>
      <header className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <Link href="/admin" className="text-lg font-bold" style={{ color: '#0C447C' }}>
            CenterForge <span className="text-xs font-semibold uppercase tracking-widest text-gray-400 ml-1">Admin</span>
          </Link>
          <nav className="flex items-center gap-4 text-sm">
            <Link href="/admin" className="text-gray-600 hover:text-gray-900 font-medium">Overview</Link>
            <Link href="/dashboard" className="text-gray-400 hover:text-gray-600">← App</Link>
          </nav>
        </div>
        <button
          onClick={signOut}
          className="text-xs text-gray-400 hover:text-gray-600 font-medium"
        >
          Sign out
        </button>
      </header>
      <main className="max-w-6xl mx-auto px-6 py-8">
        {children}
      </main>
    </div>
  )
}
