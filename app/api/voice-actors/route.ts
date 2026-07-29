import { NextResponse } from 'next/server'
import { getTenant } from '@/lib/tenantServer'
import { getAvailableVoiceActors, ratesForKind, actorHasVoice } from '@/lib/voiceBank'

// Stemmebanken for gjeldende tenant (host-basert): egne + arvede skuespillerstemmer.
// Prisen som eksponeres er kundeprisen × tenantens kjede-faktor (utpris).
// ?kind=video|avatar|radio gir brukstypens takst (ellers standardsatsen).
export async function GET(request: Request) {
  try {
    const tenant = await getTenant()
    if (tenant.id === 'root') {
      // Fallback-tenant (tabell mangler) → tom bank
      return NextResponse.json({ voices: [] })
    }
    const kind = new URL(request.url).searchParams.get('kind')
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
    const pf = Number(tenant.price_multiplier) || 1
    return NextResponse.json({
      voices: actors.map((a) => ({
        id: a.id,
        name: a.name,
        voiceId: a.elevenlabs_voice_id,
        pricePerUseNok: Math.round(ratesForKind(a, kind).price * pf * 100) / 100,
        previewUrl: a.preview_url,
      })),
    })
  } catch (err: any) {
    return NextResponse.json({ voices: [], error: err.message })
  }
}
