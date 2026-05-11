import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS ?? 'kilevold@online.no').split(',').map((e) => e.trim().toLowerCase())

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

  const [authRes, creditsRes, subsRes] = await Promise.all([
    supabase.auth.admin.listUsers({ perPage: 1000 }),
    supabase.from('user_credits').select('user_id, balance'),
    supabase.from('stripe_subscriptions').select('user_id, plan, status, current_period_end'),
  ])

  const creditsMap = new Map((creditsRes.data ?? []).map((r) => [r.user_id, r.balance]))
  const subsMap = new Map((subsRes.data ?? []).map((r) => [r.user_id, r]))

  const users = (authRes.data?.users ?? []).map((u) => ({
    id: u.id,
    email: u.email ?? '',
    created_at: u.created_at,
    last_sign_in_at: u.last_sign_in_at ?? null,
    balance: creditsMap.get(u.id) ?? 0,
    plan: subsMap.get(u.id)?.plan ?? null,
    sub_status: subsMap.get(u.id)?.status ?? null,
    period_end: subsMap.get(u.id)?.current_period_end ?? null,
  }))

  users.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

  return NextResponse.json({ users })
}
