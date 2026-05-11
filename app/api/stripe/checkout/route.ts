import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { stripe, PLANS, PlanKey } from '@/lib/stripe'

const BASE_URL = 'https://contentforge-610.netlify.app'

export async function POST(request: Request) {
  try {
    const { plan, userId, userEmail } = await request.json()

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
      const customer = await stripe.customers.create({
        email: userEmail,
        metadata: { user_id: userId },
      })
      customerId = customer.id
    }

    const session = await stripe.checkout.sessions.create({
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
