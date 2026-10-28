import { createClient } from '@supabase/supabase-js'
import { kreverAvgift, utleggStatus, type Betaler, type UtleggStatus } from '@/lib/onboardingUtlegg'

// Stemmeabonnementet og påmeldingsavgiften (126) — serverdelen.
//
// 🔑 ALT HER FEILER ÅPENT. Mangler tabellene (126 ikke kjørt), svarer
// oppslagene «ingen avgift, intet utlegg». Avgiften skal aldri stoppe en
// trening fordi en migrasjon står igjen; det verste som kan skje er at en
// drop-in slipper å betale den ene gangen.
//
// Server-only: importerer service-nøkkelen.

function db() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || '', process.env.SUPABASE_SERVICE_ROLE_KEY || '')
}

export interface Utlegg {
  id: string
  amountNok: number
  amountUsd: number | null
  payer: Betaler
  agentId: string | null
  agentName: string | null
  status: UtleggStatus
  refundedAt: string | null
  invoicedAt: string | null
  note: string | null
  createdAt: string
}

type UtleggRad = {
  id: string; actor_id: string; amount_nok: number; amount_usd: number | null; payer: Betaler
  talent_agent_id: string | null; refunded_at: string | null; invoiced_at: string | null
  note: string | null; created_at: string; talent_agents?: { name?: string } | null
}

export const UTLEGG_FELTER = 'id, actor_id, amount_nok, amount_usd, payer, talent_agent_id, refunded_at, invoiced_at, note, created_at, talent_agents(name)'

export function tilUtlegg(r: UtleggRad): Utlegg {
  return {
    id: r.id,
    amountNok: Number(r.amount_nok),
    amountUsd: r.amount_usd != null ? Number(r.amount_usd) : null,
    payer: r.payer,
    agentId: r.talent_agent_id,
    agentName: r.talent_agents?.name ?? null,
    status: utleggStatus(r),
    refundedAt: r.refunded_at,
    invoicedAt: r.invoiced_at,
    note: r.note,
    createdAt: r.created_at,
  }
}

/** Stemmeabonnementet hennes, eller null. Null også før 126. */
export async function utleggFor(actorId: string): Promise<Utlegg | null> {
  const { data, error } = await db().from('onboarding_expenses')
    .select(UTLEGG_FELTER).eq('actor_id', actorId).eq('kind', 'voice_subscription').maybeSingle()
  if (error || !data) return null
  return tilUtlegg(data as unknown as UtleggRad)
}

/** Er 126 kjørt? Brukes for å si det rett ut i adminen i stedet for å vise tomt. */
export async function utleggErSlaattPaa(): Promise<boolean> {
  const { error } = await db().from('onboarding_expenses').select('id', { head: true, count: 'exact' }).limit(1)
  return !error
}

/** Bankens påmeldingsavgift i kroner, eller null når den ikke er satt. */
export async function bankensAvgift(tenantId: string): Promise<number | null> {
  const { data, error } = await db().from('tenants').select('enrollment_fee_nok').eq('id', tenantId).maybeSingle()
  if (error || !data) return null
  const n = Number((data as { enrollment_fee_nok?: number | null }).enrollment_fee_nok ?? 0)
  return n > 0 ? n : null
}

export interface AvgiftStatus {
  amountNok: number | null
  required: boolean
  status: 'paid' | 'waived' | null
  at: string | null
}

/** Påmeldingsavgiften for én skuespiller: skal hun betale, og har hun? */
export async function avgiftFor(a: {
  id: string; owner_tenant_id: string; talent_agent_id?: string | null; wants_face?: boolean | null
}): Promise<AvgiftStatus> {
  const amountNok = await bankensAvgift(a.owner_tenant_id)
  let status: 'paid' | 'waived' | null = null
  let at: string | null = null
  const { data } = await db().from('enrollment_fees')
    .select('status, paid_at, created_at').eq('actor_id', a.id).in('status', ['paid', 'waived'])
    .order('created_at', { ascending: false }).limit(1)
  const rad = (data || [])[0] as { status: 'paid' | 'waived'; paid_at: string | null; created_at: string } | undefined
  if (rad) { status = rad.status; at = rad.paid_at ?? rad.created_at }
  return {
    amountNok,
    required: kreverAvgift({ avgiftNok: amountNok, harByraa: !!a.talent_agent_id, vilHaAnsikt: a.wants_face === true, status }),
    status,
    at,
  }
}

/**
 * Marker avgiften betalt fra en Stripe-økt. Idempotent: bare en ventende rad
 * med nøyaktig denne økta flippes, så webhooken og returen fra kassen kan
 * begge kalle den.
 *
 * ⚠️ Har hun betalt to økter (to faner), avviser den unike indeksen den andre.
 * Det logges høyt — da er hun belastet to ganger og skal ha den ene tilbake i
 * Stripe.
 */
export async function fullfoerAvgift(sessionId: string): Promise<'paid' | 'already' | 'missing' | 'double'> {
  const { data, error } = await db().from('enrollment_fees')
    .update({ status: 'paid', paid_at: new Date().toISOString() })
    .eq('stripe_session_id', sessionId).eq('status', 'pending').select('id')
  if (error) {
    if (/duplicate|unique/i.test(error.message)) {
      console.error('[avgift] DOBBEL BETALING — refunder i Stripe. Økt:', sessionId)
      return 'double'
    }
    throw new Error(error.message)
  }
  if (data?.length) return 'paid'
  const { data: finnes } = await db().from('enrollment_fees').select('status').eq('stripe_session_id', sessionId).maybeSingle()
  return finnes ? 'already' : 'missing'
}

/**
 * Hinder for å trene ansiktsmodellen hennes: en tekst, eller null.
 * Kalles fra treningsporten. Feiler åpent (se toppen).
 */
export async function avgiftHinder(actorId: string, tenantId: string): Promise<string | null> {
  const { data } = await db().from('voice_actors')
    .select('id, owner_tenant_id, talent_agent_id, wants_face').eq('id', actorId).eq('owner_tenant_id', tenantId).maybeSingle()
  if (!data) return null
  const a = await avgiftFor(data as { id: string; owner_tenant_id: string; talent_agent_id: string | null; wants_face: boolean | null })
  if (!a.required) return null
  return `Påmeldingsavgiften (${a.amountNok} kr) er ikke betalt. Hun betaler den på siden sin, eller du kan frita henne på skuespillerkortet.`
}
