import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getStripe, PLANS, PlanKey } from '@/lib/stripe'
import Stripe from 'stripe'

export async function POST(request: Request) {
  const body = await request.text()
  const sig = request.headers.get('stripe-signature')!

  let event: Stripe.Event
  try {
    event = getStripe().webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!)
  } catch (err: any) {
    console.error('[stripe/webhook] Invalid signature:', err.message)
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session
      const userId = session.metadata?.user_id
      const plan = session.metadata?.plan as PlanKey

      if (!userId || !plan) break

      const planConfig = PLANS[plan]
      const subscriptionId = session.subscription as string

      // Fetch subscription to get period end
      const sub = await getStripe().subscriptions.retrieve(subscriptionId) as unknown as Stripe.Subscription

      const periodEnd = (sub as any).items?.data?.[0]?.current_period_end ?? (sub as any).current_period_end
      await supabase.from('stripe_subscriptions').upsert(
        {
          user_id: userId,
          stripe_customer_id: session.customer as string,
          stripe_subscription_id: subscriptionId,
          stripe_price_id: planConfig.priceId,
          plan,
          status: 'active',
          current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
        },
        { onConflict: 'user_id' }
      )

      // Add monthly credits
      await supabase.rpc('add_credits', {
        p_user_id: userId,
        p_amount: planConfig.credits,
        p_type: 'purchase',
        p_description: `${planConfig.name} plan — ${planConfig.credits} credits`,
        p_stripe_payment_intent_id: session.payment_intent as string,
      })

      // Send subscription confirmation email
      const { data: userData } = await supabase.auth.admin.getUserById(userId)
      if (userData?.user?.email) {
        const renewsAt = periodEnd
          ? new Date(periodEnd * 1000).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
          : null
        fetch(`${process.env.NEXT_PUBLIC_BASE_URL}/api/email/subscription`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: userData.user.email,
            name: userData.user.user_metadata?.full_name ?? '',
            plan: planConfig.name,
            credits: planConfig.credits,
            renewsAt,
          }),
        }).catch(() => {})
      }

      console.log(`[stripe/webhook] ✅ Subscription activated: ${plan} for ${userId}`)
      break
    }

    case 'invoice.paid': {
      // Monthly renewal — add credits again
      const invoice = event.data.object as Stripe.Invoice
      const subscriptionId2 = (invoice as any).subscription ?? invoice.parent?.subscription_details?.subscription
      const sub = await getStripe().subscriptions.retrieve(subscriptionId2 as string) as unknown as Stripe.Subscription
      const userId = sub.metadata?.user_id
      const plan = sub.metadata?.plan as PlanKey

      if (!userId || !plan) break

      // Only add credits on renewal (not first payment — handled by checkout.session.completed)
      if (invoice.billing_reason === 'subscription_cycle') {
        const planConfig = PLANS[plan]
        await supabase.rpc('add_credits', {
          p_user_id: userId,
          p_amount: planConfig.credits,
          p_type: 'purchase',
          p_description: `${planConfig.name} fornyelse — ${planConfig.credits} kreditter`,
          p_stripe_payment_intent_id: (invoice as any).payment_intent as string,
        })
        console.log(`[stripe/webhook] ✅ Credits renewed: ${plan} for ${userId}`)
      }
      break
    }

    case 'customer.subscription.updated': {
      const sub = event.data.object as Stripe.Subscription
      const userId = sub.metadata?.user_id
      if (!userId) break

      const updatedPeriodEnd = (sub as any).items?.data?.[0]?.current_period_end ?? (sub as any).current_period_end
      await supabase.from('stripe_subscriptions')
        .update({
          status: sub.status,
          current_period_end: updatedPeriodEnd ? new Date(updatedPeriodEnd * 1000).toISOString() : null,
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', userId)
      break
    }

    case 'customer.subscription.deleted': {
      const sub = event.data.object as Stripe.Subscription
      const userId = sub.metadata?.user_id
      if (!userId) break

      await supabase.from('stripe_subscriptions')
        .update({ status: 'cancelled', updated_at: new Date().toISOString() })
        .eq('user_id', userId)

      console.log(`[stripe/webhook] Subscription cancelled for ${userId}`)
      break
    }
  }

  return NextResponse.json({ received: true })
}
