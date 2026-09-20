import { createClient } from '@supabase/supabase-js'

// Rettighetshaverens side av hovedboken: hva som er opptjent, hva som er
// betalt, og hva som gjenstår. Delt mellom admin-API-et (som registrerer
// utbetalinger) og skuespillerens eget innsyn (/api/voice-bank/me).
//
// Server-only: importerer service-nøkkelen. Aldri inn i en klientbundel.

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
  )
}

export const kr = (n: number) => Math.round(n * 100) / 100

// Opptjent totalt, summert i DATABASEN (RPC fra migrasjon 068) — ikke over
// admin-API-ets radtak på 1000 hendelser. Et utbetalingsgrunnlag må være eksakt.
export async function actorEarnings(actorId: string): Promise<{
  uses: number; toActorNok: number; fromCustomersNok: number
  licences: number; licenceToActorNok: number; licenceFromCustomersNok: number
}> {
  const { data } = await admin().rpc('actor_earnings', { p_actor: actorId })
  const row = Array.isArray(data) ? data[0] : data
  return {
    uses: Number(row?.uses ?? 0),
    toActorNok: Number(row?.to_actor_nok ?? 0),
    fromCustomersNok: Number(row?.from_customers_nok ?? 0),
    // Lisensleddet (migrasjon 078). Gamle baser uten kolonnene gir undefined
    // → 0, og hovedboken oppfører seg som før i stedet for å vise NaN.
    licences: Number(row?.licences ?? 0),
    licenceToActorNok: Number(row?.licence_to_actor_nok ?? 0),
    licenceFromCustomersNok: Number(row?.licence_from_customers_nok ?? 0),
  }
}

export interface ActorPayout {
  id: string
  periode_fra: string
  periode_til: string
  amount_nok: number
  betalt_dato: string
  note: string | null
  created_at: string
}

export async function actorPayouts(actorId: string): Promise<{ payouts: ActorPayout[]; totalPaidNok: number }> {
  const { data } = await admin()
    .from('actor_payouts')
    .select('id, periode_fra, periode_til, amount_nok, betalt_dato, note, created_at')
    .eq('actor_id', actorId)
    .order('periode_fra', { ascending: false })
  const payouts = (data || []) as ActorPayout[]
  const totalPaidNok = payouts.reduce((s, p) => s + Number(p.amount_nok || 0), 0)
  return { payouts, totalPaidNok }
}

// Oppgjørsstatus i ett kall: opptjent − betalt = til gode.
//
// «Opptjent» er summen av BEGGE ledd: måleren (per generering) og lisensene
// (bruksretten). Uten lisensleddet ville /min-stemme vist et honorar på noen
// kroner mens de store pengene var usynlige — og det er nettopp lisensen som
// er honoraret i en filmavtale.
export async function actorSettlement(actorId: string) {
  const [earned, paid] = await Promise.all([actorEarnings(actorId), actorPayouts(actorId)])
  const totalEarned = earned.toActorNok + earned.licenceToActorNok
  return {
    uses: earned.uses,
    meterNok: kr(earned.toActorNok),
    licences: earned.licences,
    licenceNok: kr(earned.licenceToActorNok),
    earnedNok: kr(totalEarned),
    paidNok: kr(paid.totalPaidNok),
    dueNok: kr(Math.max(0, totalEarned - paid.totalPaidNok)),
    payouts: paid.payouts,
  }
}
