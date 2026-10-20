'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { getSupabase } from '@/lib/supabaseClient'
import { useTranslations } from 'next-intl'
import { AuthShell, AuthField, AuthSubmit, AuthBanner } from '@/components/AuthUI'

export default function ResetPasswordPage() {
  const router = useRouter()
  const t = useTranslations('resetPassword')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ready, setReady] = useState(false)
  // ?velkommen=1: kom fra velkomstlenken (migrasjon 107) — ny bruker som velger
  // sitt FØRSTE passord, ikke «nytt». Leses i nettleseren (ingen Suspense-krav).
  const [velkommen, setVelkommen] = useState(false)
  useEffect(() => {
    setVelkommen(new URLSearchParams(window.location.search).get('velkommen') === '1')
  }, [])

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
      <div
        className="min-h-screen flex items-center justify-center px-4"
        style={{ background: 'var(--paper)', color: '#6B6358', fontFamily: 'var(--font-hanken), sans-serif', fontSize: 15 }}
      >
        {velkommen ? t('welcomeVerifying') : t('verifying')}
      </div>
    )
  }

  return (
    <AuthShell title={velkommen ? t('welcomeTitle') : t('title')} subtitle={velkommen ? t('welcomeSubtitle') : t('subtitle')}>
      {error && <AuthBanner variant="error">{error}</AuthBanner>}

      <form onSubmit={handleSubmit}>
        <AuthField
          label={velkommen ? t('welcomePasswordLabel') : t('newPasswordLabel')}
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          disabled={loading}
          placeholder="••••••••"
          hint={t('passwordHint')}
        />
        <AuthField
          label={t('confirmPasswordLabel')}
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          required
          disabled={loading}
          placeholder="••••••••"
        />
        <AuthSubmit loading={loading} loadingLabel={t('saving')}>{velkommen ? t('welcomeSubmit') : t('setNewPassword')}</AuthSubmit>
      </form>
    </AuthShell>
  )
}
