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

export async function POST(request: NextRequest) {
  const body = await request.json()
  const { adminUserId, targetUserId, amount, description } = body

  if (!adminUserId || !targetUserId || typeof amount !== 'number' || amount === 0) {
    return NextResponse.json({ error: 'Missing or invalid fields' }, { status: 400 })
  }

  if (!(await verifyAdmin(adminUserId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const supabase = makeSupabase()

  // Upsert credits balance
  const { data: existing } = await supabase
    .from('user_credits')
    .select('balance')
    .eq('user_id', targetUserId)
    .single()

  const currentBalance = existing?.balance ?? 0
  const newBalance = Math.max(0, currentBalance + amount)

  const { error: upsertError } = await supabase
    .from('user_credits')
    .upsert({ user_id: targetUserId, balance: newBalance }, { onConflict: 'user_id' })

  if (upsertError) {
    return NextResponse.json({ error: upsertError.message }, { status: 500 })
  }

  // Record in transaction log
  await supabase.from('credit_transactions').insert({
    user_id: targetUserId,
    type: amount > 0 ? 'admin_grant' : 'admin_deduct',
    amount,
    description: description || (amount > 0 ? 'Admin credit grant' : 'Admin credit deduction'),
  })

  return NextResponse.json({ newBalance })
}
