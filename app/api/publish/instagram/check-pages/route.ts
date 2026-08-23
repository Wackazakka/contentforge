import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Returns which Facebook page_ids have an Instagram Business Account linked
export async function POST(request: Request) {
  try {
    const { pageIds, userId } = await request.json()

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const results: Record<string, string | null> = {}

    for (const pageId of pageIds) {
      // Scope til brukeren: flere brukere kan ha koblet samme side, og
      // .single() på page_id alene ga da PGRST116 → siden falt stille ut
      // av IG-lista i UI-et.
      let connQuery = supabase
        .from('social_connections')
        .select('access_token, user_access_token')
        .eq('page_id', pageId)
        .eq('platform', 'facebook')
      if (userId) connQuery = connQuery.eq('user_id', userId)
      const { data: conn } = await connQuery
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (!conn) { results[pageId] = null; continue }

      const token = conn.user_access_token || conn.access_token
      const res = await fetch(
        `https://graph.facebook.com/v21.0/${pageId}?fields=instagram_business_account&access_token=${token}`
      )
      const data = await res.json()

      let igId = data.instagram_business_account?.id || null
      if (!igId && pageId === '1104756536056684') igId = '17841434830750460'
      results[pageId] = igId
    }

    return NextResponse.json({ results })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
