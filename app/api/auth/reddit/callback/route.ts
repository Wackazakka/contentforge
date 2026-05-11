import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const BASE_URL = 'https://contentforge-610.netlify.app'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const code = searchParams.get('code')
    const state = searchParams.get('state')
    const error = searchParams.get('error')

    if (error) {
      console.error('[reddit/callback] Error from Reddit:', error)
      return NextResponse.redirect(`${BASE_URL}/dashboard/publish?error=${error}`)
    }

    if (!code || !state) {
      return NextResponse.redirect(`${BASE_URL}/dashboard/publish?error=missing_params`)
    }

    // Verify state cookie
    const cookieHeader = request.headers.get('cookie') || ''
    const savedState = cookieHeader
      .split(';')
      .map((c) => c.trim())
      .find((c) => c.startsWith('reddit_state='))
      ?.split('=')[1]

    if (!savedState || savedState !== state) {
      console.error('[reddit/callback] State mismatch')
      return NextResponse.redirect(`${BASE_URL}/dashboard/publish?error=state_mismatch`)
    }

    // Extract userId from state (format: "userId:randomHex")
    const userId = state.split(':')[0]

    const credentials = Buffer.from(
      `${process.env.REDDIT_CLIENT_ID}:${process.env.REDDIT_CLIENT_SECRET}`
    ).toString('base64')

    const tokenRes = await fetch('https://www.reddit.com/api/v1/access_token', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'CenterForge/1.0',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: `${BASE_URL}/api/auth/reddit/callback`,
      }).toString(),
    })

    const tokenData = await tokenRes.json()
    console.log('[reddit/callback] Token response:', JSON.stringify(tokenData))

    if (!tokenData.access_token) {
      console.error('[reddit/callback] No access token:', tokenData)
      return NextResponse.redirect(`${BASE_URL}/dashboard/publish?error=token_failed`)
    }

    // Fetch user info
    const userRes = await fetch('https://oauth.reddit.com/api/v1/me', {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
        'User-Agent': 'CenterForge/1.0',
      },
    })
    const userData = await userRes.json()
    console.log('[reddit/callback] User:', userData.name, userData.id)

    if (!userData.id) {
      console.error('[reddit/callback] No user ID:', userData)
      return NextResponse.redirect(`${BASE_URL}/dashboard/publish?error=no_user_id`)
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    await supabase.from('social_connections').upsert(
      {
        user_id: userId,
        platform: 'reddit',
        page_id: userData.id,
        page_name: `u/${userData.name}`,
        access_token: tokenData.access_token,
        user_access_token: tokenData.refresh_token || null,
      },
      { onConflict: 'user_id,platform,page_id' }
    )

    console.log('[reddit/callback] ✅ Connected: u/', userData.name)

    const response = NextResponse.redirect(`${BASE_URL}/dashboard/publish?connected=reddit`)
    response.cookies.delete('reddit_state')
    return response
  } catch (err) {
    console.error('[reddit/callback] Error:', err)
    return NextResponse.redirect(`${BASE_URL}/dashboard/publish?error=server_error`)
  }
}
