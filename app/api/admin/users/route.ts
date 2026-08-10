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
  // Denne ruta lister ALLE brukere med e-post, saldo og abonnement.
  const sjekk = await krevPlattformAdmin(request)
  if (!sjekk.ok) {
    return NextResponse.json({ error: sjekk.status === 401 ? 'Ikke innlogget' : 'Forbidden' }, { status: sjekk.status })
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
