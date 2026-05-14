'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { getSupabase } from '@/lib/supabaseClient'
import { useTranslations } from 'next-intl'

export default function ResetPasswordPage() {
  const router = useRouter()
  const t = useTranslations('resetPassword')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    // Supabase puts the session token in the URL hash after redirect
    const { data: { subscription } } = getSupabase().auth.onAuthStateChange((event: string) => {
      if (event === 'PASSWORD_RECOVERY') setReady(true)
    })
    return () => subscription.unsubscribe()
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (password.length < 8) {
      setError(t('errorPasswordTooShort'))
      return
    }
    if (password !== confirm) {
      setError(t('errorPasswordsDoNotMatch'))
      return
    }

    setLoading(true)
    const { error } = await getSupabase().auth.updateUser({ password })
    if (error) {
      setError(error.message)
      setLoading(false)
    } else {
      router.push('/dashboard')
    }
  }

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4" style={{ backgroundColor: '#F1EFE8' }}>
        <div className="text-gray-500">{t('verifying')}</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ backgroundColor: '#F1EFE8' }}>
      <div className="w-full max-w-md bg-white rounded-2xl shadow-sm p-8 border border-gray-200">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold mb-1" style={{ color: '#0C447C' }}>{t('title')}</h1>
          <p className="text-sm text-gray-500">{t('subtitle')}</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="p-4 rounded-lg bg-red-50 border border-red-200">
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('newPasswordLabel')}</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              disabled={loading}
              className="w-full px-4 py-2.5 rounded-lg text-sm border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-200 disabled:opacity-50"
              placeholder="••••••••"
            />
            <p className="text-xs text-gray-400 mt-1">{t('passwordHint')}</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('confirmPasswordLabel')}</label>
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
              disabled={loading}
              className="w-full px-4 py-2.5 rounded-lg text-sm border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-200 disabled:opacity-50"
              placeholder="••••••••"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 text-white text-sm font-semibold rounded-lg disabled:opacity-50"
            style={{ backgroundColor: '#185FA5' }}
          >
            {loading ? t('saving') : t('setNewPassword')}
          </button>
        </form>
      </div>
    </div>
  )
}
