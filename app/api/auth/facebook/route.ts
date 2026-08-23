import { NextResponse } from 'next/server'
import { getMetaApp } from '@/lib/metaApp'

export async function GET(request: Request) {
  // Tenant-bevisst app-valg (PromoMaker for IndigoBoom osv.) — se lib/metaApp
  const app = await getMetaApp()
  try {
    const { searchParams } = new URL(request.url)
    const userId = searchParams.get('userId')
    // Organisasjonen tres gjennom state. UUID-er har ingen punktum, saa
    // separatoren er trygg — og gammelt format (bare userId) virker fortsatt.
    const orgId = searchParams.get('orgId')

    if (!userId) {
      console.error('[facebook] No userId provided')
      return NextResponse.redirect(`${app.returnBase}/dashboard/publish?error=no_user`)
    }

    console.log('[facebook] Starting OAuth flow for user:', userId, 'app:', app.appId)

    const params = new URLSearchParams({
      client_id: app.appId,
      redirect_uri: app.oauthRedirectUri,
      // instagram_basic er PÅKREVD sammen med instagram_content_publish — både
      // for å slå opp sidens IG-konto og som avhengighet i Metas App Review.
      scope:
        'pages_show_list,pages_read_engagement,pages_manage_posts,instagram_basic,instagram_content_publish',
      response_type: 'code',
      state: orgId ? `${userId}.${orgId}` : userId,
    })

    return NextResponse.redirect(`https://www.facebook.com/dialog/oauth?${params.toString()}`)
  } catch (err) {
    console.error('[facebook] Error:', err)
    return NextResponse.redirect(`${app.returnBase}/dashboard/publish?error=server_error`)
  }
}
