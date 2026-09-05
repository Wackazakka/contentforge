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
export async function actorEarnings(actorId: string): Promise<{ uses: number; toActorNok: number; fromCustomersNok: number }> {
  const { data } = await admin().rpc('actor_earnings', { p_actor: actorId })
  const row = Array.isArray(data) ? data[0] : data
  return {
    uses: Number(row?.uses ?? 0),
    toActorNok: Number(row?.to_actor_nok ?? 0),
    fromCustomersNok: Number(row?.from_customers_nok ?? 0),
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
export async function actorSettlement(actorId: string) {
  const [earned, paid] = await Promise.all([actorEarnings(actorId), actorPayouts(actorId)])
  return {
    uses: earned.uses,
    earnedNok: kr(earned.toActorNok),
    paidNok: kr(paid.totalPaidNok),
    dueNok: kr(Math.max(0, earned.toActorNok - paid.totalPaidNok)),
    payouts: paid.payouts,
  }
}
