'use client'

import { useState } from 'react'
import { getSupabase } from '@/lib/supabaseClient'
import { useTranslations } from 'next-intl'
import { AuthShell, AuthField, AuthSubmit, AuthBanner, AuthSwitch } from '@/components/AuthUI'

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

  if (sent) {
    return (
      <AuthShell title={t('checkEmail')}>
        <div style={{ fontFamily: 'var(--font-hanken), sans-serif' }}>
          <div style={{ fontSize: 40, marginBottom: 6 }}>📬</div>
          <p style={{ fontSize: 14.5, lineHeight: 1.55, color: '#6B6358', margin: '0 0 22px' }}>
            {t('resetLinkSent')} <strong style={{ color: '#3A352C' }}>{email}</strong>
          </p>
          <AuthSwitch linkLabel={t('backToSignIn')} href="/login" />
        </div>
      </AuthShell>
    )
  }

  return (
    <AuthShell title={t('title')} subtitle={t('subtitle')}>
      {error && <AuthBanner variant="error">{error}</AuthBanner>}

      <form onSubmit={handleSubmit}>
        <AuthField
          label={t('emailAddressLabel')}
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          disabled={loading}
          placeholder={t('emailPlaceholder')}
        />
        <AuthSubmit loading={loading} loadingLabel={t('sending')}>{t('sendResetLink')}</AuthSubmit>
      </form>

      <AuthSwitch linkLabel={t('backToSignIn')} href="/login" />
    </AuthShell>
  )
}
