import { createClient } from '@supabase/supabase-js'

// Hvem er innlogget? (sikkerhetsgjennomgangen 25.10.2026)
//
// 🔑 BRUKEREN KOMMER FRA SESJONEN, ALDRI FRA KLIENTEN. Flere ruter tok
// `userId` fra adressen eller kroppen (saldo, transaksjoner, Stripe-portalen,
// produksjonsstart), og tre dekodet JWT-en uten å sjekke signaturen — en
// forfalsket `{"sub": "<offer>"}` holdt. Her verifiseres tokenet hos Supabase.

export interface Innlogget { id: string; email: string | null }

export async function innloggetBruker(request: Request): Promise<Innlogget | null> {
  const auth = request.headers.get('authorization')
  if (!auth?.startsWith('Bearer ')) return null
  try {
    const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || '', process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '')
    const { data } = await sb.auth.getUser(auth.slice(7))
    const u = data?.user
    return u?.id ? { id: u.id, email: u.email ?? null } : null
  } catch {
    return null
  }
}
