import { createClient } from '@supabase/supabase-js'

// De to påslagene (Lars 3/8):
//
//   råkost ──(vårt påslag mot DENNE partneren)──▶ INNPRIS ──(partnerens)──▶ sluttpris
//
// «Påslaget påvirker bare én ting for IndigoBoom: innprisen. Så setter
// IndigoBoom sitt påslag, og det påvirker bare én ting: hvor mye sluttbrukeren
// må betale.»
//
// Vårt påslag settes PER white-label (`tenants.wholesale_markup_pct`), ikke som
// ett felles plattformtall — ulike partnere kan ha ulike avtaler.
//
// Hvorfor halveringen: `COSTS_NOK` er allerede råkost × 2. Innprisen er
// råkost × (1 + w/100), altså COSTS_NOK × (1 + w/100) / 2. Standard w = 100 gir
// faktor 1,0, som er nøyaktig dagens tall.

const STANDARD = 100

/** Faktor å gange COSTS_NOK med for å få partnerens innpris. */
export function wholesaleFactor(wholesaleMarkupPct: number | null | undefined): number {
  const w = Number(wholesaleMarkupPct ?? STANDARD)
  if (!Number.isFinite(w) || w < 0) return 1
  return (1 + w / 100) / 2
}

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
  )
}

/**
 * Innprisfaktor for en gitt tenant. Feiler oppslaget — eller er kolonnen ikke
 * migrert ennå — brukes standarden, som gir dagens priser. En manglende
 * migrasjon skal aldri endre hva noen faktureres.
 */
export async function wholesaleFactorForTenant(tenantId: string | null | undefined): Promise<number> {
  if (!tenantId || tenantId === 'root') return 1
  try {
    const { data, error } = await admin()
      .from('tenants')
      .select('wholesale_markup_pct')
      .eq('id', tenantId)
      .single()
    if (error) return 1
    return wholesaleFactor((data as any)?.wholesale_markup_pct)
  } catch {
    return 1
  }
}
