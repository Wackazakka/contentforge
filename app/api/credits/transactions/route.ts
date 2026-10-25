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

    const { data, error } = await supabase
      .from('credit_transactions')
      .select('id, type, amount, description, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(50)

    if (error) {
      console.error('[credits/transactions] error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ transactions: data ?? [] })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
