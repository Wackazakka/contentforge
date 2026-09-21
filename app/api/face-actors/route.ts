import { NextResponse } from 'next/server'
import { getTenant } from '@/lib/tenantServer'
import { getAvailableFaceActors, ratesForKind } from '@/lib/voiceBank'

// Ansiktsbanken for gjeldende tenant (host-basert) — speiler /api/voice-actors.
// Samme tilgjengelighetslås (kjede-arv + eksklusivitet + Voice Library) og samme
// drop-in-port for uinnloggede. Prisen er kundeprisen × tenantens kjede-faktor.
export async function GET(request: Request) {
  try {
    const tenant = await getTenant()
    if (tenant.id === 'root') {
      return NextResponse.json({ faces: [] })
    }
    let actors = await getAvailableFaceActors(tenant.id)

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

    // Tilbaketrukne ansikter ut av lista. Et ansikt som står valgbart og
    // feiler ved trykk er verre enn et som ikke står der: kunden får en feil
    // hen ikke kunne forutse, og rettighetshaveren står i hylla som om hen var
    // tilgjengelig etter å ha sagt nei.
    //
    // ⚠️ FILTRERES HER, IKKE I getAvailableFaceActors. Den funksjonen deles med
    // logVoiceUsage/logFaceUsage, som slår opp skuespilleren for å FØRE en bruk
    // som allerede har skjedd. Filtrerte vi der, ville en bruk fra før
    // tilbaketrekkingen miste royalty-raden sin — og tilbaketrekking skal ikke
    // virke bakover.
    const { trukketTilbake } = await import('@/lib/faceWithdrawal')
    const stengte = await trukketTilbake(
      actors.map((a) => (a as { face_character_id?: string | null }).face_character_id)
    )
    actors = actors.filter((a) => {
      const cid = (a as { face_character_id?: string | null }).face_character_id
      return !cid || !stengte.has(cid)
    })

    const pf = Number(tenant.price_multiplier) || 1
    return NextResponse.json({
      faces: actors.map((a) => ({
        id: a.id,
        name: a.name,
        faceCharacterId: (a as { face_character_id?: string | null }).face_character_id,
        pricePerUseNok: Math.round(ratesForKind(a, 'face').price * pf * 100) / 100,
        photoUrl: Array.isArray((a as { photo_urls?: string[] }).photo_urls) ? (a as { photo_urls?: string[] }).photo_urls![0] || null : null,
      })),
    })
  } catch (err: any) {
    return NextResponse.json({ faces: [], error: err.message })
  }
}
