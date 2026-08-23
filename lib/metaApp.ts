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

  // ID og hemmelighet MÅ komme fra samme app — derfor alt-eller-intet på paret.
  const key = slug.toUpperCase().replace(/-/g, '_')
  const tenantAppId = process.env[`META_APP_ID_${key}`]
  const tenantAppSecret = process.env[`META_APP_SECRET_${key}`]
  const harEgenApp = Boolean(tenantAppId && tenantAppSecret)

  const appId = harEgenApp ? tenantAppId! : process.env.META_APP_ID!
  const appSecret = harEgenApp ? tenantAppSecret! : process.env.META_APP_SECRET!

  // Standardappen er nå CenterForge (1948980362443505), og den har ALLE
  // tenant-domenene i sin «Valid OAuth Redirect URIs». Derfor kan også
  // standardgrenen kjøre flyten på tenantens eget domene.
  // Før dette returnerte den hardkodet til contentforge-610: hver white-label
  // uten egen app-nøkkel fullførte samtykket og landet på et fremmed domene
  // uten sesjon — samme feil som stoppet IndigoBoom i august.
  // ⚠️ Nytt tenant-domene må inn i appens allowlist hos Meta, ellers avviser
  // Facebook dialogen med «URL blocked».
  if (origin) {
    return {
      appId,
      appSecret,
      oauthRedirectUri: `${origin}/api/auth/facebook/callback`,
      returnBase: origin,
    }
  }

  // Utenfor request-kontekst finnes ingen tenant å utlede domenet fra.
  return {
    appId,
    appSecret,
    oauthRedirectUri: process.env.META_REDIRECT_URI!,
    returnBase: LEGACY_RETURN_BASE,
  }
}
