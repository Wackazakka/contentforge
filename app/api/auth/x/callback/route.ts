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

    // --- Exchange code for access token ---
    //
    // IMPORTANT: X (Twitter) OAuth 2.0 token endpoint rules.
    //
    // X apps are CONFIDENTIAL clients by default. For confidential clients the
    // token endpoint REQUIRES HTTP Basic authentication:
    //   Authorization: Basic base64(client_id:client_secret)
    // and the credentials must NOT also appear in the request body. Sending
    // both an Authorization header AND client_id/client_secret in the body is
    // an RFC 6749 violation and X responds with:
    //   {"error":"unauthorized_client","error_description":"Missing valid authorization header"}
    // The exact same error is returned when NO Authorization header is sent for
    // a confidential client (the previous behaviour of this code).
    //
    // Public/native clients instead send only client_id in the body and NO
    // Authorization header.
    //
    // We auto-detect the client type by base64-decoding the client_id: the
    // decoded value ends in ":ci" for confidential clients and ":na" for
    // native/public clients (X-specific convention).

    // Trim env vars: Netlify (and most dashboards) frequently introduce a
    // trailing newline / whitespace on paste, which silently corrupts both the
    // Basic auth string and body credentials.
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

    // Detect confidential vs public client from the client_id suffix.
    let isConfidential = true // X default; safest assumption
    try {
      const decodedClientId = Buffer.from(clientId, 'base64').toString('utf8')
      if (decodedClientId.endsWith(':na')) {
        isConfidential = false
      } else if (decodedClientId.endsWith(':ci')) {
        isConfidential = true
      }
      // Log only the suffix, never the decoded credential material.
      console.log(
        '[x/callback] client_id decoded suffix:',
        decodedClientId.slice(-3),
        '-> confidential:',
        isConfidential
      )
    } catch {
      console.warn(
        '[x/callback] Could not base64-decode client_id; assuming confidential client'
      )
    }

    // Safe diagnostics — never log raw secret values.
    console.log(
      '[x/callback] CLIENT_ID len:',
      clientId.length,
      'CLIENT_SECRET len:',
      clientSecret.length,
      '| raw env had trailing ws:',
      process.env.X_CLIENT_ID !== clientId ||
        process.env.X_CLIENT_SECRET !== clientSecret,
      '| auth mode:',
      isConfidential ? 'basic-header' : 'public-body'
    )

    const tokenHeaders: Record<string, string> = {
      'Content-Type': 'application/x-www-form-urlencoded',
    }

    const bodyParams: Record<string, string> = {
      grant_type: 'authorization_code',
      code,
      redirect_uri: `${BASE_URL}/api/auth/x/callback`,
      code_verifier: codeVerifier,
    }

    if (isConfidential) {
      // Confidential client: Basic auth header ONLY. Do NOT put client_id /
      // client_secret in the body (RFC 6749 — one auth method only).
      const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')
      tokenHeaders.Authorization = `Basic ${basic}`
    } else {
      // Public/native client: client_id in body, no Authorization header.
      bodyParams.client_id = clientId
    }

    const tokenRes = await fetch('https://api.x.com/2/oauth2/token', {
      method: 'POST',
      headers: tokenHeaders,
      body: new URLSearchParams(bodyParams).toString(),
    })

    const tokenData = await tokenRes.json()
    // Log status + error fields but redact any token material.
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
