import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getTenant, getTenantCanonicalOrigin } from '@/lib/tenantServer'
import { likeSafe } from '@/lib/epost'
import { getStripe } from '@/lib/stripe'
import { avgiftFor, fullfoerAvgift } from '@/lib/onboardingServer'

// Påmeldingsavgiften for drop-ins (126, Lars 28.10.2026).
//
// Den som melder seg på uten byrå og vil ha ansiktsmodell, betaler en liten
// avgift som dekker treningen. Byråskuespillere slipper: der står byrået inne
// for dem, og avtalen med byrået dekker kostnaden.
//
//   POST { actorId }                       åpner kassen (Stripe Checkout)
//   POST { action: 'confirm', sessionId }  returen fra kassen — sikkerhetsnett
//                                          hvis webhooken uteblir
//
// 🔑 BELØPET KOMMER FRA BANKEN, ALDRI FRA KLIENTEN (tenants.enrollment_fee_nok).

function db() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || '', process.env.SUPABASE_SERVICE_ROLE_KEY || '')
}

type Aktoer = { id: string; name: string; owner_tenant_id: string; talent_agent_id: string | null; wants_face: boolean | null }

async function hentEgen(request: Request, actorId: unknown) {
  const auth = request.headers.get('authorization')
  if (!auth?.startsWith('Bearer ')) return { fail: NextResponse.json({ error: 'Ikke innlogget' }, { status: 401 }) }
  const { data: u } = await db().auth.getUser(auth.slice(7))
  const epost = u?.user?.email
  if (!epost) return { fail: NextResponse.json({ error: 'Ikke innlogget' }, { status: 401 }) }
  if (typeof actorId !== 'string' || !actorId) return { fail: NextResponse.json({ error: 'Mangler profil' }, { status: 400 }) }
  const tenant = await getTenant()
  const { data } = await db().from('voice_actors')
    .select('id, name, owner_tenant_id, talent_agent_id, wants_face')
    .eq('id', actorId).ilike('actor_email', likeSafe(epost)).eq('owner_tenant_id', tenant.id).maybeSingle()
  if (!data) return { fail: NextResponse.json({ error: 'Fant ikke profilen din' }, { status: 404 }) }
  return { a: data as Aktoer, epost, tenant }
}

export async function POST(request: Request) {
  try {
    const b = await request.json().catch(() => ({}))

    if (b.action === 'confirm') {
      const sessionId = String(b.sessionId || '')
      if (!sessionId.startsWith('cs_')) return NextResponse.json({ error: 'Ugyldig økt' }, { status: 400 })
      const session = await getStripe().checkout.sessions.retrieve(sessionId)
      if (session.metadata?.kind !== 'enrollment_fee') return NextResponse.json({ error: 'Ikke en avgiftsbetaling' }, { status: 400 })
      const g = await hentEgen(request, session.metadata?.actor_id)
      if (g.fail) return g.fail
      if (session.payment_status !== 'paid') return NextResponse.json({ status: session.payment_status || 'unpaid' })
      const r = await fullfoerAvgift(session.id)
      return NextResponse.json({ status: r === 'missing' ? 'unknown' : 'paid' })
    }

    const g = await hentEgen(request, b.actorId)
    if (g.fail) return g.fail
    const { a, epost, tenant } = g
    const avgift = await avgiftFor(a)
    if (!avgift.required || avgift.amountNok == null) {
      return NextResponse.json({ error: avgift.status ? 'Avgiften er alt ordnet.' : 'Du har ingen avgift å betale.' }, { status: 409 })
    }

    const origin = await getTenantCanonicalOrigin(tenant)
    const merke = tenant.app_name || 'TwinLedger'
    const session = await getStripe().checkout.sessions.create({
      mode: 'payment',
      customer_email: epost,
      line_items: [{
        price_data: {
          currency: 'nok',
          unit_amount: Math.round(avgift.amountNok * 100),
          product_data: {
            name: `Påmeldingsavgift — ${merke}`,
            description: 'Dekker treningen av ansiktsmodellen din. Betales én gang.',
          },
        },
        quantity: 1,
      }],
      metadata: { kind: 'enrollment_fee', actor_id: a.id, tenant_id: a.owner_tenant_id },
      // Kortest mulig levetid: en åpen kasse i en glemt fane er det som gir
      // dobbel betaling.
      expires_at: Math.floor(Date.now() / 1000) + 30 * 60,
      success_url: `${origin}/min-stemme?avgift=betalt&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/min-stemme?avgift=avbrutt`,
    })

    const { error } = await db().from('enrollment_fees').insert({
      tenant_id: a.owner_tenant_id, actor_id: a.id, amount_nok: avgift.amountNok,
      status: 'pending', stripe_session_id: session.id,
    })
    if (error) {
      console.error('[enrollment-fee] Kunne ikke registrere økta:', error.message)
      return NextResponse.json({ error: 'Kunne ikke starte betalingen. Prøv igjen.' }, { status: 500 })
    }
    return NextResponse.json({ url: session.url })
  } catch (e) {
    console.error('[enrollment-fee]', e instanceof Error ? e.message : e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Ukjent feil' }, { status: 500 })
  }
}
