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
      console.error('[linkedin/callback] Error from LinkedIn:', error)
      return NextResponse.redirect(`${BASE_URL}/dashboard/publish?error=${error}`)
    }

    if (!code || !state) {
      return NextResponse.redirect(`${BASE_URL}/dashboard/publish?error=missing_params`)
    }

    const userId = state

    const tokenRes = await fetch('https://www.linkedin.com/oauth/v2/accessToken', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: `${BASE_URL}/api/auth/linkedin/callback`,
        client_id: process.env.LINKEDIN_CLIENT_ID!,
        client_secret: process.env.LINKEDIN_CLIENT_SECRET!,
      }).toString(),
    })

    const tokenData = await tokenRes.json()
    console.log('[linkedin/callback] Token response:', JSON.stringify(tokenData))

    if (!tokenData.access_token) {
      console.error('[linkedin/callback] No access token:', tokenData)
      return NextResponse.redirect(`${BASE_URL}/dashboard/publish?error=token_failed`)
    }

    // Fetch user profile via OpenID Connect userinfo endpoint
    const profileRes = await fetch('https://api.linkedin.com/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    })
    const profile = await profileRes.json()
    console.log('[linkedin/callback] Profile:', JSON.stringify(profile))

    const personId = profile.sub
    const displayName = profile.name || 'LinkedIn-konto'

    if (!personId) {
      console.error('[linkedin/callback] No person ID in profile:', profile)
      return NextResponse.redirect(`${BASE_URL}/dashboard/publish?error=no_person_id`)
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    await supabase.from('social_connections').upsert(
      {
        user_id: userId,
        platform: 'linkedin',
        page_id: personId,
        page_name: displayName,
        access_token: tokenData.access_token,
        user_access_token: tokenData.refresh_token || null,
      },
      { onConflict: 'user_id,platform,page_id' }
    )
    console.log('[linkedin/callback] ✅ Connected personal profile:', displayName, '(', personId, ')')

    // Fetch company pages where user is admin
    try {
      const orgsRes = await fetch(
        'https://api.linkedin.com/v2/organizationAcls?q=roleAssignee&role=ADMINISTRATOR&projection=(elements*(organization~(id,localizedName)))',
        {
          headers: {
            Authorization: `Bearer ${tokenData.access_token}`,
            'X-Restli-Protocol-Version': '2.0.0',
          },
        }
      )
      const orgsData = await orgsRes.json()
      console.log('[linkedin/callback] Org ACLs response:', JSON.stringify(orgsData))

      const orgs = orgsData.elements || []
      for (const el of orgs) {
        const org = el['organization~']
        if (!org?.id) continue
        const orgId = String(org.id)
        const orgName = org.localizedName || `LinkedIn Page ${orgId}`
        await supabase.from('social_connections').upsert(
          {
            user_id: userId,
            platform: 'linkedin',
            page_id: orgId,
            page_name: `🏢 ${orgName}`,
            access_token: tokenData.access_token,
            user_access_token: tokenData.refresh_token || null,
          },
          { onConflict: 'user_id,platform,page_id' }
        )
        console.log('[linkedin/callback] ✅ Connected org:', orgName, '(', orgId, ')')
      }
    } catch (orgErr) {
      console.error('[linkedin/callback] Failed to fetch orgs (non-fatal):', orgErr)
    }

    return NextResponse.redirect(`${BASE_URL}/dashboard/publish?connected=linkedin`)
  } catch (err) {
    console.error('[linkedin/callback] Error:', err)
    return NextResponse.redirect(`${BASE_URL}/dashboard/publish?error=server_error`)
  }
}
