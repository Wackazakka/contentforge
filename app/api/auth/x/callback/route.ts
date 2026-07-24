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
      return NextResponse.redirect(
        `${BASE_URL}/dashboard/publish?error=missing_params`
      )
    }

    // Recover state + userId from the cookie set by the auth route and
    // verify the returned `state` matches (CSRF protection). The X app is a
    // confidential client, so there is NO PKCE code_verifier — the userId is
    // carried in this httpOnly cookie instead.
    const cookieHeader = request.headers.get('cookie') || ''
    const stateUser = cookieHeader
      .split(';')
      .map((c) => c.trim())
      .find((c) => c.startsWith('x_state_user='))
      ?.slice('x_state_user='.length)

    if (!stateUser) {
      console.error('[x/callback] Missing x_state_user cookie')
      return NextResponse.redirect(
        `${BASE_URL}/dashboard/publish?error=missing_state`
      )
    }

    const sep = stateUser.indexOf(':')
    const cookieState = sep === -1 ? stateUser : stateUser.slice(0, sep)
    const userId = sep === -1 ? '' : stateUser.slice(sep + 1)

    if (!userId || cookieState !== state) {
      console.error(
        '[x/callback] State mismatch. cookieState set:',
        !!cookieState,
        'matches:',
        cookieState === state
      )
      return NextResponse.redirect(
        `${BASE_URL}/dashboard/publish?error=state_mismatch`
      )
    }

    // --- Exchange authorization code for an access token ---
    //
    // The CenterForge X app is a CONFIDENTIAL client (Web App). For a
    // confidential client, X requires HTTP Basic authentication on the token
    // endpoint:
    //   Authorization: Basic base64(client_id:client_secret)
    // The credentials must NOT also be duplicated in the request body
    // (RFC 6749 — one authentication method only).
    //
    // Env vars are trimmed: Netlify frequently appends a trailing newline on
    // paste, which silently corrupts the Basic auth string.
    const clientId = process.env.X_CLIENT_ID?.trim()
    const clientSecret = process.env.X_CLIENT_SECRET?.trim()

    if (!clientId || !clientSecret) {
      console.error(
        '[x/callback] Missing credentials. CLIENT_ID set:',
        !!clientId,
        'CLIENT_SECRET set:',
        !!clientSecret
      )
      return NextResponse.redirect(
        `${BASE_URL}/dashboard/publish?error=token_failed&detail=missing_credentials`
      )
    }

    const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')

    const tokenRes = await fetch('https://api.x.com/2/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${basic}`,
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: `${BASE_URL}/api/auth/x/callback`,
      }).toString(),
    })

    const tokenData = await tokenRes.json()
    console.log(
      '[x/callback] Token response status:',
      tokenRes.status,
      'error:',
      tokenData.error ?? null,
      'error_description:',
      tokenData.error_description ?? null,
      'has_access_token:',
      !!tokenData.access_token
    )

    if (!tokenData.access_token) {
      console.error('[x/callback] No access token:', tokenData)
      const detail = encodeURIComponent(
        tokenData.error_description || tokenData.error || 'token_failed'
      )
      return NextResponse.redirect(
        `${BASE_URL}/dashboard/publish?error=token_failed&detail=${detail}`
      )
    }

    // Fetch the authenticated user's profile.
    const userRes = await fetch(
      'https://api.x.com/2/users/me?user.fields=name,username',
      { headers: { Authorization: `Bearer ${tokenData.access_token}` } }
    )
    const userData = await userRes.json()
    console.log('[x/callback] User data:', JSON.stringify(userData))

    const xUserId = userData.data?.id
    const displayName =
      userData.data?.name || userData.data?.username || 'X-konto'

    if (!xUserId) {
      console.error('[x/callback] No user ID:', userData)
      return NextResponse.redirect(
        `${BASE_URL}/dashboard/publish?error=no_user_id`
      )
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // Atomisk upsert på (user_id, platform, page_id) — matcher de andre
    // callbackene og fjerner race-vinduet i det gamle delete-så-insert-mønsteret.
    const { error: insertError } = await supabase
      .from('social_connections')
      .upsert(
        {
          user_id: userId,
          platform: 'x',
          page_id: xUserId,
          page_name: displayName,
          access_token: tokenData.access_token,
          user_access_token: tokenData.refresh_token || null,
        },
        { onConflict: 'user_id,platform,page_id' }
      )

    if (insertError) {
      console.error('[x/callback] Supabase upsert error:', insertError)
      return NextResponse.redirect(
        `${BASE_URL}/dashboard/publish?error=db_error`
      )
    }

    console.log('[x/callback] Connected:', displayName, '(', xUserId, ')')

    const response = NextResponse.redirect(
      `${BASE_URL}/dashboard/publish?connected=x`
    )
    response.cookies.delete('x_state_user')
    return response
  } catch (err) {
    console.error('[x/callback] Error:', err)
    return NextResponse.redirect(
      `${BASE_URL}/dashboard/publish?error=server_error`
    )
  }
}
