import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const BASE_URL = 'https://contentforge-610.netlify.app'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const code = searchParams.get('code')
    const state = searchParams.get('state')
    const error = searchParams.get('error')

    if (error) {
      console.error('[tiktok/callback] Error from TikTok:', error)
      return NextResponse.redirect(`${BASE_URL}/dashboard/publish?error=${error}`)
    }

    if (!code || !state) {
      return NextResponse.redirect(`${BASE_URL}/dashboard/publish?error=missing_params`)
    }

    const userId = state

    // Exchange code for access token
    const tokenRes = await fetch('https://open.tiktokapis.com/v2/oauth/token/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_key: process.env.TIKTOK_CLIENT_KEY!,
        client_secret: process.env.TIKTOK_CLIENT_SECRET!,
        code,
        grant_type: 'authorization_code',
        redirect_uri: `${BASE_URL}/api/auth/tiktok/callback`,
      }).toString(),
    })

    const tokenData = await tokenRes.json()
    console.log('[tiktok/callback] Token response:', JSON.stringify(tokenData))

    if (!tokenData.access_token) {
      console.error('[tiktok/callback] No access token:', tokenData)
      return NextResponse.redirect(`${BASE_URL}/dashboard/publish?error=token_failed`)
    }

    // Fetch user info
    const userRes = await fetch(
      'https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name,avatar_url',
      { headers: { Authorization: `Bearer ${tokenData.access_token}` } }
    )
    const userData = await userRes.json()
    console.log('[tiktok/callback] User data:', JSON.stringify(userData))

    const openId = tokenData.open_id || userData.data?.user?.open_id
    const displayName = userData.data?.user?.display_name || 'TikTok-konto'

    if (!openId) {
      console.error('[tiktok/callback] No open_id found')
      return NextResponse.redirect(`${BASE_URL}/dashboard/publish?error=no_open_id`)
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    await supabase.from('social_connections').upsert(
      {
        user_id: userId,
        platform: 'tiktok',
        page_id: openId,
        page_name: displayName,
        access_token: tokenData.access_token,
        user_access_token: tokenData.refresh_token || null,
      },
      { onConflict: 'user_id,platform,page_id' }
    )

    console.log('[tiktok/callback] ✅ TikTok connected for user:', userId)
    return NextResponse.redirect(`${BASE_URL}/dashboard/publish?connected=tiktok`)
  } catch (err) {
    console.error('[tiktok/callback] Error:', err)
    return NextResponse.redirect(`${BASE_URL}/dashboard/publish?error=server_error`)
  }
}
