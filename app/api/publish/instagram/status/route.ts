import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { finishPendingPublications } from '@/lib/instagramPublish'

// Klienten poller hit etter «Publiser naa» naar Instagram-ruta svarte
// `processing`. Hvert kall sjekker containeren hos Meta EN gang og
// publiserer hvis den er ferdig -- ingen venting paa serversiden, saa vi
// holder oss godt under Netlifys 26-sekundersgrense.
//
// GET /api/publish/instagram/status?ids=<uuid>,<uuid>&userId=<uuid>

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams
  const ids = (params.get('ids') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  const userId = params.get('userId') || null
  if (ids.length === 0) return NextResponse.json({ error: 'Missing ids' }, { status: 400 })

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  await finishPendingPublications(supabase, { userId, ids })

  let query = supabase
    .from('publications')
    .select('id, page_name, status, error, post_id')
    .in('id', ids)
  if (userId) query = query.eq('user_id', userId)
  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ results: data ?? [] })
}
