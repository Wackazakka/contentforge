import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS ?? '').split(',').map((e) => e.trim().toLowerCase())

function makeSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

async function verifyAdmin(userId: string): Promise<boolean> {
  if (!userId) return false
  const supabase = makeSupabase()
  const { data } = await supabase.auth.admin.getUserById(userId)
  return ADMIN_EMAILS.includes((data?.user?.email ?? '').toLowerCase())
}

export async function GET(request: NextRequest) {
  const userId = request.nextUrl.searchParams.get('userId') ?? ''
  if (!(await verifyAdmin(userId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
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
