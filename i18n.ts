import { getRequestConfig } from 'next-intl/server'
import { cookies } from 'next/headers'

export const locales = ['en', 'no'] as const
export type Locale = (typeof locales)[number]
export const defaultLocale: Locale = 'en'

export default getRequestConfig(async () => {
  // Tenantens standardspråk (f.eks. norsk for VoiceBank) — cookien vinner alltid
  let tenantLocale: string | null = null
  try {
    const { getTenant } = await import('@/lib/tenantServer')
    tenantLocale = (await getTenant()).default_locale ?? null
  } catch { /* root-fallback */ }
  const cookieStore = await cookies()
  const localeCookie = cookieStore.get('NEXT_LOCALE')?.value
  const locale: Locale =
    localeCookie && locales.includes(localeCookie as Locale)
      ? (localeCookie as Locale)
      : tenantLocale && locales.includes(tenantLocale as Locale)
        ? (tenantLocale as Locale)
        : defaultLocale

  return {
    locale,
    messages: (await import(`./messages/${locale}.json`)).default,
  }
})
