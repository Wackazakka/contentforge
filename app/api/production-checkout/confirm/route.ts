import { NextResponse } from 'next/server'
import { getStripe } from '@/lib/stripe'
import { fulfillProductionSession } from '@/lib/production'

// Sikkerhetsnett hvis webhooken uteblir: henter sessionen fra Stripe
// (server-side, kan ikke forfalskes) og kjører samme idempotente oppfyllelse.
export async function POST(request: Request) {
  try {
    const { sessionId } = await request.json()
    if (!sessionId) return NextResponse.json({ error: 'Missing sessionId' }, { status: 400 })

    const session = await getStripe().checkout.sessions.retrieve(sessionId)
    if (session.payment_status !== 'paid') {
      return NextResponse.json({ status: session.payment_status || 'unpaid' })
    }
    if (session.metadata?.kind !== 'production') {
      return NextResponse.json({ error: 'Ikke en produksjons-session' }, { status: 400 })
    }

    const result = await fulfillProductionSession({
      id: session.id,
      payment_intent: session.payment_intent as string,
      metadata: session.metadata as Record<string, string>,
    })
    return NextResponse.json({ status: 'paid', ...result })
  } catch (err: any) {
    console.error('[production-checkout/confirm] Error:', err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
