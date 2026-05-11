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
      setError('Invalid email address')
      setLoading(false)
      return
    }
    if (!form.password) {
      setError('Password is required')
      setLoading(false)
      return
    }

    try {
      const { data, error: signInError } = await signIn(form.email, form.password)
      if (signInError) { setError(signInError.message); return }
      if (data.session) router.push('/dashboard')
    } catch (err) {
      setError('An unexpected error occurred')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="w-full max-w-md bg-white rounded-2xl shadow-sm p-8 border border-gray-200">
      <div className="text-center mb-8">
        <div className="flex items-center justify-center gap-2 mb-3">
          <HexagonIcon />
          <span className="text-2xl font-bold" style={{ color: '#0C447C' }}>
            Center<span style={{ color: '#378ADD' }}>Forge</span>
          </span>
        </div>
        <p className="text-sm text-gray-500">Sign in to your account</p>
      </div>

      {message && (
        <div className="mb-5 p-4 rounded-lg bg-green-50 border border-green-200">
          <p className="text-sm text-green-700">{message}</p>
        </div>
      )}

      {error && (
        <div className="mb-5 p-4 rounded-lg bg-red-50 border border-red-200">
          <p className="text-sm text-red-600">{error}</p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            Email
          </label>
          <input
            type="email"
            name="email"
            value={form.email}
            onChange={handleChange}
            disabled={loading}
            className="w-full px-4 py-2.5 rounded-lg text-sm border border-gray-300 bg-white focus:outline-none focus:ring-2 focus:ring-blue-200 disabled:opacity-50 transition-colors"
            placeholder="you@example.com"
          />
        </div>

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="block text-sm font-medium text-gray-700">
              Password
            </label>
            <Link href="/forgot-password" className="text-xs font-medium hover:underline" style={{ color: '#185FA5' }}>
              Forgot password?
            </Link>
          </div>
          <input
            type="password"
            name="password"
            value={form.password}
            onChange={handleChange}
            disabled={loading}
            className="w-full px-4 py-2.5 rounded-lg text-sm border border-gray-300 bg-white focus:outline-none focus:ring-2 focus:ring-blue-200 disabled:opacity-50 transition-colors"
            placeholder="••••••••"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full py-2.5 text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed mt-2"
          style={{ backgroundColor: '#185FA5' }}
        >
          {loading ? 'Signing in...' : 'Sign in'}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-gray-400">
        Don't have an account?{' '}
        <Link href="/register" className="font-medium hover:underline" style={{ color: '#185FA5' }}>
          Sign up
        </Link>
      </p>
    </div>
  )
}
