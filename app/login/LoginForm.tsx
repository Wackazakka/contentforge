'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { signIn } from '@/lib/supabaseClient'
import { useTranslations } from 'next-intl'
import { AuthShell, AuthField, AuthSubmit, AuthBanner, AuthSwitch, emberLink } from '@/components/AuthUI'

export function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const t = useTranslations('login')
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
      setError(t('errorInvalidEmail'))
      setLoading(false)
      return
    }
    if (!form.password) {
      setError(t('errorPasswordRequired'))
      setLoading(false)
      return
    }

    try {
      const { data, error: signInError } = await signIn(form.email, form.password)
      if (signInError) { setError(signInError.message); return }
      if (data.session) router.push('/dashboard')
    } catch (err) {
      setError(t('errorUnexpected'))
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthShell title={t('title')} subtitle={t('subtitle')}>
      {message && <AuthBanner variant="success">{message}</AuthBanner>}
      {error && <AuthBanner variant="error">{error}</AuthBanner>}

      <form onSubmit={handleSubmit}>
        <AuthField
          label={t('emailLabel')}
          type="email"
          name="email"
          autoComplete="email"
          value={form.email}
          onChange={handleChange}
          disabled={loading}
          placeholder={t('emailPlaceholder')}
        />
        <AuthField
          label={t('passwordLabel')}
          type="password"
          name="password"
          autoComplete="current-password"
          value={form.password}
          onChange={handleChange}
          disabled={loading}
          placeholder={t('passwordPlaceholder')}
          rightSlot={
            <Link href="/forgot-password" style={{ ...emberLink, fontSize: 13.5, fontWeight: 600 }}>
              {t('forgotPassword')}
            </Link>
          }
        />
        <AuthSubmit loading={loading} loadingLabel={t('signingIn')}>{t('signIn')}</AuthSubmit>
      </form>

      <AuthSwitch prompt={t('noAccount')} linkLabel={t('signUp')} href="/register" />
    </AuthShell>
  )
}
