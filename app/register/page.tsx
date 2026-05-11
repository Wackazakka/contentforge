'use client'

import { useState } from 'react'
import Link from 'next/link'
import { signUp, getSupabase } from '@/lib/supabaseClient'

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

export default function RegisterPage() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [registered, setRegistered] = useState(false)
  const [registeredEmail, setRegisteredEmail] = useState('')
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

      if (data?.user?.id) {
        try {
          const supabase = getSupabase()
          const slug = form.email.split('@')[0] + '-' + data.user.id.substring(0, 8)
          await supabase
            .from('organizations')
            .insert({
              name: form.fullName + "'s Organization",
              owner_id: data.user.id,
              slug: slug.toLowerCase(),
              description: 'Default organization for ' + form.fullName,
            })
            .select()
            .single()
        } catch (orgErr) {
          console.error('Organization creation error:', orgErr)
        }

        // Send welcome email (fire and forget)
        fetch('/api/email/welcome', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: form.email, name: form.fullName }),
        }).catch(() => {})
      }

      setRegisteredEmail(form.email)
      setRegistered(true)
    } catch (err) {
      setError('An unexpected error occurred')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  if (registered) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4" style={{ backgroundColor: '#F1EFE8' }}>
        <div className="w-full max-w-md bg-white rounded-2xl shadow-sm p-8 border border-gray-200 text-center">
          <div className="text-4xl mb-4">📬</div>
          <h2 className="text-xl font-bold mb-2" style={{ color: '#0C447C' }}>Check your email</h2>
          <p className="text-sm text-gray-500 mb-6">
            We sent a confirmation link to <strong>{registeredEmail}</strong>. Click it to activate your account.
          </p>
          <Link href="/login" className="text-sm font-medium hover:underline" style={{ color: '#185FA5' }}>
            ← Back to sign in
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ backgroundColor: '#F1EFE8' }}>
      <div className="w-full max-w-md bg-white rounded-2xl shadow-sm p-8 border border-gray-200">
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-2 mb-3">
            <HexagonIcon />
            <span className="text-2xl font-bold" style={{ color: '#0C447C' }}>
              Center<span style={{ color: '#378ADD' }}>Forge</span>
            </span>
          </div>
          <p className="text-sm text-gray-500">Create your account</p>
        </div>

        {error && (
          <div className="mb-5 p-4 rounded-lg bg-red-50 border border-red-200">
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Full name</label>
            <input
              type="text"
              name="fullName"
              value={form.fullName}
              onChange={handleChange}
              disabled={loading}
              className="w-full px-4 py-2.5 rounded-lg text-sm border border-gray-300 bg-white focus:outline-none focus:ring-2 focus:ring-blue-200 disabled:opacity-50 transition-colors"
              placeholder="Jane Smith"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Email</label>
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
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Password</label>
            <input
              type="password"
              name="password"
              value={form.password}
              onChange={handleChange}
              disabled={loading}
              className="w-full px-4 py-2.5 rounded-lg text-sm border border-gray-300 bg-white focus:outline-none focus:ring-2 focus:ring-blue-200 disabled:opacity-50 transition-colors"
              placeholder="••••••••"
            />
            <p className="text-xs text-gray-400 mt-1">Min. 8 characters</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Confirm password</label>
            <input
              type="password"
              name="confirmPassword"
              value={form.confirmPassword}
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
            {loading ? 'Creating account...' : 'Create account'}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-gray-400">
          Already have an account?{' '}
          <Link href="/login" className="font-medium hover:underline" style={{ color: '#185FA5' }}>
            Sign in
          </Link>
        </p>
      </div>
    </div>
  )
}
