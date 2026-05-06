import { NextResponse } from 'next/server'

const BASE_URL = 'https://contentforge-610.netlify.app'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const userId = searchParams.get('userId')

    if (!userId) {
      console.error('[facebook] No userId provided')
      return NextResponse.redirect(`${BASE_URL}/dashboard/publish?error=no_user`)
    }

    console.log('[facebook] Starting OAuth flow for user:', userId)

    const params = new URLSearchParams({
      client_id: process.env.META_APP_ID!,
      redirect_uri: process.env.META_REDIRECT_URI!,
      scope: 'pages_show_list,pages_read_engagement,pages_manage_posts',
      response_type: 'code',
      state: userId,
    })

    return NextResponse.redirect(`https://www.facebook.com/dialog/oauth?${params.toString()}`)
  } catch (err) {
    console.error('[facebook] Error:', err)
    return NextResponse.redirect(`${BASE_URL}/dashboard/publish?error=server_error`)
  }
}
