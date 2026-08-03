import { createClient } from '@supabase/supabase-js'

// Plattformens eget påslag — ContentForges margin mot partnerne (Lars 3/8:
// «IndigoBooms påslag skal jo være upåvirket av CenterForges påslag. Det er
// bare innprisen som forandrer seg»).
//
// Slik henger de tre nivåene sammen:
//
//     råkost  ──(vårt påslag)──▶  INNPRIS  ──(partnerens påslag)──▶  kundepris
//
// Vårt påslag flytter innprisen partneren faktureres. Partnerens prosent står
// urørt — men fordi den regnes av en høyere innpris, følger kundeprisen etter.
// Det er nettopp den arbeidsdelingen Lars beskriver.
//
// Hvorfor det bor på ROT-raden: `COSTS_NOK` er allerede råkost × 2, altså et
// hardkodet 100 %-påslag. Rot-tenanten står lagret med markup_percent = 100,
// og det tallet ble aldri lest (chainPriceFactor hopper over root). Vi tar det
// i bruk i stedet for å innføre enda et felt — og fordi det ALLEREDE er 100,
// endrer ingenting seg før noen bevisst skrur på det.

const STANDARD = 100

/** Faktor å gange COSTS_NOK med for å få innprisen. 100 % → 1,0 (som i dag). */
export function wholesaleFactor(rootMarkupPct: number | null | undefined): number {
  const p = Number(rootMarkupPct ?? STANDARD)
  if (!Number.isFinite(p) || p < 0) return 1
  // COSTS_NOK = råkost × 2. Innpris = råkost × (1 + p/100)
  //           = COSTS_NOK × (1 + p/100) / 2
  return (1 + p / 100) / 2
}

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
  )
}

/** Rot-tenantens påslag. Feiler oppslaget, brukes standarden — aldri null-pris. */
export async function platformMarkupPct(): Promise<number> {
  try {
    const { data } = await admin()
      .from('tenants')
      .select('markup_percent')
      .is('parent_tenant_id', null)
      .limit(1)
      .single()
    const p = Number(data?.markup_percent)
    return Number.isFinite(p) ? p : STANDARD
  } catch {
    return STANDARD
  }
}

export async function platformWholesaleFactor(): Promise<number> {
  return wholesaleFactor(await platformMarkupPct())
}
