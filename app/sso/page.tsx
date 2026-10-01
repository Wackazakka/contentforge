'use client'

import { Suspense, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { getSupabase } from '@/lib/supabaseClient'

// Landing for partner-innlogging (fra IndigoBoom Shootout): ?code=… ble utstedt der. API-et løser
// koden inn og gir oss et engangstoken vi bytter i en økt her. Deretter rett til dashbordet, som
// selv oppretter organisasjonen på denne tenanten om den mangler (selvreparasjonen i dashboard/page).
function SsoInner() {
  const params = useSearchParams()
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const ran = useRef(false)

  useEffect(() => {
    if (ran.current) return
    ran.current = true
    const code = params?.get('code')
    const next = params?.get('next')
    const to = next && next.startsWith('/') && !next.startsWith('//') ? next : '/dashboard'
    if (!code) { setError('Mangler innloggingskode.'); return }
    ;(async () => {
      try {
        const r = await fetch('/api/partner/sso/finish', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code }) })
        const d = await r.json().catch(() => ({}))
        if (!r.ok) throw new Error(d.error || 'Innlogging feilet')
        const { error: vErr } = await getSupabase().auth.verifyOtp({ token_hash: d.token_hash, type: 'magiclink' })
        if (vErr) throw vErr
        router.replace(to)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Innlogging feilet')
      }
    })()
  }, [params, router])

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--paper)', fontFamily: 'var(--font-hanken), sans-serif', padding: 24 }}>
      {error ? (
        <div style={{ maxWidth: 440, textAlign: 'center' }}>
          <h1 style={{ fontSize: 24, marginBottom: 12 }}>Kunne ikke logge deg inn</h1>
          <p style={{ color: 'var(--text-muted)', marginBottom: 24 }}>{error}</p>
          <Link href="/login" style={{ color: 'var(--ember)' }}>Logg inn med passord</Link>
        </div>
      ) : (
        <p style={{ color: 'var(--text-muted)' }}>Logger deg inn…</p>
      )}
    </div>
  )
}

export default function SsoPage() {
  return <Suspense fallback={null}><SsoInner /></Suspense>
}
