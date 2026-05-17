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
      console.error('[x/callback] Error from X:', error)
      return NextResponse.redirect(`${BASE_URL}/dashboard/publish?error=${error}`)
    }

    if (!code || !state) {
      return NextResponse.redirect(`${BASE_URL}/dashboard/publish?error=missing_params`)
    }

    // Retrieve code_verifier from cookie
    const cookieHeader = request.headers.get('cookie') || ''
    const codeVerifier = cookieHeader
      .split(';')
      .map((c) => c.trim())
      .find((c) => c.startsWith('x_code_verifier='))
      ?.split('=')[1]

    if (!codeVerifier) {
      console.error('[x/callback] Missing code_verifier cookie')
      return NextResponse.redirect(`${BASE_URL}/dashboard/publish?error=missing_verifier`)
    }

    const userId = state

    // Exchange code for access token
    const clientId = process.env.X_CLIENT_ID
    const clientSecret = process.env.X_CLIENT_SECRET
    console.log('[x/callback] CLIENT_ID set:', !!clientId, 'len:', clientId?.length, 'SECRET set:', !!clientSecret, 'len:', clientSecret?.length)

    const tokenRes = await fetch('https://api.twitter.com/2/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: `${BASE_URL}/api/auth/x/callback`,
        code_verifier: codeVerifier,
        client_id: clientId!,
        ...(clientSecret ? { client_secret: clientSecret } : {}),
      }).toString(),
    })

    const tokenData = await tokenRes.json()
    console.log('[x/callback] Token response:', JSON.stringify(tokenData))

    if (!tokenData.access_token) {
      console.error('[x/callback] No access token:', tokenData)
      const xError = encodeURIComponent(tokenData.error_description || tokenData.error || 'token_failed')
      return NextResponse.redirect(`${BASE_URL}/dashboard/publish?error=token_failed&detail=${xError}`)
    }

    // Fetch user info
    const userRes = await fetch('https://api.twitter.com/2/users/me?user.fields=name,username', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    })
    const userData = await userRes.json()
    console.log('[x/callback] User data:', JSON.stringify(userData))

    const xUserId = userData.data?.id
    const displayName = userData.data?.name || userData.data?.username || 'X-konto'

    if (!xUserId) {
      console.error('[x/callback] No user ID:', userData)
      return NextResponse.redirect(`${BASE_URL}/dashboard/publish?error=no_user_id`)
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    await supabase.from('social_connections')
      .delete()
      .eq('user_id', userId)
      .eq('platform', 'x')
      .eq('page_id', xUserId)

    await supabase.from('social_connections').insert({
      user_id: userId,
      platform: 'x',
      page_id: xUserId,
      page_name: displayName,
      access_token: tokenData.access_token,
      user_access_token: tokenData.refresh_token || null,
    })

    console.log('[x/callback] ✅ Connected:', displayName, '(', xUserId, ')')

    const response = NextResponse.redirect(`${BASE_URL}/dashboard/publish?connected=x`)
    response.cookies.delete('x_code_verifier')
    return response
  } catch (err) {
    console.error('[x/callback] Error:', err)
    return NextResponse.redirect(`${BASE_URL}/dashboard/publish?error=server_error`)
  }
}
