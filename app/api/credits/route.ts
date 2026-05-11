import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const userId = searchParams.get('userId')

    if (!userId) {
      return NextResponse.json({ error: 'Missing userId' }, { status: 400 })
    }

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
