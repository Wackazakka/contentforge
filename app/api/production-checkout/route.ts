import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getStripe } from '@/lib/stripe'
import { computeProductionPrice } from '@/lib/pricing'
import type { PriceTier } from '@/lib/costs'

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'https://contentforge-610.netlify.app'

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  )
}

// Start betalt produksjon: server regner prisen fra draft-raden (klientens
// taxameter er kun veiledende), tier avgjøres av VERIFISERT JWT (aldri body),
// opsjonene persisteres på draften, og Stripe Checkout (engangsbetaling med
// dynamisk beløp) opprettes. Oppfyllelse skjer i webhooken.
export async function POST(request: Request) {
  try {
    if (process.env.BILLING_ENABLED !== 'true') {
      return NextResponse.json({ error: 'Billing er ikke aktivert' }, { status: 400 })
    }
    const { draftId, imageStyle, includeOutroCard, outroJingle, aiMotion, aiMotionEngine, character } = await request.json()
    if (!draftId) return NextResponse.json({ error: 'Missing draftId' }, { status: 400 })

    const supabase = admin()

    // Tier fra verifisert token — rabatten (33 %) er det eneste pengerelevante
    let userId: string | null = null
    const auth = request.headers.get('authorization')
    if (auth?.startsWith('Bearer ')) {
      const { data } = await supabase.auth.getUser(auth.slice(7))
      userId = data?.user?.id ?? null
    }
    const tier: PriceTier = userId ? 'registered' : 'anonymous'

    // Persister opsjonene på draften — webhooken/produksjonen leser dem derfra
    const { error: optErr } = await supabase
      .from('production_drafts')
      .update({
        image_style: imageStyle ?? null,
        ai_motion: !!aiMotion,
        ai_motion_engine: aiMotionEngine ?? null,
        outro_jingle: outroJingle ?? null,
        include_outro_card: includeOutroCard !== false,
        character_id: character ?? null,
        user_id: userId,
        payment_status: 'pending',
      })
      .eq('id', draftId)
    if (optErr) return NextResponse.json({ error: 'Kunne ikke lagre valg: ' + optErr.message }, { status: 500 })

    const { data: draft, error: dErr } = await supabase
      .from('production_drafts')
      .select('*')
      .eq('id', draftId)
      .single()
    if (dErr || !draft) return NextResponse.json({ error: 'Draft ikke funnet' }, { status: 404 })

    const price = computeProductionPrice(draft, tier)

    const stripe = getStripe()
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [
        {
          price_data: {
            currency: 'nok',
            unit_amount: price.ore,
            product_data: {
              name: `Videoproduksjon — ${draft.title || 'video'}`,
              description: tier === 'anonymous'
                ? 'Uten konto (registrer deg og få 33 % rabatt neste gang)'
                : 'Registrert bruker',
            },
          },
          quantity: 1,
        },
      ],
      metadata: { kind: 'production', draft_id: draftId, tier, user_id: userId || '' },
      success_url: `${BASE_URL}/dashboard/products/${draft.product_id}/video/draft/${draftId}?paid=1&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${BASE_URL}/dashboard/products/${draft.product_id}/video/draft/${draftId}?paid=0`,
    })

    // Betalingsrad (idempotens-anker for webhooken)
    const { error: payErr } = await supabase.from('production_payments').insert({
      draft_id: draftId,
      user_id: userId,
      tier,
      amount_ore: price.ore,
      stripe_session_id: session.id,
      status: 'pending',
    })
    if (payErr) {
      console.error('[production-checkout] payments-insert feilet:', payErr.message)
      return NextResponse.json({ error: 'Kunne ikke registrere betaling' }, { status: 500 })
    }

    await supabase.from('production_drafts').update({ price_ore: price.ore }).eq('id', draftId)

    return NextResponse.json({ url: session.url, price: price.nok, tier, breakdown: price.lines })
  } catch (err: any) {
    console.error('[production-checkout] Error:', err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
