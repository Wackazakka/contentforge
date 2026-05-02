'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { signIn } from '@/lib/supabaseClient'

export function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [form, setForm] = useState({
    email: '',
    password: '',
  })

  useEffect(() => {
    const msg = searchParams.get('message')
    if (msg) {
      setMessage(decodeURIComponent(msg))
    }
  }, [searchParams])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target
    setForm((prev) => ({ ...prev, [name]: value }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    // Validation
    if (!form.email.includes('@')) {
      setError('Valid email is required')
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

      if (signInError) {
        setError(signInError.message)
        return
      }

      if (data.session) {
        // Success - redirect to dashboard
        router.push('/dashboard')
      }
    } catch (err) {
      setError('An unexpected error occurred')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="w-full max-w-md bg-slate-800 rounded-lg shadow-lg p-8 border border-slate-700">
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold text-white mb-2">ContentForge</h1>
        <p className="text-slate-400">Create stunning content with AI</p>
      </div>

      {message && (
        <div className="mb-6 p-4 bg-green-500/10 border border-green-500 rounded-lg">
          <p className="text-green-400 text-sm">{message}</p>
        </div>
      )}

      {error && (
        <div className="mb-6 p-4 bg-red-500/10 border border-red-500 rounded-lg">
          <p className="text-red-400 text-sm">{error}</p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-1">
            Email
          </label>
          <input
            type="email"
            name="email"
            value={form.email}
            onChange={handleChange}
            disabled={loading}
            className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:border-blue-500 disabled:opacity-50"
            placeholder="you@example.com"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-300 mb-1">
            Password
          </label>
          <input
            type="password"
            name="password"
            value={form.password}
            onChange={handleChange}
            disabled={loading}
            className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:border-blue-500 disabled:opacity-50"
            placeholder="••••••••"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? 'Signing in...' : 'Sign In'}
        </button>
      </form>

      <div className="mt-6 text-center">
        <p className="text-slate-400 text-sm">
          Don't have an account?{' '}
          <Link href="/register" className="text-blue-400 hover:text-blue-300">
            Sign up
          </Link>
        </p>
      </div>
    </div>
  )
}
