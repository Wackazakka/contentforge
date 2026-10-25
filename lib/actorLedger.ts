import { createClient } from '@supabase/supabase-js'
import { tilGode, byraaProsent, kr, type Opptjent, type Avregnet, type Til_gode } from '@/lib/byraaOppgjoer'

// Rettighetshaverens side av hovedboken: hva som er opptjent, hva som er
// betalt, og hva som gjenstår. Delt mellom admin-API-et (som registrerer
// utbetalinger) og skuespillerens eget innsyn (/api/voice-bank/me).
//
// Fra 25.10 (117) også byråets andel: regnestykket bor i lib/byraaOppgjoer,
// her hentes tallene det regner på.
//
// Server-only: importerer service-nøkkelen. Aldri inn i en klientbundel.

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
  )
}

export { kr }

// Opptjent totalt, summert i DATABASEN (RPC fra migrasjon 068) — ikke over
// admin-API-ets radtak på 1000 hendelser. Et utbetalingsgrunnlag må være eksakt.
export async function actorEarnings(actorId: string): Promise<{
  uses: number; toActorNok: number; fromCustomersNok: number
  licences: number; licenceToActorNok: number; licenceFromCustomersNok: number
  royaltyPeriods: number; royaltyToActorNok: number
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
    // Royalty-leddet (migrasjon 079): andel av det utgivelsen faktisk tjente.
    royaltyPeriods: Number(row?.royalty_periods ?? 0),
    royaltyToActorNok: Number(row?.royalty_to_actor_nok ?? 0),
  }
}

export interface ActorPayout {
  id: string
  periode_fra: string
  periode_til: string
  amount_nok: number
  gross_nok: number | null
  agent_cut_nok: number
  commission_base_nok: number | null
  licence_agent_nok: number
  betalt_dato: string
  note: string | null
  created_at: string
}

export async function actorPayouts(actorId: string): Promise<{ payouts: ActorPayout[]; totalPaidNok: number; avregnet: Avregnet }> {
  const { data } = await admin()
    .from('actor_payouts')
    .select('id, periode_fra, periode_til, amount_nok, gross_nok, agent_cut_nok, commission_base_nok, licence_agent_nok, betalt_dato, note, created_at')
    .eq('actor_id', actorId)
    .order('periode_fra', { ascending: false })
  const payouts = (data || []) as ActorPayout[]
  const sum = (f: (p: ActorPayout) => number) => kr(payouts.reduce((s, p) => s + f(p), 0))
  // Rader fra før 097/117 uten brutto eller grunnlag: da var brutto = netto,
  // og alt var per bruk (se 117) — samme regel som migrasjonen fylte inn.
  const brutto = (p: ActorPayout) => Number(p.gross_nok ?? p.amount_nok ?? 0)
  const avregnet: Avregnet = {
    grossNok: sum(brutto),
    netNok: sum((p) => Number(p.amount_nok || 0)),
    cutNok: sum((p) => Number(p.agent_cut_nok || 0)),
    baseNok: sum((p) => Number(p.commission_base_nok ?? brutto(p))),
    licenceAgentNok: sum((p) => Number(p.licence_agent_nok || 0)),
  }
  return { payouts, totalPaidNok: avregnet.netNok, avregnet }
}

export interface ActorAgency { id: string; name: string; pct: number }

/** Byrået hun er knyttet til, med satsen som gjelder henne. */
export async function actorAgency(actorId: string): Promise<ActorAgency | null> {
  const { data: a } = await admin().from('voice_actors')
    .select('talent_agent_id, agent_commission_pct').eq('id', actorId).maybeSingle()
  const agentId = (a as { talent_agent_id?: string | null } | null)?.talent_agent_id
  if (!agentId) return null
  const { data: ta } = await admin().from('talent_agents')
    .select('id, name, default_commission_pct').eq('id', agentId).maybeSingle()
  if (!ta) return null
  return {
    id: ta.id as string,
    name: ta.name as string,
    pct: byraaProsent((a as { agent_commission_pct?: number | null }).agent_commission_pct, (ta as { default_commission_pct?: number | null }).default_commission_pct),
  }
}

/** Byråets andel av lisensene hennes, slik den står frosset på lisensene. */
async function lisensandelByraa(actorId: string): Promise<number> {
  const { data } = await admin().from('licence_splits')
    .select('amount_nok, licences!inner(actor_id, status)')
    .eq('party_type', 'agent').eq('basis', 'actor_fee')
    .eq('licences.actor_id', actorId).in('licences.status', ['active', 'expired'])
  return kr((data || []).reduce((s, r) => s + Number((r as { amount_nok: number }).amount_nok || 0), 0))
}

// Oppgjørsstatus i ett kall.
//
// «Opptjent» er summen av ALLE TRE ledd: måleren (per generering), lisensene
// (bruksretten) og royalty (andel av det utgivelsen faktisk tjente). Uten
// lisens- og royaltyleddet ville /min-stemme vist et honorar på noen kroner
// mens de store pengene var usynlige — og for en vokalist er det nettopp
// royaltyen som er oppsiden.
//
// 🔑 «TIL GODE» ER HENNES DEL ETTER BYRÅETS ANDEL (117). Opptjent er brutto;
// byråets andel står for seg; opptjent − byrå − utbetalt = til gode.
export async function actorSettlement(actorId: string) {
  const [earned, paid, byraa, lisensByraa] = await Promise.all([
    actorEarnings(actorId), actorPayouts(actorId), actorAgency(actorId), lisensandelByraa(actorId),
  ])
  const opptjent: Opptjent = {
    meterNok: earned.toActorNok,
    royaltyNok: earned.royaltyToActorNok,
    licenceFeeNok: earned.licenceToActorNok,
    licenceAgentNok: lisensByraa,
  }
  const t: Til_gode = tilGode(opptjent, paid.avregnet, byraa?.pct ?? 0, !!byraa)
  const totalEarned = earned.toActorNok + earned.licenceToActorNok + earned.royaltyToActorNok
  return {
    uses: earned.uses,
    meterNok: kr(earned.toActorNok),
    licences: earned.licences,
    licenceNok: kr(earned.licenceToActorNok),
    royaltyPeriods: earned.royaltyPeriods,
    royaltyNok: kr(earned.royaltyToActorNok),
    earnedNok: kr(totalEarned),
    // Byråets andel: det som er frosset på utbetalingene, pluss det som vil
    // bli trukket av det som er til gode nå.
    agentNok: kr(paid.avregnet.cutNok + t.cutNok),
    agency: byraa,
    paidNok: kr(paid.totalPaidNok),
    dueNok: t.netNok,
    dueGrossNok: t.grossNok,
    dueAgentNok: t.cutNok,
    tilGode: t,
    payouts: paid.payouts,
  }
}

/**
 * Byråenes oppgjør i en bank: det som er frosset på skuespillernes
 * utbetalinger, minus det byrået har fått. Én overføring per byrå (097).
 */
export async function agencySettlements(tenantId: string) {
  const db = admin()
  const { data: byraaer } = await db.from('talent_agents')
    .select('id, name, contact_email, org_nr').eq('tenant_id', tenantId).order('name')
  if (!byraaer?.length) return []
  const ider = byraaer.map((b) => b.id as string)
  const [{ data: kutt }, { data: betalt }] = await Promise.all([
    db.from('actor_payouts').select('talent_agent_id, agent_cut_nok, periode_til').in('talent_agent_id', ider),
    db.from('talent_agent_payouts').select('talent_agent_id, amount_nok, periode_til, betalt_dato').in('talent_agent_id', ider).eq('tenant_id', tenantId),
  ])
  return byraaer.map((b) => {
    const mine = (kutt || []).filter((k) => k.talent_agent_id === b.id)
    const fikk = (betalt || []).filter((k) => k.talent_agent_id === b.id)
    const opptjent = kr(mine.reduce((s, k) => s + Number(k.agent_cut_nok || 0), 0))
    const utbetalt = kr(fikk.reduce((s, k) => s + Number(k.amount_nok || 0), 0))
    const sistTil = fikk.reduce<string | null>((m, k) => (!m || String(k.periode_til) > m ? String(k.periode_til) : m), null)
    return {
      agentId: b.id as string, name: b.name as string,
      email: (b.contact_email as string | null) ?? null, orgNr: (b.org_nr as string | null) ?? null,
      earnedNok: opptjent, paidNok: utbetalt, dueNok: kr(Math.max(0, opptjent - utbetalt)),
      sistTil,
      sistUtbetalt: fikk.reduce<string | null>((m, k) => (!m || String(k.betalt_dato) > m ? String(k.betalt_dato) : m), null),
    }
  })
}
