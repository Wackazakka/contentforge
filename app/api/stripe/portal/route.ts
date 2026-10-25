import { NextResponse } from 'next/server'
import { innloggetBruker } from '@/lib/innlogget'
import { createClient } from '@supabase/supabase-js'
import { getStripe } from '@/lib/stripe'

const BASE_URL = 'https://contentforge-610.netlify.app'

export async function POST(request: Request) {
  try {
    await request.json().catch(() => ({}))
    // 🔑 Brukeren fra sesjonen, aldri fra klienten (25.10). Før kunne hvem som
    // helst oppgi en vilkårlig bruker-id.
    const bruker = await innloggetBruker(request)
    if (!bruker) return NextResponse.json({ error: 'Ikke innlogget' }, { status: 401 })
    const userId = bruker.id

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const { data } = await supabase
      .from('stripe_subscriptions')
      .select('stripe_customer_id')
      .eq('user_id', userId)
      .single()

    if (!data?.stripe_customer_id) {
      return NextResponse.json({ error: 'No subscription found' }, { status: 404 })
    }

    const session = await getStripe().billingPortal.sessions.create({
      customer: data.stripe_customer_id,
      return_url: `${BASE_URL}/dashboard`,
    })

    return NextResponse.json({ url: session.url })
  } catch (err: any) {
    console.error('[stripe/portal] Error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
