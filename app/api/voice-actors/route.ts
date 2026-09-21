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
    return NextResponse.json({
      voices: actors.map((a) => ({
        id: a.id,
        name: a.name,
        voiceId: a.elevenlabs_voice_id,
        pricePerUseNok: Math.round(ratesForKind(a, kind).price * pf * 100) / 100,
        previewUrl: a.preview_url,
        licence: hjemler ? hjemler[a.id] ?? { licenceId: null, match: 'none' } : null,
      })),
    })
  } catch (err: any) {
    return NextResponse.json({ voices: [], error: err.message })
  }
}
