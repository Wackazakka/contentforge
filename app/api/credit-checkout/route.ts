import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getStripe } from '@/lib/stripe'
import { ALL_CREDIT_PACKAGES, CREDIT_VALUE_NOK } from '@/lib/creditPackages'

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
    const { packageId, returnPath } = await request.json()
    const pkg = ALL_CREDIT_PACKAGES.find((p) => p.id === packageId)
    if (!pkg) return NextResponse.json({ error: 'Ukjent pakke' }, { status: 400 })
    const credits = pkg.credits
    const ledgerNok = Math.round(credits * CREDIT_VALUE_NOK * 100) / 100 // saldoverdi (katalogkurs 0,10)

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
      .order('created_at', { ascending: true })
      .limit(1)
      .single()
    if (!org) return NextResponse.json({ error: 'Fant ingen organisasjon' }, { status: 404 })
    const { data: tenant } = org.tenant_id
      ? await supabase.from('tenants').select('billing_mode, slug').eq('id', org.tenant_id).single()
      : { data: null }
    if (tenant?.billing_mode !== 'invoice') {
      return NextResponse.json({ error: 'Kredittkjøp gjelder kun white-label-kunder' }, { status: 400 })
    }
    // Privatpakkene har bedre kurs enn bedriftskurven — kun for voicebank-tenanten
    if (packageId.startsWith('privat-') && tenant.slug !== 'voicebank') {
      return NextResponse.json({ error: 'Ukjent pakke' }, { status: 400 })
    }

    // Tilbake til tenantens eget domene etter betaling
    const host = request.headers.get('x-forwarded-host') || request.headers.get('host') || ''
    const origin = host ? `https://${host}` : (process.env.NEXT_PUBLIC_BASE_URL || 'https://contentforge-610.netlify.app')
    const RETURN_PATHS = ['/dashboard/credits', '/for-deg/kreditt']
    const backTo = RETURN_PATHS.includes(returnPath) ? returnPath : '/dashboard/credits'

    const session = await getStripe().checkout.sessions.create({
      mode: 'payment',
      line_items: [{
        price_data: {
          currency: 'nok',
          unit_amount: pkg.amount * 100,
          product_data: { name: `${credits.toLocaleString('nb-NO')} kreditter (kurs ${(pkg.amount / pkg.credits).toFixed(3).replace('.', ',')} kr/kreditt)` },
        },
        quantity: 1,
      }],
      metadata: { kind: 'org_topup', organization_id: org.id, amount_nok: String(ledgerNok), bonus_nok: '0', paid_nok: String(pkg.amount), credits: String(credits), rate: (pkg.amount / pkg.credits).toFixed(4) },
      success_url: `${origin}${backTo}?paid=1`,
      cancel_url: `${origin}${backTo}`,
    })
    return NextResponse.json({ url: session.url })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
