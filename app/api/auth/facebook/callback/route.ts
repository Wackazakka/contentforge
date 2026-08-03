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

    const { userId, orgId } = tydState(state)
    console.log('[facebook/callback] Received code for user:', userId)

    // Exchange code for access token
    const tokenRes = await fetch('https://graph.facebook.com/v21.0/oauth/access_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.META_APP_ID!,
        client_secret: process.env.META_APP_SECRET!,
        redirect_uri: process.env.META_REDIRECT_URI!,
        code,
      }).toString(),
    })

    console.log('[facebook/callback] Token response status:', tokenRes.status)
    
    // Log raw response for debugging
    const rawText = await tokenRes.text()
    console.log('[facebook/callback] Raw token response:', rawText)
    
    const tokenData = JSON.parse(rawText)
    console.log('[facebook/callback] User token starts with:', tokenData.access_token?.substring(0, 20))
    console.log('[facebook/callback] User token length:', tokenData.access_token?.length)
    console.log('[facebook/callback] Full token response keys:', Object.keys(tokenData))

    if (!tokenData.access_token) {
      console.error('[facebook/callback] No access token in response:', tokenData)
      return NextResponse.redirect(`${BASE_URL}/dashboard/publish?error=token_failed`)
    }

    // Exchange short-lived user token for long-lived token (60 days)
    const llRes = await fetch(
      `https://graph.facebook.com/v21.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${process.env.META_APP_ID}&client_secret=${process.env.META_APP_SECRET}&fb_exchange_token=${tokenData.access_token}`
    )
    const llData = await llRes.json()
    const longLivedToken = llData.access_token || tokenData.access_token
    console.log('[facebook/callback] Long-lived token obtained, expires_in:', llData.expires_in)

    console.log('[facebook/callback] Token obtained, fetching pages...')

    // Get user's pages
    const pagesRes = await fetch(
      `https://graph.facebook.com/v21.0/me/accounts?access_token=${longLivedToken}`
    )
    const pagesData = await pagesRes.json()

    if (!pagesData.data || pagesData.data.length === 0) {
      console.error('[facebook/callback] No pages found:', pagesData)
      return NextResponse.redirect(`${BASE_URL}/dashboard/publish?error=no_pages`)
    }

    console.log('[facebook/callback] Found', pagesData.data.length, 'pages from /me/accounts')

    // Alternative endpoint: also fetch from /me with accounts field (catches New Page Experience pages)
    const meRes = await fetch(
      `https://graph.facebook.com/v21.0/me?fields=id,name,accounts{id,name,access_token,instagram_business_account}&access_token=${longLivedToken}`
    )
    const meData = await meRes.json()

    if (meData.accounts && meData.accounts.data && meData.accounts.data.length > 0) {
      console.log('[facebook/callback] Found', meData.accounts.data.length, 'pages from /me endpoint (alternative)')
      const existingPageIds = new Set(pagesData.data.map((p: any) => p.id))
      const newPages = meData.accounts.data.filter((p: any) => !existingPageIds.has(p.id))
      console.log('[facebook/callback] Adding', newPages.length, 'new pages from /me endpoint')
      if (newPages.length > 0) {
        pagesData.data.push(...newPages)
      }
    }

    // Hardkodet fallback for New Page Experience pages som ikke returneres av /me/accounts
    const fallbackPageIds = [
      '1104756536056684', // SinglePicker App
      '1033650743168610', // Reforhandle
    ]
    for (const fallbackId of fallbackPageIds) {
      const res = await fetch(
        `https://graph.facebook.com/v21.0/${fallbackId}?fields=id,name,access_token&access_token=${longLivedToken}`
      )
      const data = await res.json()
      if (data.id && !pagesData.data.find((p: any) => p.id === data.id)) {
        console.log(`[facebook/callback] Adding page ${data.name} (${fallbackId}) from fallback fetch`)
        pagesData.data.push(data)
      } else if (!data.id) {
        console.log(`[facebook/callback] Fallback fetch failed for ${fallbackId}:`, data.error || 'No id')
      }
    }

    // Use service role client to save connections (bypasses RLS)
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // Save each page connection
    for (const page of pagesData.data) {
      console.log('[facebook/callback] Saving page:', page.name)
      console.log('[facebook/callback] Saving user_access_token starting with:', tokenData.access_token?.substring(0, 20))
      await supabase.from('social_connections').upsert(
        {
          user_id: userId,
          organization_id: orgId,
          platform: 'facebook',
          page_id: page.id,
          page_name: page.name,
          access_token: page.access_token,
          user_access_token: longLivedToken, // Long-lived token (60 days) for Instagram publishing
        },
        { onConflict: 'organization_id,platform,page_id' }
      )
    }

    console.log('[facebook/callback] ✅ All connections saved')
    return NextResponse.redirect(`${BASE_URL}/dashboard/publish?connected=facebook`)
  } catch (err) {
    console.error('[facebook/callback] Error:', err)
    return NextResponse.redirect(`${BASE_URL}/dashboard/publish?error=server_error`)
  }
}
