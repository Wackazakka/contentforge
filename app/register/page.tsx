'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { signUp } from '@/lib/supabaseClient'

export default function RegisterPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState({
    fullName: '',
    email: '',
    password: '',
    confirmPassword: '',
  })

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target
    setForm((prev) => ({ ...prev, [name]: value }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    // Validation
    if (!form.fullName.trim()) {
      setError('Full name is required')
      setLoading(false)
      return
    }
    if (!form.email.includes('@')) {
      setError('Valid email is required')
      setLoading(false)
      return
    }
    if (form.password.length < 8) {
      setError('Password must be at least 8 characters')
      setLoading(false)
      return
    }
    if (form.password !== form.confirmPassword) {
      setError('Passwords do not match')
      setLoading(false)
      return
    }

    try {
      const { data, error: signUpError } = await signUp(
        form.email,
        form.password,
        form.fullName
      )

      if (signUpError) {
        setError(signUpError.message)
        return
      }

      // Success - redirect to login or dashboard
      router.push('/login?message=Sign%20up%20successful!%20Please%20log%20in.')
    } catch (err) {
      setError('An unexpected error occurred')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 to-slate-800 flex items-center justify-center px-4">
      <div className="w-full max-w-md bg-slate-800 rounded-lg shadow-lg p-8 border border-slate-700">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">ContentForge</h1>
          <p className="text-slate-400">Create stunning content with AI</p>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-500/10 border border-red-500 rounded-lg">
            <p className="text-red-400 text-sm">{error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">
              Full Name
            </label>
            <input
              type="text"
              name="fullName"
              value={form.fullName}
              onChange={handleChange}
              disabled={loading}
              className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:border-blue-500 disabled:opacity-50"
              placeholder="John Doe"
            />
          </div>

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
            <p className="text-xs text-slate-400 mt-1">Min. 8 characters</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">
              Confirm Password
            </label>
            <input
              type="password"
              name="confirmPassword"
              value={form.confirmPassword}
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
            {loading ? 'Creating account...' : 'Sign Up'}
          </button>
        </form>

        <div className="mt-6 text-center">
          <p className="text-slate-400 text-sm">
            Already have an account?{' '}
            <Link href="/login" className="text-blue-400 hover:text-blue-300">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
