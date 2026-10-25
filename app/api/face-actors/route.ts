import { NextResponse } from 'next/server'
import { getTenant } from '@/lib/tenantServer'
import { getAvailableFaceActors, ratesForKind } from '@/lib/voiceBank'
import { signerMedier, somListe } from '@/lib/actorMedia'

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
    // 🔑 ALDERSMODELLENE (082) SOM EGNE VALG. En produksjon som trenger
    // henne som 30-åring, velger «Navn · 30 år» — samme person, samme sats,
    // en annen modell. Bare de brukbare: klarert, godkjent av henne, ikke
    // stengt (lib/ageModels). Hovedboken finner eieren via versjonshistorikken.
    const { brukbareAldersmodeller } = await import('@/lib/ageModels')
    const alder = await brukbareAldersmodeller(actors.map((a) => a.id))
    // Kortbildet ligger privat (lib/actorMedia) — lenken lages her.
    const forsteFoto = (a: (typeof actors)[number]) => somListe((a as { photo_urls?: unknown }).photo_urls)[0]
    const lenke = await signerMedier(actors.map((a) => ({ actorId: a.id, verdier: [forsteFoto(a)].filter((v): v is string => !!v) })))
    return NextResponse.json({
      faces: actors.flatMap((a) => {
        const grunn = {
          id: a.id,
          name: a.name,
          faceCharacterId: (a as { face_character_id?: string | null }).face_character_id,
          pricePerUseNok: Math.round(ratesForKind(a, 'face').price * pf * 100) / 100,
          photoUrl: forsteFoto(a) ? lenke(a.id, forsteFoto(a)) : null,
        }
        return [grunn, ...alder.filter((m) => m.actorId === a.id).map((m) => ({
          ...grunn, name: `${a.name} · ${m.label}`, faceCharacterId: m.characterId, ageModel: m.label,
        }))]
      }),
    })
  } catch (err: any) {
    return NextResponse.json({ faces: [], error: err.message })
  }
}
