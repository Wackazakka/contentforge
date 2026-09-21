import { NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { createClient } from '@supabase/supabase-js'

// Opplastingslenke for treningsbildene — til en PRIVAT bøtte.
//
// 🔑 HVORFOR DETTE FLYTTET SEG FRA R2. Zipen lå tidligere i R2 under
// `characters/zips/<uuid>.zip`, og R2-bøtta er eksponert i sin helhet gjennom
// `pub-…r2.dev`. Det betyr at 18 bilder av et menneske lå fritt lesbare for
// enhver som kjente stien — «sikkerhet ved uklarhet», beskyttet av at ingen
// gjetter en UUID. For Mari spilte det ingen rolle; hun er fiktiv. For den
// første ekte skuespilleren gjør det det, og denne flyttingen må skje FØR
// noen ekte person laster opp bilder, ikke etter.
//
// 🔑 SUPABASE, IKKE EN NY R2-BØTTE. Storage er alt i bruk her (music-inbox),
// bøtta kan settes privat, og signerte URL-er med utløp er innebygd. En ny
// R2-bøtte ville krevd nye miljøvariabler og en manuell opprettelse.
//
// Fal må kunne HENTE zipen. Den får en signert lenke med kort levetid når
// treningen startes — se /api/characters/train. Det som lagres på raden er
// STIEN, ikke lenken: en signert URL utløper, og en rad som peker på noe
// utløpt svarer ikke på «hvilke bilder ble modellen laget fra?».

export const BOTTE = 'training-sets'

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  )
}

export async function GET(request: Request) {
  try {
    // Krever innlogging: en opplastingslenke er en skriverett, og den skal
    // ikke deles ut til hvem som helst som kjenner adressen.
    const auth = request.headers.get('authorization')
    if (!auth?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Ikke innlogget' }, { status: 401 })
    }
    const { data: u } = await admin().auth.getUser(auth.slice(7))
    if (!u?.user?.id) return NextResponse.json({ error: 'Ikke innlogget' }, { status: 401 })

    const sti = `${u.user.id}/${randomUUID()}.zip`
    const { data, error } = await admin().storage.from(BOTTE).createSignedUploadUrl(sti)
    if (error) {
      // Mangler bøtta, sier vi det rett ut. «Opplasting feilet» ville sendt
      // neste leser til nettverksfanen i stedet for til oppsettet.
      return NextResponse.json(
        { error: `Kunne ikke lage opplastingslenke (${error.message}). Finnes bøtta «${BOTTE}»?` },
        { status: 500 }
      )
    }
    // `path` er det klienten sender videre til /train. Ingen offentlig URL
    // returneres — det finnes ingen.
    return NextResponse.json({ uploadUrl: data.signedUrl, token: data.token, path: sti })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
