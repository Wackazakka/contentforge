import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Innlogging + eierskap for rutehandlere (25.10.2026). Samme mønster som
// own-voice og generate-image: tokenet verifiseres med service-nøkkelen, og
// eierskapet sjekkes med BRUKERENS token mot RLS (products er kun synlig for
// eieren). proxy.ts matcher bare «/», så hver rute må gjøre dette selv —
// avatar-opplastingene var helt åpne før dette. (Stemme-forhåndsvisningene
// har sin egen sjekk med stemmebanken i lib/stemmeTilgang.)
//
// To steg, fordi produkt-ID-en ofte ligger i kroppen: sjekk tokenet FØR
// kroppen leses (ingen anonym 25 MB-opplasting), og eierskapet etterpå.

export type InnloggetBruker = { userId: string; email: string | null; token: string }

export async function krevInnlogget(request: Request): Promise<InnloggetBruker | NextResponse> {
  const auth = request.headers.get('authorization')
  if (!auth?.startsWith('Bearer ')) return NextResponse.json({ error: 'Ikke innlogget' }, { status: 401 })
  const token = auth.slice(7)
  const { data } = await createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  ).auth.getUser(token)
  if (!data?.user?.id) return NextResponse.json({ error: 'Ikke innlogget' }, { status: 401 })
  return { userId: data.user.id, email: data.user.email ?? null, token }
}

/** null = brukeren eier produktet; ellers svaret ruta skal gi. */
export async function krevProdukteier(token: string, productId: string | null | undefined): Promise<NextResponse | null> {
  if (!productId) return NextResponse.json({ error: 'productId kreves' }, { status: 400 })
  const somBruker = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || '', process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '', {
    global: { headers: { Authorization: `Bearer ${token}` } },
  })
  const { data } = await somBruker.from('products').select('id').eq('id', productId).maybeSingle()
  if (!data) return NextResponse.json({ error: 'Ingen tilgang til dette produktet' }, { status: 403 })
  return null
}
