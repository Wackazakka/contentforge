import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getStripe } from '@/lib/stripe'
import { ALL_CREDIT_PACKAGES, CREDIT_VALUE_NOK, packageFor } from '@/lib/creditPackages'
import { produktnavn } from '@/lib/tenantNames'

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  )
}

// Brukerens organisasjon PAA DENNE TENANTEN. Ruta tok tidligere den ELDSTE
// organisasjonen uansett hvilket domene forespoerselen kom fra - saa Lars,
// som har organisasjoner paa flere tenanter, ble avvist paa Isabels side med
// «gjelder kun white-label-kunder» (3/8). En artist med bare EN organisasjon
// merket ingenting, saa feilen ville kommet foerst naar noen hadde to.
async function orgForVert(supabase: any, userId: string) {
  const { getTenant } = await import('@/lib/tenantServer')
  const vert = await getTenant()
  const { data: orgs } = await supabase
    .from('organizations')
    .select('id, tenant_id')
    .eq('owner_id', userId)
    .order('created_at', { ascending: true })
  const liste = orgs || []
  // Paa et tenant-domene MAA organisasjonen hoere til den tenanten. Aa falle
  // tilbake til en annen ville betydd aa fylle paa feil konto - verre enn aa
  // si nei. Kun paa rot-domenet gjelder «eldste» som foer.
  if (vert.id && vert.id !== 'root') {
    return liste.find((o: any) => o.tenant_id === vert.id) ?? null
  }
  return liste[0] ?? null
}

// Selvbetjent kredittkjøp for innloggede brukere i invoice-tenants (byråkunder).
// Betalingen går via plattformens Stripe; påfyllet registreres i org_topups av
// webhooken. Avregning mot partneren skjer månedlig som ellers.
export async function POST(request: Request) {
  try {
    if (process.env.BILLING_ENABLED !== 'true') {
      return NextResponse.json({ error: 'Kortbetaling er ikke åpnet ennå.', code: 'BILLING_OFF' }, { status: 400 })
    }
    const { packageId, returnPath } = await request.json()
    const pkg = ALL_CREDIT_PACKAGES.find((p) => p.id === packageId)
    if (!pkg) return NextResponse.json({ error: 'Ukjent pakke', code: 'UNKNOWN_PACKAGE' }, { status: 400 })
    const credits = pkg.credits
    const ledgerNok = Math.round(credits * CREDIT_VALUE_NOK * 100) / 100 // saldoverdi (katalogkurs 0,10)

    const supabase = admin()
    const auth = request.headers.get('authorization')
    if (!auth?.startsWith('Bearer ')) return NextResponse.json({ error: 'Ikke innlogget', code: 'NOT_SIGNED_IN' }, { status: 401 })
    const { data: u } = await supabase.auth.getUser(auth.slice(7))
    const userId = u?.user?.id
    if (!userId) return NextResponse.json({ error: 'Ikke innlogget', code: 'NOT_SIGNED_IN' }, { status: 401 })

    const org = await orgForVert(supabase, userId)
    if (!org) return NextResponse.json({ error: 'Fant ingen organisasjon', code: 'NO_ORG' }, { status: 404 })
    const { data: tenant } = org.tenant_id
      ? await supabase.from('tenants').select('billing_mode, slug, vertical, currency, default_locale, app_name, product_name').eq('id', org.tenant_id).single()
      : { data: null }
    if (tenant?.billing_mode !== 'invoice') {
      return NextResponse.json({ error: 'Kredittkjøp gjelder kun white-label-kunder', code: 'NOT_WHITELABEL' }, { status: 400 })
    }
    // Privatpakkene har bedre kurs enn bedriftskurven. Gjelder VoiceBank og
    // artist-tenanter (music) — artister er enkeltpersoner, ikke byraaer
    // (Lars 1/8: IndigoBoom-artister skal kunne kjoepe dem).
    const privatOK = tenant.slug === 'voicebank' || (tenant as any).vertical === 'music'
    if (packageId.startsWith('privat-') && !privatOK) {
      return NextResponse.json({ error: 'Ukjent pakke', code: 'UNKNOWN_PACKAGE' }, { status: 400 })
    }

    // Tilbake til tenantens eget domene etter betaling
    const host = request.headers.get('x-forwarded-host') || request.headers.get('host') || ''
    const origin = host ? `https://${host}` : (process.env.NEXT_PUBLIC_BASE_URL || 'https://contentforge-610.netlify.app')
    const RETURN_PATHS = ['/dashboard/credits', '/for-deg/kreditt']
    const backTo = RETURN_PATHS.includes(returnPath) ? returnPath : '/dashboard/credits'

    const erGbp = (tenant as any)?.currency === 'gbp'
    // Beloepet MAA hentes for valutaen. Foer sto kronetallet her og ble krevd
    // som pund: £15-knappen ga £200 i kassen (Lars 3/8).
    // Kunden skal se HENNES navn i betalingen, ikke plattformens (Lars 3/8).
    // Kortutskriftens tekst har streng tegnbegrensning og maks 22 tegn.
    //
    // Navnet er PRODUKTET hun nettopp brukte, ikke selskapet bak det
    // (Lars 7/8: «I Stripe maa kunden se PromoMaker»). produktnavn() gir
    // app_name tilbake for alle som ikke har satt et eget produktnavn.
    const tjeneste = produktnavn((tenant as any) || {})
    // Spraaket foelger tenantens locale, ikke valutaen. Beskrivelsen og
    // knappeteksten sto hardkodet engelsk, saa en norsk artist fikk engelske
    // setninger midt i en norsk kasse (Lars 7/8). Locale og valuta peker
    // samme vei for alle tenants i dag, men det er spraaket som styrer ord.
    const paaEngelsk = ((tenant as any)?.default_locale || 'no') === 'en'
    const kortTekst = tjeneste.replace(/[^A-Za-z0-9 ]/g, '').trim().slice(0, 22) || undefined

    const prisPkg = packageFor(packageId, erGbp ? 'gbp' : 'nok') ?? pkg
    const beloep = prisPkg.amount

    const session = await getStripe().checkout.sessions.create({
      mode: 'payment',
      line_items: [{
        price_data: {
          // Valutaen foelger tenanten. Var hardkodet 'nok', saa en britisk
          // artist ville faatt kroner i kassen (Lars 3/8).
          currency: erGbp ? 'gbp' : 'nok',
          unit_amount: beloep * 100,
          // Dette er teksten kunden ser i Stripe-kassen og paa kvitteringen.
          // Den sa «kreditter» og «kr/kreditt» ogsaa naar beloepet var i pund
          // (Lars 3/8). Foelger naa valutaen - og med den, spraaket.
          product_data: { name: (tjeneste ? `${tjeneste} — ` : '') + (erGbp
            ? `${credits.toLocaleString('en-GB')} credits (${(beloep / credits).toFixed(4)} GBP per credit)`
            : `${credits.toLocaleString('nb-NO')} kreditter (kurs ${(beloep / credits).toFixed(3).replace('.', ',')} kr/kreditt)`) },
        },
        quantity: 1,
      }],
      metadata: { kind: 'org_topup', organization_id: org.id, amount_nok: String(ledgerNok), bonus_nok: '0', paid_nok: String(beloep), paid_currency: erGbp ? 'gbp' : 'nok', credits: String(credits), rate: (beloep / credits).toFixed(4) },
      // Beskrivelsen foelger med paa Stripes kvittering; kortteksten havner
      // paa kontoutskriften. Selve kassesiden viser fortsatt plattformens
      // kontonavn — det krever Stripe Connect aa endre.
      payment_intent_data: {
        description: tjeneste
          ? (paaEngelsk
              ? `${tjeneste} — ${credits.toLocaleString('en-GB')} credits`
              : `${tjeneste} — ${credits.toLocaleString('nb-NO')} kreditter`)
          : undefined,
        ...(kortTekst ? { statement_descriptor_suffix: kortTekst } : {}),
      },
      custom_text: tjeneste
        ? { submit: { message: paaEngelsk
            ? `${tjeneste} — credits are added to your balance right away.`
            : `${tjeneste} — kredittene legges til saldoen din med en gang.` } }
        : undefined,
      success_url: `${origin}${backTo}?paid=1`,
      cancel_url: `${origin}${backTo}`,
    })
    return NextResponse.json({ url: session.url })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
