import { NextResponse } from 'next/server'
import { createHash, randomBytes } from 'crypto'

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

    // PKCE: generate code_verifier and code_challenge (S256)
    const codeVerifier = base64url(randomBytes(32))
    const codeChallenge = base64url(
      createHash('sha256').update(codeVerifier).digest()
    )

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
      state: userId,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
    }
    const query = Object.entries(authParams)
      .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
      .join('&')

    const authorizeUrl = `https://x.com/i/oauth2/authorize?${query}`
    console.log('[x] Starting OAuth for user:', userId)
    console.log('[x] Authorize URL:', authorizeUrl)

    const response = NextResponse.redirect(authorizeUrl)

    // Persist code_verifier for the callback (PKCE).
    response.cookies.set('x_code_verifier', codeVerifier, {
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
