import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getStripe } from '@/lib/stripe'
import { CREDIT_PACKAGES } from '@/lib/creditPackages'

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  )
}

// Selvbetjent kredittkjøp for innloggede brukere i invoice-tenants (byråkunder).
// Betalingen går via plattformens Stripe; påfyllet registreres i org_topups av
// webhooken. Avregning mot partneren skjer månedlig som ellers.
export async function POST(request: Request) {
  try {
    if (process.env.BILLING_ENABLED !== 'true') {
      return NextResponse.json({ error: 'Kortbetaling er ikke åpnet ennå. Kontakt byrået deres for påfyll.', code: 'BILLING_OFF' }, { status: 400 })
    }
    const { packageId } = await request.json()
    const pkg = CREDIT_PACKAGES.find((p) => p.id === packageId)
    if (!pkg) return NextResponse.json({ error: 'Ukjent pakke' }, { status: 400 })

    const supabase = admin()
    const auth = request.headers.get('authorization')
    if (!auth?.startsWith('Bearer ')) return NextResponse.json({ error: 'Ikke innlogget' }, { status: 401 })
    const { data: u } = await supabase.auth.getUser(auth.slice(7))
    const userId = u?.user?.id
    if (!userId) return NextResponse.json({ error: 'Ikke innlogget' }, { status: 401 })

    const { data: org } = await supabase
      .from('organizations')
      .select('id, tenant_id')
      .eq('owner_id', userId)
      .limit(1)
      .single()
    if (!org) return NextResponse.json({ error: 'Fant ingen organisasjon' }, { status: 404 })
    const { data: tenant } = org.tenant_id
      ? await supabase.from('tenants').select('billing_mode').eq('id', org.tenant_id).single()
      : { data: null }
    if (tenant?.billing_mode !== 'invoice') {
      return NextResponse.json({ error: 'Kredittkjøp gjelder kun white-label-kunder' }, { status: 400 })
    }

    // Tilbake til tenantens eget domene etter betaling
    const host = request.headers.get('x-forwarded-host') || request.headers.get('host') || ''
    const origin = host ? `https://${host}` : (process.env.NEXT_PUBLIC_BASE_URL || 'https://contentforge-610.netlify.app')

    const session = await getStripe().checkout.sessions.create({
      mode: 'payment',
      line_items: [{
        price_data: {
          currency: 'nok',
          unit_amount: pkg.amount * 100,
          product_data: { name: `Kredittpakke ${pkg.amount} kr${pkg.bonus ? ` (+${pkg.bonus} kr bonus)` : ''}` },
        },
        quantity: 1,
      }],
      metadata: { kind: 'org_topup', organization_id: org.id, amount_nok: String(pkg.amount), bonus_nok: String(pkg.bonus) },
      success_url: `${origin}/dashboard/credits?paid=1`,
      cancel_url: `${origin}/dashboard/credits`,
    })
    return NextResponse.json({ url: session.url })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
