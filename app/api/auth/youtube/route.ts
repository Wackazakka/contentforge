import { NextResponse } from 'next/server'

const BASE_URL = 'https://contentforge-610.netlify.app'

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

    const params = new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      redirect_uri: `${BASE_URL}/api/auth/youtube/callback`,
      response_type: 'code',
      scope: 'https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly',
      access_type: 'offline',
      prompt: 'consent',
      state: orgId ? `${userId}.${orgId}` : userId,
    })

    return NextResponse.redirect(
      `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
    )
  } catch (err) {
    console.error('[youtube] Error:', err)
    return NextResponse.redirect(`${BASE_URL}/dashboard/publish?error=server_error`)
  }
}
