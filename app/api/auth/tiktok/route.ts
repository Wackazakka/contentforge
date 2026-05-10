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
      client_key: process.env.TIKTOK_CLIENT_KEY!,
      redirect_uri: `${BASE_URL}/api/auth/tiktok/callback`,
      response_type: 'code',
      scope: 'user.info.basic,video.upload,video.publish',
      state: userId,
    })

    return NextResponse.redirect(
      `https://www.tiktok.com/v2/auth/authorize/?${params.toString()}`
    )
  } catch (err) {
    console.error('[tiktok] Error:', err)
    return NextResponse.redirect(`${BASE_URL}/dashboard/publish?error=server_error`)
  }
}
