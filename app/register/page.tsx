'use client'

import { useState } from 'react'
import { signUp, getSupabase } from '@/lib/supabaseClient'
import { useTranslations } from 'next-intl'
import { AuthShell, AuthField, AuthSubmit, AuthBanner, AuthSwitch } from '@/components/AuthUI'
import { useTenant } from '@/lib/tenantContext'

export default function RegisterPage() {
  const t = useTranslations('register')
  const tenant = useTenant()
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
      setError(t('errorFullNameRequired'))
      setLoading(false)
      return
    }
    if (!form.email.includes('@')) {
      setError(t('errorValidEmailRequired'))
      setLoading(false)
      return
    }
    if (form.password.length < 8) {
      setError(t('errorPasswordTooShort'))
      setLoading(false)
      return
    }
    if (form.password !== form.confirmPassword) {
      setError(t('errorPasswordsDoNotMatch'))
      setLoading(false)
      return
    }

    try {
      const { data, error: signUpError } = await signUp(
        form.email,
        form.password,
        form.fullName,
        tenant.slug
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
              // Tenant-kobling (white-label): uuid fra server-oppslaget; 'root'-fallback utelates
              ...(/^[0-9a-f-]{36}$/i.test(tenant.id) ? { tenant_id: tenant.id } : {}),
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
      setError(t('errorUnexpected'))
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  if (registered) {
    return (
      <AuthShell title={t('checkEmailTitle')}>
        <div style={{ fontFamily: 'var(--font-hanken), sans-serif' }}>
          <div style={{ fontSize: 40, marginBottom: 6 }}>📬</div>
          <p style={{ fontSize: 14.5, lineHeight: 1.55, color: '#6B6358', margin: '0 0 22px' }}>
            {t('checkEmailText', { email: registeredEmail })}
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
          label={t('fullNameLabel')}
          type="text"
          name="fullName"
          autoComplete="name"
          value={form.fullName}
          onChange={handleChange}
          disabled={loading}
          placeholder={t('fullNamePlaceholder')}
        />
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
          autoComplete="new-password"
          value={form.password}
          onChange={handleChange}
          disabled={loading}
          placeholder={t('passwordPlaceholder')}
          hint={t('passwordHint')}
        />
        <AuthField
          label={t('confirmPasswordLabel')}
          type="password"
          name="confirmPassword"
          autoComplete="new-password"
          value={form.confirmPassword}
          onChange={handleChange}
          disabled={loading}
          placeholder={t('confirmPasswordPlaceholder')}
        />
        <AuthSubmit loading={loading} loadingLabel={t('creatingAccount')}>{t('createAccount')}</AuthSubmit>
      </form>

      <AuthSwitch prompt={t('alreadyHaveAccount')} linkLabel={t('signIn')} href="/login" />
    </AuthShell>
  )
}
