'use client'

import { Suspense, useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useAuth } from '@/lib/authContext'

// «Åpne Shootout» / «Logg inn med IndigoBoom» lander her. Er brukeren innlogget, utstedes en
// engangskode og vi sender dem til Shootout; ellers via /login med retur hit. ?next= er stien hos
// partneren brukeren ville til.
function ShootoutInner() {
  const { session, loading } = useAuth() as { session: { access_token: string } | null; loading?: boolean }
  const router = useRouter()
  const params = useSearchParams()
  const [error, setError] = useState<string | null>(null)
  const ran = useRef(false)

  useEffect(() => {
    if (loading || ran.current) return
    const next = params?.get('next') || ''
    const here = '/partner/shootout' + (next ? `?next=${encodeURIComponent(next)}` : '')
    if (!session) { router.replace(`/login?next=${encodeURIComponent(here)}`); return }
    ran.current = true
    ;(async () => {
      try {
        const r = await fetch(`/api/partner/sso/start${next ? `?next=${encodeURIComponent(next)}` : ''}`, { method: 'POST', headers: { Authorization: `Bearer ${session.access_token}` } })
        const d = await r.json().catch(() => ({}))
        if (!r.ok || !d.url) throw new Error(d.error || 'Kunne ikke åpne Shootout')
        window.location.href = d.url
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Kunne ikke åpne Shootout')
      }
    })()
  }, [session, loading, params, router])

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--paper)', fontFamily: 'var(--font-hanken), sans-serif', padding: 24 }}>
      <p style={{ color: error ? 'var(--ember)' : 'var(--text-muted)' }}>{error || 'Åpner Shootout…'}</p>
    </div>
  )
}

export default function ShootoutPage() {
  return <Suspense fallback={null}><ShootoutInner /></Suspense>
}
