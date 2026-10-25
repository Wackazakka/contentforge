import { NextResponse } from 'next/server'
import { innloggetBruker } from '@/lib/innlogget'
import { createClient } from '@supabase/supabase-js'
import { getStripe, PLANS, PlanKey } from '@/lib/stripe'

const BASE_URL = 'https://contentforge-610.netlify.app'

export async function POST(request: Request) {
  try {
    const { plan } = await request.json()
    // 🔑 Brukeren fra sesjonen, aldri fra klienten (25.10). Før kunne hvem som
    // helst oppgi en vilkårlig bruker-id.
    const bruker = await innloggetBruker(request)
    if (!bruker) return NextResponse.json({ error: 'Ikke innlogget' }, { status: 401 })
    const userId = bruker.id
    const userEmail = bruker.email

    if (!plan || !userId || !userEmail) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const planConfig = PLANS[plan as PlanKey]
    if (!planConfig) {
      return NextResponse.json({ error: 'Invalid plan' }, { status: 400 })
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // Check if user already has a Stripe customer
    const { data: existing } = await supabase
      .from('stripe_subscriptions')
      .select('stripe_customer_id')
      .eq('user_id', userId)
      .single()

    let customerId = existing?.stripe_customer_id

    if (!customerId) {
      const customer = await getStripe().customers.create({
        email: userEmail,
        metadata: { user_id: userId },
      })
      customerId = customer.id
    }

    const session = await getStripe().checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [{ price: planConfig.priceId, quantity: 1 }],
      success_url: `${BASE_URL}/dashboard?subscribed=${plan}`,
      cancel_url: `${BASE_URL}/pricing?cancelled=true`,
      metadata: { user_id: userId, plan },
      subscription_data: {
        metadata: { user_id: userId, plan },
      },
    })

    return NextResponse.json({ url: session.url })
  } catch (err: any) {
    console.error('[stripe/checkout] Error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
