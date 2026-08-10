import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { krevPlattformAdmin } from '@/lib/adminAuth'

function makeSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function GET(request: NextRequest) {
  // Identiteten kommer fra sesjonen, ikke fra ?userId= — se lib/adminAuth.
  const sjekk = await krevPlattformAdmin(request)
  if (!sjekk.ok) {
    return NextResponse.json({ error: sjekk.status === 401 ? 'Ikke innlogget' : 'Forbidden' }, { status: sjekk.status })
  }

  const supabase = makeSupabase()

  const [usersRes, subsRes, creditsRes, draftsRes] = await Promise.all([
    supabase.auth.admin.listUsers({ perPage: 1000 }),
    supabase.from('stripe_subscriptions').select('status, plan'),
    supabase.from('user_credits').select('balance'),
    supabase.from('production_drafts').select('id', { count: 'exact', head: true }),
  ])

  const totalUsers = usersRes.data?.users?.length ?? 0
  const subs = subsRes.data ?? []
  const activeSubscriptions = subs.filter((s) => s.status === 'active').length
  const totalCredits = (creditsRes.data ?? []).reduce((sum, r) => sum + (r.balance ?? 0), 0)
  const totalVideos = draftsRes.count ?? 0

  const planBreakdown: Record<string, number> = {}
  for (const s of subs) {
    if (s.status === 'active') {
      planBreakdown[s.plan] = (planBreakdown[s.plan] ?? 0) + 1
    }
  }

  return NextResponse.json({ totalUsers, activeSubscriptions, totalCredits, totalVideos, planBreakdown })
}
