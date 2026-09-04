import { createClient } from '@supabase/supabase-js'

// Omgjøringer (Lars 4/9): hver betalte film gir TRE gratis omgjøringer av
// samme anledning. Filmene for en anledning telles i blokker på fire —
// film 1 betales (og koster Norditech 25 kr), film 2–4 er gratis
// omgjøringer (0 kr i alle ledd), film 5 betales igjen, osv.
//
// Tellingen er usage_events med event_type 'film_production' for produktet.
// Den logges ved jobbstart i startProductionForDraft — én kilde for både
// betalingssjekken (film-checkout) og forbruksloggingen (production).
// ⚠️ En produksjon som feiler på dropleten teller også — dropletens
// utfall lever i production_jobs og telles ikke her. Sjelden nok til at
// det tas manuelt hvis en kunde klager.

export const FREE_REMAKES = 3
const BLOCK = FREE_REMAKES + 1

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  )
}

export async function filmCountForProduct(productId: string): Promise<number> {
  const { count } = await admin()
    .from('usage_events')
    .select('id', { count: 'exact', head: true })
    .eq('product_id', productId)
    .eq('event_type', 'film_production')
  return count || 0
}

// Er film nr. (count+1) en gratis omgjøring?
export function isFreeRemake(filmsSoFar: number): boolean {
  return filmsSoFar % BLOCK !== 0
}

// Hvor mange gratis omgjøringer som er igjen i inneværende blokk.
export function freeRemakesLeft(filmsSoFar: number): number {
  if (filmsSoFar === 0) return 0
  const used = filmsSoFar % BLOCK
  return used === 0 ? 0 : BLOCK - used
}
