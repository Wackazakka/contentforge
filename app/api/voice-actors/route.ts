import { NextResponse } from 'next/server'
import { getTenant } from '@/lib/tenantServer'
import { getAvailableVoiceActors, ratesForKind, actorHasVoice } from '@/lib/voiceBank'

// Stemmebanken for gjeldende tenant (host-basert): egne + arvede skuespillerstemmer.
// Prisen som eksponeres er kundeprisen × tenantens kjede-faktor (utpris).
// ?kind=video|avatar|radio gir brukstypens takst (ellers standardsatsen).
//
// 🔑 ?productId= GIR HJEMMELEN MED. Da svarer ruta ikke bare «hvem finnes i
// banken», men «hvem har jeg lov til å bruke» — sett fra kunden som eier
// produktet. Kunden hentes av `getProductTenant`, altså nøyaktig samme kilde
// som produksjonsruta bruker når bruken senere logges, og hjemmelen avgjøres
// av samme funksjon. Spør flaten med andre inndata enn hovedboken svarer med,
// er «Lisens på plass» en påstand ingen har sjekket.
export async function GET(request: Request) {
  try {
    const tenant = await getTenant()
    if (tenant.id === 'root') {
      // Fallback-tenant (tabell mangler) → tom bank
      return NextResponse.json({ voices: [] })
    }
    const sp = new URL(request.url).searchParams
    const kind = sp.get('kind')
    const productId = sp.get('productId')
    // Kun rader MED stemme — ansikts-rader hører hjemme i /api/face-actors
    let actors = (await getAvailableVoiceActors(tenant.id)).filter(actorHasVoice)

    // Drop-in-porten: uinnloggede ser kun skuespillere som har åpnet for
    // Voice Library (= samtykket til åpen distribusjon). Innloggede kunder
    // ser hele bankens utvalg.
    let loggedIn = false
    const auth = request.headers.get('authorization')
    if (auth?.startsWith('Bearer ')) {
      try {
        const { createClient } = await import('@supabase/supabase-js')
        const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || '', process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '')
        const { data } = await sb.auth.getUser(auth.slice(7))
        loggedIn = !!data?.user
      } catch { /* behandles som drop-in */ }
    }
    if (!loggedIn) actors = actors.filter((a) => (a as { library_enabled?: boolean }).library_enabled === true)

    // Hjemmelen slås opp én gang for hele banken, ikke én gang per stemme.
    // Uten produkt (og dermed uten kunde) spør vi ikke i det hele tatt — da
    // er svaret `null`, som flatene leser som «ikke spurt», ikke «nei».
    let hjemler: Record<string, { licenceId: string | null; match: string }> | null = null
    if (productId && loggedIn) {
      const { getProductTenant } = await import('@/lib/tenantBilling')
      const { lisensStatusFor } = await import('@/lib/licenceMatch')
      const pt = await getProductTenant(productId)
      hjemler = await lisensStatusFor({
        actorIds: actors.map((a) => a.id),
        organizationId: pt.organizationId,
        assetType: 'voice',
      })
    }

    const pf = Number(tenant.price_multiplier) || 1

    // ⚠️ SKUESPILLERENS SATS SLIPPES KUN UT PÅ TWINLEDGER, OG PORTEN STÅR HER
    // PÅ SERVEREN — ikke i klienten. Differansen mellom kundepris og sats ER
    // leddets margin. Sendes den til en white-label-kjede, ser Isabels og
    // IndigoBooms kunder partnerens påslag i et nettverkskall. På TwinLedger er
    // marginen vår egen, og fordelingen er allerede publisert på /pricing —
    // der er åpenheten selve varen.
    //
    // Satsen ganges IKKE med kjedefaktoren: rettighetshaveren får sitt uansett
    // hva leddene over legger på. `actor_earnings` summerer nøyaktig denne
    // kolonnen, så tallet er det hen faktisk tjener — ikke et anslag.
    const viserSats = tenant.slug === 'twinledger'

    return NextResponse.json({
      voices: actors.map((a) => {
        const { rate, price } = ratesForKind(a, kind)
        return {
          id: a.id,
          name: a.name,
          voiceId: a.elevenlabs_voice_id,
          pricePerUseNok: Math.round(price * pf * 100) / 100,
          actorRateNok: viserSats ? Math.round(rate * 100) / 100 : null,
          previewUrl: a.preview_url,
          licence: hjemler ? hjemler[a.id] ?? { licenceId: null, match: 'none' } : null,
        }
      }),
    })
  } catch (err: any) {
    return NextResponse.json({ voices: [], error: err.message })
  }
}
