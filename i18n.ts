import { getRequestConfig } from 'next-intl/server'
import { cookies } from 'next/headers'

export const locales = ['en', 'no'] as const
export type Locale = (typeof locales)[number]
export const defaultLocale: Locale = 'en'

// Vertikal-overstyringer: fletter messages/verticals/{vertical}.{locale}.json
// over basismeldingene — override-verdier vinner, alt annet beholdes.
function deepMerge(base: unknown, override: unknown): unknown {
  if (typeof base !== 'object' || base === null || Array.isArray(base)) return override ?? base
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) }
  for (const k of Object.keys((override as Record<string, unknown>) || {})) {
    const o = (override as Record<string, unknown>)[k]
    out[k] = k in out ? deepMerge(out[k], o) : o
  }
  return out
}

export default getRequestConfig(async () => {
  // Tenantens standardspråk (f.eks. norsk for VoiceBank) — cookien vinner alltid
  let tenantLocale: string | null = null
  let vertical: string | null = null
  try {
    const { getTenant } = await import('@/lib/tenantServer')
    const tenant = await getTenant()
    tenantLocale = tenant.default_locale ?? null
    vertical = tenant.vertical ?? null
  } catch { /* root-fallback */ }
  const cookieStore = await cookies()
  const localeCookie = cookieStore.get('NEXT_LOCALE')?.value
  const locale: Locale =
    localeCookie && locales.includes(localeCookie as Locale)
      ? (localeCookie as Locale)
      : tenantLocale && locales.includes(tenantLocale as Locale)
        ? (tenantLocale as Locale)
        : defaultLocale

  let messages = (await import(`./messages/${locale}.json`)).default
  if (vertical) {
    try {
      const override = (await import(`./messages/verticals/${vertical}.${locale}.json`)).default
      messages = deepMerge(messages, override) as typeof messages
    } catch { /* ingen vertikal-fil for dette språket — basis gjelder */ }
  }

  return { locale, messages }
})
