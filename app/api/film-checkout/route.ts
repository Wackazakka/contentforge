import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getStripe } from '@/lib/stripe'
import { filmPricing } from '@/lib/verticals'
import { fetchVerticalForOrganization } from '@/lib/senderContext.mjs'
import { getFilmAllowance, FREE_REMAKES, ANIM_QUOTA } from '@/lib/filmAllowance'
import { countNewClips } from '@/lib/production'

// Fastpris-betaling for den enkle filmflyten (Standard Ropert, Lars 4/9):
// 149 kr per film, betalt i Stripe FOER produksjonen starter. Oppfyllelsen
// (start av produksjon) skjer i Stripe-webhooken — samme sti som betalte
// produksjoner, med kind 'film'. Er billing av, svarer vi {free:true} og
// klienten starter produksjonen direkte som foer.
//
// Prisen kommer fra vertikalregisteret, aldri fra klienten.

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

// Prisvisning for filmsiden: hva koster NESTE film for denne anledningen?
export async function GET(request: Request) {
  try {
    const productId = new URL(request.url).searchParams.get('productId') || ''
    if (!productId) return NextResponse.json({ error: 'productId mangler' }, { status: 400 })
    const auth = request.headers.get('authorization')
    if (!auth?.startsWith('Bearer ')) return NextResponse.json({ error: 'Du må være innlogget.' }, { status: 401 })
    const asUser = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: auth } } })
    const { data: product } = await asUser.from('products').select('id, organization_id').eq('id', productId).maybeSingle()
    if (!product) return NextResponse.json({ error: 'Ingen tilgang til denne anledningen.' }, { status: 403 })
    const admin = createClient(SUPABASE_URL, SERVICE_KEY)
    const vertical = await fetchVerticalForOrganization(admin, product.organization_id)
    const pris = filmPricing(vertical)
    if (!pris) return NextResponse.json({ priceNok: null, billing: false })
    const billing = process.env.BILLING_ENABLED === 'true'
    const a = await getFilmAllowance(productId)
    return NextResponse.json({
      priceNok: pris.customerPriceNok,
      animatedPriceNok: pris.animated?.customerPriceNok ?? null,
      billing,
      nextIsFree: !billing || a.nextIsFree,
      freeLeft: a.remakesLeft,
      freeRemakes: FREE_REMAKES,
      // Animasjonskvote (5/9): 12 nye klipp per betalt animert film
      blockAnimated: a.blockAnimated,
      animLeft: a.animLeft,
      animQuota: ANIM_QUOTA,
    })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Noe gikk galt' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const { draftId, forcePay } = await request.json()
    if (!draftId) return NextResponse.json({ error: 'Mangler draftId' }, { status: 400 })

    const auth = request.headers.get('authorization')
    if (!auth?.startsWith('Bearer ')) return NextResponse.json({ error: 'Du må være innlogget.' }, { status: 401 })
    const admin = createClient(SUPABASE_URL, SERVICE_KEY)
    const { data: u } = await admin.auth.getUser(auth.slice(7))
    const userId = u?.user?.id
    if (!userId) return NextResponse.json({ error: 'Du må være innlogget.' }, { status: 401 })

    // select('*'): valgfrie kolonner (payment_status m.fl.) finnes ikke i
    // alle miljoer — en eksplisitt liste feiler da hele oppslaget.
    const { data: draft } = await admin
      .from('production_drafts')
      .select('*')
      .eq('id', draftId)
      .single()
    if (!draft) return NextResponse.json({ error: 'Fant ikke utkastet.' }, { status: 404 })
    if (draft.job_id) return NextResponse.json({ error: 'Filmen er allerede satt i produksjon.' }, { status: 400 })

    // Eierskap via RLS med brukerens eget token
    const asUser = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: auth } } })
    const { data: product } = await asUser.from('products').select('id, organization_id').eq('id', draft.product_id).maybeSingle()
    if (!product) return NextResponse.json({ error: 'Ingen tilgang til denne anledningen.' }, { status: 403 })

    const vertical = await fetchVerticalForOrganization(admin, product.organization_id)
    const pris = filmPricing(vertical)
    if (!pris) return NextResponse.json({ error: 'Fastpris finnes ikke for denne tjenesten.' }, { status: 400 })

    // Billing av (aapningsperiode / flagget ikke flippet): gratis som foer
    if (process.env.BILLING_ENABLED !== 'true') {
      return NextResponse.json({ free: true })
    }

    // Gratis omgjøring (Lars 4/9): tre per betalt film, samme anledning.
    // Animert omgjøring (5/9): i tillegg maks 12 NYE Kling-klipp per betalt
    // animert film — uendrede scener gjenbrukes fra klipp-lageret og koster
    // ingen. forcePay = kunden kjøper en ny animert film i stedet.
    const a = await getFilmAllowance(draft.product_id)
    if (a.nextIsFree && !forcePay) {
      const wantsAnimated = draft.ai_motion === true && !!pris.animated
      if (wantsAnimated) {
        const needed = await countNewClips(draft, Array.isArray(draft.segments) ? draft.segments : [])
        const left = a.blockAnimated ? a.animLeft : 0
        if (needed > left) {
          return NextResponse.json({ error: 'Ikke nok animasjoner igjen', code: 'ANIM_QUOTA', needed, left, blockAnimated: a.blockAnimated }, { status: 409 })
        }
        return NextResponse.json({ free: true, remake: true, freeLeft: a.remakesLeft - 1, animNeeded: needed, animLeft: left - needed })
      }
      return NextResponse.json({ free: true, remake: true, freeLeft: a.remakesLeft - 1 })
    }

    // Tilbake til tenantens eget domene etter betaling (x-forwarded-host —
    // request.url er deploy-permalinken paa Netlify)
    const host = request.headers.get('x-forwarded-host') || request.headers.get('host') || ''
    const origin = host ? `https://${host}` : (process.env.NEXT_PUBLIC_BASE_URL || 'https://contentforge-610.netlify.app')
    const back = `/dashboard/products/${draft.product_id}/film`

    // Nivaa: animert film (draft.ai_motion) har egen pris
    const animert = draft.ai_motion === true && !!pris.animated
    const kundePris = animert ? pris.animated!.customerPriceNok : pris.customerPriceNok
    const ore = Math.round(kundePris * 100)
    const session = await getStripe().checkout.sessions.create({
      mode: 'payment',
      line_items: [
        {
          price_data: {
            currency: 'nok',
            unit_amount: ore,
            product_data: {
              name: `${animert ? 'Animert film' : 'Film'} — ${draft.title || 'anledning'}`,
              description: 'Filmen lages så snart betalingen er bekreftet.',
            },
          },
          quantity: 1,
        },
      ],
      metadata: { kind: 'film', draft_id: draftId, tier: 'registered', user_id: userId, product_id: draft.product_id },
      success_url: `${origin}${back}/klar?draft=${draftId}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}${back}?avbrutt=1`,
    })

    // Best effort: kolonnene kan mangle — betalingsraden under er ankeret
    for (const felt of [{ payment_status: 'pending' }, { price_ore: ore }, { user_id: userId }]) {
      const { error: uErr } = await admin.from('production_drafts').update(felt).eq('id', draftId)
      if (uErr) console.warn('[film-checkout] draft-felt ikke lagret:', Object.keys(felt)[0], uErr.message)
    }

    // Betalingsrad = idempotens-anker for webhooken (samme mønster som produksjoner)
    const { error: payErr } = await admin.from('production_payments').insert({
      draft_id: draftId,
      user_id: userId,
      tier: 'registered',
      amount_ore: ore,
      stripe_session_id: session.id,
      status: 'pending',
    })
    if (payErr) {
      // Feilteksten fra basen er det eneste sporet vi har i prod (4/9:
      // tabellen production_payments fantes ikke — se supabase/migrations/
      // create_production_payments.sql)
      console.error('[film-checkout] payments-insert feilet:', payErr.message)
      return NextResponse.json({ error: `Kunne ikke registrere betalingen: ${payErr.message}` }, { status: 500 })
    }

    return NextResponse.json({ url: session.url, priceNok: kundePris })
  } catch (err) {
    console.error('[film-checkout] Error:', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Noe gikk galt' }, { status: 500 })
  }
}
