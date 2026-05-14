'use client'

import { useState } from 'react'
import Link from 'next/link'
import { getSupabase } from '@/lib/supabaseClient'
import { useTranslations } from 'next-intl'

export default function ForgotPasswordPage() {
  const t = useTranslations('forgotPassword')
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const { error } = await getSupabase().auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    })

    if (error) {
      setError(error.message)
    } else {
      setSent(true)
    }
    setLoading(false)
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ backgroundColor: '#F1EFE8' }}>
      <div className="w-full max-w-md bg-white rounded-2xl shadow-sm p-8 border border-gray-200">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold mb-1" style={{ color: '#0C447C' }}>{t('title')}</h1>
          <p className="text-sm text-gray-500">{t('subtitle')}</p>
        </div>

        {sent ? (
          <div className="text-center">
            <div className="text-4xl mb-4">📬</div>
            <p className="text-gray-700 font-medium mb-2">{t('checkEmail')}</p>
            <p className="text-sm text-gray-500 mb-6">
              {t('resetLinkSent')} <strong>{email}</strong>
            </p>
            <Link href="/login" className="text-sm font-medium" style={{ color: '#185FA5' }}>
              {t('backToSignIn')}
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="p-4 rounded-lg bg-red-50 border border-red-200">
                <p className="text-sm text-red-600">{error}</p>
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('emailAddressLabel')}</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={loading}
                className="w-full px-4 py-2.5 rounded-lg text-sm border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-200 disabled:opacity-50"
                placeholder={t('emailPlaceholder')}
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 text-white text-sm font-semibold rounded-lg disabled:opacity-50"
              style={{ backgroundColor: '#185FA5' }}
            >
              {loading ? t('sending') : t('sendResetLink')}
            </button>
            <p className="text-center text-sm text-gray-400">
              <Link href="/login" className="font-medium hover:underline" style={{ color: '#185FA5' }}>
                {t('backToSignIn')}
              </Link>
            </p>
          </form>
        )}
      </div>
    </div>
  )
}
