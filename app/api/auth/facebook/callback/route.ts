import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const BASE_URL = 'https://contentforge-610.netlify.app'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const code = searchParams.get('code')
    const state = searchParams.get('state') // user ID from state parameter
    const error = searchParams.get('error')

    if (error) {
      console.error('[facebook/callback] Error from Meta:', error)
      return NextResponse.redirect(`${BASE_URL}/dashboard/publish?error=${error}`)
    }

    if (!code) {
      console.error('[facebook/callback] No code received')
      return NextResponse.redirect(`${BASE_URL}/dashboard/publish?error=no_code`)
    }

    if (!state) {
      console.error('[facebook/callback] No state parameter (user ID) received')
      return NextResponse.redirect(`${BASE_URL}/dashboard/publish?error=no_state`)
    }

    const userId = state
    console.log('[facebook/callback] Received code for user:', userId)

    // Exchange code for access token
    const tokenRes = await fetch('https://graph.facebook.com/v19.0/oauth/access_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.META_APP_ID!,
        client_secret: process.env.META_APP_SECRET!,
        redirect_uri: process.env.META_REDIRECT_URI!,
        code,
      }).toString(),
    })

    const tokenData = await tokenRes.json()
    console.log('[facebook/callback] Token response status:', tokenRes.status)

    if (!tokenData.access_token) {
      console.error('[facebook/callback] No access token in response:', tokenData)
      return NextResponse.redirect(`${BASE_URL}/dashboard/publish?error=token_failed`)
    }

    console.log('[facebook/callback] Token obtained, fetching pages...')

    // Get user's pages
    const pagesRes = await fetch(
      `https://graph.facebook.com/v19.0/me/accounts?access_token=${tokenData.access_token}`
    )
    const pagesData = await pagesRes.json()

    if (!pagesData.data || pagesData.data.length === 0) {
      console.error('[facebook/callback] No pages found:', pagesData)
      return NextResponse.redirect(`${BASE_URL}/dashboard/publish?error=no_pages`)
    }

    console.log('[facebook/callback] Found', pagesData.data.length, 'pages')

    // Use service role client to save connections (bypasses RLS)
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // Save each page connection
    for (const page of pagesData.data) {
      console.log('[facebook/callback] Saving page:', page.name)
      await supabase.from('social_connections').upsert(
        {
          user_id: userId,
          platform: 'facebook',
          page_id: page.id,
          page_name: page.name,
          access_token: page.access_token,
        },
        { onConflict: 'user_id,platform,page_id' }
      )
    }

    console.log('[facebook/callback] ✅ All connections saved')
    return NextResponse.redirect(`${BASE_URL}/dashboard/publish?connected=facebook`)
  } catch (err) {
    console.error('[facebook/callback] Error:', err)
    return NextResponse.redirect(`${BASE_URL}/dashboard/publish?error=server_error`)
  }
}
