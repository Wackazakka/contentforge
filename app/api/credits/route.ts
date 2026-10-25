import { NextResponse } from 'next/server'
import { innloggetBruker } from '@/lib/innlogget'
import { createClient } from '@supabase/supabase-js'

export async function GET(request: Request) {
  try {
    // 🔑 Brukeren fra sesjonen, aldri fra klienten (25.10). Før kunne hvem som
    // helst oppgi en vilkårlig bruker-id.
    const bruker = await innloggetBruker(request)
    if (!bruker) return NextResponse.json({ error: 'Ikke innlogget' }, { status: 401 })
    const userId = bruker.id

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const { data: credits } = await supabase
      .from('user_credits')
      .select('balance')
      .eq('user_id', userId)
      .single()

    const { data: subscription } = await supabase
      .from('stripe_subscriptions')
      .select('plan, status, current_period_end')
      .eq('user_id', userId)
      .single()

    return NextResponse.json({
      balance: credits?.balance ?? 0,
      subscription: subscription ?? null,
    })
  } catch (err: any) {
    console.error('[credits] Error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
