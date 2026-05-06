import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

const BASE_URL = 'https://contentforge-610.netlify.app'

export async function GET(request: Request) {
  try {
    // Get session from cookies
    const cookieStore = await cookies()
    const sessionCookie = cookieStore.get('sb-session')

    if (!sessionCookie) {
      console.log('[facebook] No session cookie, redirecting to login')
      return NextResponse.redirect(`${BASE_URL}/login`)
    }

    // Parse session to get user ID
    let userId: string | null = null
    try {
      const session = JSON.parse(sessionCookie.value)
      userId = session.user?.id
    } catch (e) {
      console.error('[facebook] Failed to parse session:', e)
    }

    if (!userId) {
      // Fallback: try to get from auth header or another cookie
      const authHeader = request.headers.get('cookie')
      console.log('[facebook] Could not extract user ID from session, trying alternative methods')
      
      // For now, redirect to login if we can't get user ID
      return NextResponse.redirect(`${BASE_URL}/login`)
    }

    console.log('[facebook] Starting OAuth flow for user:', userId)

    const params = new URLSearchParams({
      client_id: process.env.META_APP_ID!,
      redirect_uri: process.env.META_REDIRECT_URI!,
      scope: 'pages_show_list,pages_read_engagement,pages_manage_posts',
      response_type: 'code',
      state: userId, // send user ID as state parameter
    })

    return NextResponse.redirect(`https://www.facebook.com/dialog/oauth?${params.toString()}`)
  } catch (err) {
    console.error('[facebook] Error:', err)
    return NextResponse.redirect(`${BASE_URL}/dashboard/publish?error=server_error`)
  }
}
