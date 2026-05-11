import { NextResponse } from 'next/server'
import { randomBytes } from 'crypto'

const BASE_URL = 'https://contentforge-610.netlify.app'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const userId = searchParams.get('userId')

    if (!userId) {
      return NextResponse.redirect(`${BASE_URL}/dashboard/publish?error=no_user`)
    }

    const state = `${userId}:${randomBytes(8).toString('hex')}`

    const params = new URLSearchParams({
      client_id: process.env.REDDIT_CLIENT_ID!,
      response_type: 'code',
      state,
      redirect_uri: `${BASE_URL}/api/auth/reddit/callback`,
      duration: 'permanent',
      scope: 'submit identity',
    })

    const response = NextResponse.redirect(
      `https://www.reddit.com/api/v1/authorize?${params.toString()}`
    )

    response.cookies.set('reddit_state', state, {
      httpOnly: true,
      secure: true,
      maxAge: 600,
      sameSite: 'lax',
      path: '/',
    })

    return response
  } catch (err) {
    console.error('[reddit] Error:', err)
    return NextResponse.redirect(`${BASE_URL}/dashboard/publish?error=server_error`)
  }
}
