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

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: clientId,
      redirect_uri: `${BASE_URL}/api/auth/x/callback`,
      scope: 'tweet.read tweet.write users.read offline.access',
      state: userId,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
    })

    console.log('[x] Starting OAuth for user:', userId)

    const response = NextResponse.redirect(
      `https://x.com/i/oauth2/authorize?${params.toString()}`
    )

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
