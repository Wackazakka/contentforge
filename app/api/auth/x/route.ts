import { NextResponse } from 'next/server'
import { randomBytes } from 'crypto'

const BASE_URL = 'https://contentforge-610.netlify.app'

function base64url(buffer: Buffer): string {
  return buffer
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '')
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const userId = searchParams.get('userId')
    // Organisasjonen tres gjennom state. UUID-er har ingen punktum, saa
    // separatoren er trygg — og gammelt format (bare userId) virker fortsatt.
    const orgId = searchParams.get('orgId')

    if (!userId) {
      return NextResponse.redirect(`${BASE_URL}/dashboard/publish?error=no_user`)
    }

    const clientId = process.env.X_CLIENT_ID?.trim()
    if (!clientId) {
      console.error('[x] Missing X_CLIENT_ID env var')
      return NextResponse.redirect(
        `${BASE_URL}/dashboard/publish?error=server_error&detail=missing_client_id`
      )
    }

    // The CenterForge X app is a CONFIDENTIAL client ("Web App, Automated
    // App or Bot"). Per X's OAuth 2.0 spec, PKCE (code_challenge /
    // code_verifier) is ONLY for public clients (Native App). Sending PKCE
    // parameters for a confidential client makes X immediately reject the
    // request with "Something went wrong" before the consent screen.
    //
    // Instead we use a random `state` value for CSRF protection and persist
    // the userId in an httpOnly cookie keyed nothing-fancy, tying it to the
    // state value so the callback can recover both and verify them.
    const state = base64url(randomBytes(16))

    // Build the authorize URL manually. URLSearchParams encodes spaces as
    // "+", which X's /authorize endpoint accepts inconsistently — its own
    // docs use %20-separated scopes. We encode each value with
    // encodeURIComponent so scope spaces become %20 and redirect_uri is
    // byte-exact, removing it as a possible cause of the pre-consent
    // "Something went wrong" rejection.
    const authParams: Record<string, string> = {
      response_type: 'code',
      client_id: clientId,
      redirect_uri: `${BASE_URL}/api/auth/x/callback`,
      scope: 'tweet.read tweet.write users.read',
      state,
    }
    const query = Object.entries(authParams)
      .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
      .join('&')

    const authorizeUrl = `https://x.com/i/oauth2/authorize?${query}`
    console.log('[x] Starting OAuth for user:', userId)
    console.log('[x] Authorize URL:', authorizeUrl)

    const response = NextResponse.redirect(authorizeUrl)

    // Persist state + userId for the callback. The callback verifies the
    // returned `state` matches and recovers the userId from this cookie.
    // Organisasjonen legges paa brukerdelen: «state:bruker[.organisasjon]»
    response.cookies.set('x_state_user', `${state}:${orgId ? `${userId}.${orgId}` : userId}`, {
      httpOnly: true,
      secure: true,
      maxAge: 600,
      sameSite: 'lax',
      path: '/',
    })

    return response
  } catch (err) {
    console.error('[x] Error:', err)
    return NextResponse.redirect(
      `${BASE_URL}/dashboard/publish?error=server_error`
    )
  }
}
