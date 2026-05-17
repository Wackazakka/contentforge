import { NextResponse } from 'next/server'
import { createHash, randomBytes } from 'crypto'

const BASE_URL = 'https://contentforge-610.netlify.app'

function base64url(buffer: Buffer): string {
  return buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const userId = searchParams.get('userId')

    if (!userId) {
      return NextResponse.redirect(`${BASE_URL}/dashboard/publish?error=no_user`)
    }

    // PKCE: generate code_verifier and code_challenge
    const codeVerifier = base64url(randomBytes(32))
    const codeChallenge = base64url(createHash('sha256').update(codeVerifier).digest())

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: process.env.X_CLIENT_ID!,
      redirect_uri: `${BASE_URL}/api/auth/x/callback`,
      scope: 'tweet.read tweet.write users.read media.write offline.access',
      state: userId,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      force_login: 'true',
    })

    const response = NextResponse.redirect(
      `https://twitter.com/i/oauth2/authorize?${params.toString()}`
    )

    // Store code_verifier in cookie for callback
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
    return NextResponse.redirect(`${BASE_URL}/dashboard/publish?error=server_error`)
  }
}
