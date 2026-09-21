'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { signIn } from '@/lib/supabaseClient'
import { useTranslations } from 'next-intl'
import { AuthShell, AuthField, AuthSubmit, AuthBanner, AuthSwitch, emberLink } from '@/components/AuthUI'
import { useTenant } from '@/lib/tenantContext'
import { produktnavn } from '@/lib/tenantNames'

export function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const t = useTranslations('login')
  const tenant = useTenant()
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
      if (data.session) {
        // Valgfri intern retur-sti (?next=/for-deg/kreditt) — kun relative stier
        const next = searchParams?.get('next')
        router.push(next && next.startsWith('/') && !next.startsWith('//') ? next : '/dashboard')
      }
    } catch (err) {
      setError(t('errorUnexpected'))
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  // SKILTING, IKKE EN ANDRE INNLOGGING (Lars 21.09).
  //
  // Landingssiden har to dører, men begge endte i samme nøytrale skjema: en
  // skuespiller som klikket «Jeg har en stemme» landet et sted som snakket til
  // en kunde. `?rolle=stemme` bytter TEKSTEN — overskrift, ingress og hvor
  // «har du ikke konto» peker — og ingenting annet.
  //
  // 🔑 SAMME KONTO OG SAMME SKJEMA. Rollen er en egenskap ved personen, ikke
  // ved døren hun kom inn gjennom: en casting-agent kommer både med stemmer og
  // ønsker stemmer, og to innlogginger ville tvunget henne til å velge side.
  // Hvor man havner ETTER innlogging avgjøres uansett av rollen
  // (app/dashboard/page.tsx sender en ren rettighetshaver til /min-stemme),
  // ikke av denne parameteren.
  //
  // ⚠️ Uten parameteren er siden nøyaktig som før — den deles av alle
  // tenantene. Og parameteren ignoreres der rettighetsforvaltningen er av, for
  // ellers ville «søk om å bli det» pekt på en side som svarer 404.
  const rettighetshaver =
    searchParams.get('rolle') === 'stemme' && tenant.twinledger_enabled !== false

  // Man logger inn paa TJENESTEN, ikke paa selskapet bak den.
  return (
    <AuthShell
      title={rettighetshaver ? t('title_rights') : t('title')}
      subtitle={rettighetshaver ? t('subtitle_rights') : t('subtitle', { name: produktnavn(tenant) })}
    >
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

      {/* En rettighetshaver uten konto skal ikke til /register — der lager man
          en KUNDEkonto. Veien inn i banken går gjennom søknaden. */}
      {rettighetshaver ? (
        <AuthSwitch prompt={t('noAccount_rights')} linkLabel={t('signUp_rights')} href="/bli-stemme" />
      ) : (
        <AuthSwitch prompt={t('noAccount')} linkLabel={t('signUp')} href="/register" />
      )}
    </AuthShell>
  )
}
