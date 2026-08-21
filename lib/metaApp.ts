import { getTenant, getTenantOrigin } from './tenantServer'

// Per-tenant Meta-app: merkevaren sluttbrukeren møter i Facebooks samtykke-
// dialog følger appen, ikke tenanten — så hver merkevare som skal møte egne
// sluttbrukere trenger sin egen Meta-app (f.eks. PromoMaker for IndigoBoom).
//
// Nøklene ligger i miljøet som META_APP_ID_<SLUG> / META_APP_SECRET_<SLUG>
// (slug med store bokstaver, '-' → '_'). Finnes ikke paret, gjelder
// standardappen (META_APP_ID / META_APP_SECRET / META_REDIRECT_URI) med
// nøyaktig dagens oppførsel — inkludert retur til contentforge-610.
//
// For en tenant-app kjører hele flyten på tenantens eget domene: OAuth-
// callbacken OG bruker-returen. Domenet må da ligge i appens «Valid OAuth
// Redirect URIs» hos Meta, ellers avviser Facebook dialogen.
export interface MetaApp {
  appId: string
  appSecret: string
  /** redirect_uri i OAuth-flyten — må matche eksakt i begge kall og være allowlistet hos Meta */
  oauthRedirectUri: string
  /** Base for brukerens retur (feil og suksess) — dashboardet på riktig domene */
  returnBase: string
}

const LEGACY_RETURN_BASE = 'https://contentforge-610.netlify.app'

export async function getMetaApp(): Promise<MetaApp> {
  let slug = ''
  let origin = ''
  try {
    const tenant = await getTenant()
    slug = tenant.slug
    origin = await getTenantOrigin()
  } catch {
    /* utenfor request-kontekst → standardapp */
  }

  const key = slug.toUpperCase().replace(/-/g, '_')
  const appId = process.env[`META_APP_ID_${key}`]
  const appSecret = process.env[`META_APP_SECRET_${key}`]
  if (appId && appSecret && origin) {
    return {
      appId,
      appSecret,
      oauthRedirectUri: `${origin}/api/auth/facebook/callback`,
      returnBase: origin,
    }
  }

  return {
    appId: process.env.META_APP_ID!,
    appSecret: process.env.META_APP_SECRET!,
    oauthRedirectUri: process.env.META_REDIRECT_URI!,
    returnBase: LEGACY_RETURN_BASE,
  }
}
