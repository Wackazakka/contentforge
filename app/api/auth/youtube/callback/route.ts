import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// state baerer «bruker.organisasjon» (Lars 3/8). Gammelt format — bare
// bruker-ID — virker fortsatt, og gir da organisasjon null.
function tydState(state: string | null): { userId: string | null; orgId: string | null } {
  if (!state) return { userId: null, orgId: null }
  const i = state.indexOf('.')
  return i === -1
    ? { userId: state, orgId: null }
    : { userId: state.slice(0, i), orgId: state.slice(i + 1) || null }
}

const BASE_URL = 'https://contentforge-610.netlify.app'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const code = searchParams.get('code')
    const state = searchParams.get('state')
    const error = searchParams.get('error')

    if (error) {
      console.error('[youtube/callback] Error from Google:', error)
      return NextResponse.redirect(`${BASE_URL}/dashboard/publish?error=${error}`)
    }

    if (!code || !state) {
      return NextResponse.redirect(`${BASE_URL}/dashboard/publish?error=missing_params`)
    }

    const { userId, orgId } = tydState(state)

    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        redirect_uri: `${BASE_URL}/api/auth/youtube/callback`,
        grant_type: 'authorization_code',
      }).toString(),
    })

    const tokenData = await tokenRes.json()
    console.log('[youtube/callback] Token response:', JSON.stringify(tokenData))

    if (!tokenData.access_token) {
      console.error('[youtube/callback] No access token:', tokenData)
      return NextResponse.redirect(`${BASE_URL}/dashboard/publish?error=token_failed`)
    }

    // Fetch channel info
    const channelRes = await fetch(
      'https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true',
      { headers: { Authorization: `Bearer ${tokenData.access_token}` } }
    )
    const channelData = await channelRes.json()
    console.log('[youtube/callback] Channel data:', JSON.stringify(channelData))

    const channel = channelData.items?.[0]
    if (!channel) {
      console.error('[youtube/callback] No channel found')
      return NextResponse.redirect(`${BASE_URL}/dashboard/publish?error=no_channel`)
    }

    const channelId = channel.id
    const channelName = channel.snippet?.title || 'YouTube Channel'

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    await supabase.from('social_connections').upsert(
      {
        user_id: userId,
        organization_id: orgId,
        platform: 'youtube',
        page_id: channelId,
        page_name: channelName,
        access_token: tokenData.access_token,
        user_access_token: tokenData.refresh_token || null,
      },
      { onConflict: 'organization_id,platform,page_id' }
    )

    console.log('[youtube/callback] ✅ Connected channel:', channelName, '(', channelId, ')')
    return NextResponse.redirect(`${BASE_URL}/dashboard/publish?connected=youtube`)
  } catch (err) {
    console.error('[youtube/callback] Error:', err)
    return NextResponse.redirect(`${BASE_URL}/dashboard/publish?error=server_error`)
  }
}
