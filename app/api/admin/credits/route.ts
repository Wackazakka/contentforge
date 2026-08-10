import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { krevPlattformAdmin } from '@/lib/adminAuth'

function makeSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function POST(request: NextRequest) {
  // Identiteten kommer fra sesjonen, ikke fra body.adminUserId — se
  // lib/adminAuth. Denne ruta DELER UT KREDITT; med den gamle sjekken kunne
  // hvem som helst som kjente en admins UUID gitt seg selv ubegrenset saldo.
  const sjekk = await krevPlattformAdmin(request)
  if (!sjekk.ok) {
    return NextResponse.json({ error: sjekk.status === 401 ? 'Ikke innlogget' : 'Forbidden' }, { status: sjekk.status })
  }

  const body = await request.json()
  const { targetUserId, amount, description } = body

  if (!targetUserId || typeof amount !== 'number' || amount === 0) {
    return NextResponse.json({ error: 'Missing or invalid fields' }, { status: 400 })
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
