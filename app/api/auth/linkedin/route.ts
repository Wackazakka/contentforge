import { NextResponse } from 'next/server'

const BASE_URL = 'https://contentforge-610.netlify.app'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const userId = searchParams.get('userId')

    if (!userId) {
      return NextResponse.redirect(`${BASE_URL}/dashboard/publish?error=no_user`)
    }

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: process.env.LINKEDIN_CLIENT_ID!,
      redirect_uri: `${BASE_URL}/api/auth/linkedin/callback`,
      state: userId,
      scope: 'openid profile email w_member_social w_organization_social',
    })

    return NextResponse.redirect(
      `https://www.linkedin.com/oauth/v2/authorization?${params.toString()}`
    )
  } catch (err) {
    console.error('[linkedin] Error:', err)
    return NextResponse.redirect(`${BASE_URL}/dashboard/publish?error=server_error`)
  }
}
