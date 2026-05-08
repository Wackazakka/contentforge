'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { signIn } from '@/lib/supabaseClient'

function HexagonIcon() {
  return (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <polygon
        points="12,2.5 20.8,7.75 20.8,16.25 12,21.5 3.2,16.25 3.2,7.75"
        stroke="#378ADD"
        strokeWidth="1.75"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  )
}

export function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [form, setForm] = useState({ email: '', password: '' })

  useEffect(() => {
    const msg = searchParams.get('message')
    if (msg) setMessage(decodeURIComponent(msg))
  }, [searchParams])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target
    setForm((prev) => ({ ...prev, [name]: value }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    if (!form.email.includes('@')) {
      setError('Ugyldig e-postadresse')
      setLoading(false)
      return
    }
    if (!form.password) {
      setError('Passord er påkrevd')
      setLoading(false)
      return
    }

    try {
      const { data, error: signInError } = await signIn(form.email, form.password)
      if (signInError) { setError(signInError.message); return }
      if (data.session) router.push('/dashboard')
    } catch (err) {
      setError('En uventet feil oppstod')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="w-full max-w-md rounded-2xl shadow-sm p-8 border" style={{ backgroundColor: '#ffffff', borderColor: '#e5e2d9' }}>
      <div className="text-center mb-8">
        <div className="flex items-center justify-center gap-2 mb-3">
          <HexagonIcon />
          <span className="text-2xl font-bold" style={{ color: '#0C447C' }}>
            Center<span style={{ color: '#378ADD' }}>Forge</span>
          </span>
        </div>
        <p className="text-sm" style={{ color: '#6b7280' }}>Logg inn på din konto</p>
      </div>

      {message && (
        <div className="mb-5 p-4 rounded-lg" style={{ backgroundColor: '#f0faf6', border: '1px solid #1D9E75' }}>
          <p className="text-sm" style={{ color: '#1D9E75' }}>{message}</p>
        </div>
      )}

      {error && (
        <div className="mb-5 p-4 rounded-lg" style={{ backgroundColor: '#fef2f2', border: '1px solid #fca5a5' }}>
          <p className="text-sm text-red-600">{error}</p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1.5" style={{ color: '#2C2C2A' }}>
            E-post
          </label>
          <input
            type="email"
            name="email"
            value={form.email}
            onChange={handleChange}
            disabled={loading}
            className="w-full px-4 py-2.5 rounded-lg text-sm focus:outline-none disabled:opacity-50 transition-colors"
            style={{ backgroundColor: '#F1EFE8', border: '1px solid #d1cec7', color: '#2C2C2A' }}
            placeholder="du@eksempel.no"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1.5" style={{ color: '#2C2C2A' }}>
            Passord
          </label>
          <input
            type="password"
            name="password"
            value={form.password}
            onChange={handleChange}
            disabled={loading}
            className="w-full px-4 py-2.5 rounded-lg text-sm focus:outline-none disabled:opacity-50 transition-colors"
            style={{ backgroundColor: '#F1EFE8', border: '1px solid #d1cec7', color: '#2C2C2A' }}
            placeholder="••••••••"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full py-2.5 text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed mt-2"
          style={{ backgroundColor: '#185FA5' }}
        >
          {loading ? 'Logger inn...' : 'Logg inn'}
        </button>
      </form>

      <p className="mt-6 text-center text-sm" style={{ color: '#9ca3af' }}>
        Har du ikke konto?{' '}
        <Link href="/register" className="font-medium hover:underline" style={{ color: '#185FA5' }}>
          Registrer deg
        </Link>
      </p>
    </div>
  )
}
