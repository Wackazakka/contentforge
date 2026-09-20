import { createClient } from '@supabase/supabase-js'
import { tenantChainUp, PLATFORM_RIGHTS_FEE_PCT } from '@/lib/voiceBank'
import {
  beregnFordeling, type SplitSpec,
} from '@/lib/licenceMath'
import {
  mergeRateCard, quoteCampaign, quoteWork, quoteStep, foreslaattHonorar,
  kr, type RateCard, type Asset, type MediaClass, type Territory,
  type Exclusivity, type ProductionTier, type RoleScope,
} from '@/lib/rateCard'

// Klareringsregisteret: lisenser, fordeling og trinn.
//
// Server-only — importerer service-nøkkelen.
//
// 🔑 To regler bærer hele fila:
//
//  1. KRONENE FRYSES PÅ RADEN. Takstkortet foreslår ved opprettelse; etterpå
//     leses aldri prisen fra kortet igjen. Ellers skriver en kortjustering om
//     historien.
//
//  2. DET FINNES TO BEREGNINGSGRUNNLAG (Lars 20.09.2026). Kutt av KUNDEPRISEN
//     (infrastrukturavgift, byråets margin) og kutt av SKUESPILLERENS HONORAR
//     (agent- og managerprovisjon). Forhandles honoraret ned, faller alt i den
//     andre gruppen forholdsmessig — derfor `basis` på hver fordelingsrad, og
//     derfor regnes fordelingen alltid om når et av de to beløpene endres.

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
  )
}

export { beregnFordeling } from '@/lib/licenceMath'
export type { SplitSpec, SplitRad, Fordeling, SplitBasis, PartyType } from '@/lib/licenceMath'

export type LicenceKind = 'campaign' | 'work'
export type LicenceStatus = 'quote' | 'active' | 'expired' | 'superseded' | 'cancelled'
/**
 * Takstkortet som gjelder for en tenant: eget kort hvis satt, ellers arvet
 * nedover fra nærmeste ledd som har ett, ellers plattformens standardkort.
 * Samme arveretning som stemmebanken.
 */
export async function hentTakstkort(tenantId: string): Promise<RateCard> {
  try {
    const chain = await tenantChainUp(tenantId)
    if (chain.length === 0) return mergeRateCard(null)
    const { data } = await admin().from('tenants').select('id, rate_card').in('id', chain)
    const etterKjede = chain
      .map((id) => (data || []).find((t) => t.id === id))
      .find((t) => t && t.rate_card)
    return mergeRateCard(etterKjede?.rate_card ?? null)
  } catch {
    return mergeRateCard(null)
  }
}

export interface LisensInput {
  actorId: string
  tenantId: string
  organizationId?: string | null
  customerLabel?: string | null
  kind: LicenceKind
  asset: Asset
  // kampanje
  mediaClass?: MediaClass | null
  territory?: Territory | null
  termStart?: string | null
  termMonths?: number | null
  exclusivity?: Exclusivity
  // verk
  workTitle?: string | null
  productionTier?: ProductionTier | null
  roleScope?: RoleScope | null
  // penger — utelatt = takstkortets forslag
  feeCustomerNok?: number | null
  feeActorNok?: number | null
  splits?: SplitSpec[]
  notes?: string | null
  createdBy?: string | null
  // oppgjørsvalg (079): fast honorar, royalty, eller begge
  compModel?: CompModel
  royaltyPct?: number | null
  releaseChannel?: ReleaseChannel | null
  releaseTitle?: string | null
}

export type CompModel = 'fee' | 'royalty' | 'hybrid'
export type ReleaseChannel = 'indigoboom' | 'trickletracks' | 'other'

/**
 * Royalty krever en kanal vi kontrollerer. Regelen står også som en
 * check-constraint i basen (079) — dette er bare den vennlige varianten, så
 * brukeren får en setning i stedet for en databasefeil.
 *
 * Grunnen: royalty av en masterinntekt vi ikke ser er et løfte, ikke et
 * produkt. Går utgivelsen gjennom IndigoBoom eller TrickleTracks, passerer
 * pengene vårt eget rør.
 */
export const KONTROLLERTE_KANALER: ReleaseChannel[] = ['indigoboom', 'trickletracks']

export function royaltyErMulig(kanal: ReleaseChannel | null | undefined): boolean {
  return !!kanal && KONTROLLERTE_KANALER.includes(kanal)
}

export function sjekkOppgjoersvalg(i: {
  compModel?: CompModel
  royaltyPct?: number | null
  releaseChannel?: ReleaseChannel | null
}): string | null {
  const m = i.compModel ?? 'fee'
  if (m === 'fee') return null
  if (!royaltyErMulig(i.releaseChannel)) {
    return 'Royalty krever at utgivelsen går gjennom IndigoBoom eller TrickleTracks — ellers kan vi ikke se inntekten den skal regnes av.'
  }
  if (!(Number(i.royaltyPct) > 0)) return 'Royalty krever en sats over null.'
  return null
}

/** Listepris etter kortet, uten å lagre noe. Brukes til å forhåndsutfylle. */
export async function foreslaaPris(i: LisensInput): Promise<{ card: RateCard; listeNok: number; honorarNok: number }> {
  const card = await hentTakstkort(i.tenantId)
  const listeNok = i.kind === 'campaign'
    ? quoteCampaign(card, {
        asset: i.asset,
        mediaClass: (i.mediaClass || 'online') as MediaClass,
        territory: (i.territory || 'no') as Territory,
        termMonths: Number(i.termMonths ?? 3),
        exclusivity: (i.exclusivity || 'none') as Exclusivity,
      })
    : quoteWork(card, {
        asset: i.asset,
        productionTier: (i.productionTier || 'national') as ProductionTier,
        roleScope: (i.roleScope || 'supporting') as RoleScope,
      })
  return { card, listeNok, honorarNok: foreslaattHonorar(card, listeNok) }
}

function sluttdato(start: string | null | undefined, months: number | null | undefined): string | null {
  if (!months || months <= 0) return null // evig
  const d = start ? new Date(start) : new Date()
  d.setMonth(d.getMonth() + months)
  return d.toISOString().slice(0, 10)
}

export async function opprettLisens(i: LisensInput) {
  const feil = sjekkOppgjoersvalg(i)
  if (feil) throw new Error(feil)
  const { card, listeNok, honorarNok } = await foreslaaPris(i)
  const feeCustomer = kr(Number(i.feeCustomerNok ?? listeNok))
  const feeActor = kr(Number(i.feeActorNok ?? foreslaattHonorar(card, feeCustomer)))

  const start = i.termStart || new Date().toISOString().slice(0, 10)
  const rad = {
    actor_id: i.actorId,
    tenant_id: i.tenantId,
    organization_id: i.organizationId ?? null,
    customer_label: i.customerLabel ?? null,
    kind: i.kind,
    asset_type: i.asset,
    media_class: i.kind === 'campaign' ? (i.mediaClass ?? 'online') : null,
    territory: i.kind === 'campaign' ? (i.territory ?? 'no') : null,
    term_start: i.kind === 'campaign' ? start : null,
    term_end: i.kind === 'campaign' ? sluttdato(start, Number(i.termMonths ?? 3)) : null,
    exclusivity: i.exclusivity ?? 'none',
    work_title: i.kind === 'work' ? (i.workTitle ?? null) : null,
    production_tier: i.kind === 'work' ? (i.productionTier ?? null) : null,
    role_scope: i.kind === 'work' ? (i.roleScope ?? null) : null,
    fee_customer_nok: feeCustomer,
    fee_actor_nok: feeActor,
    list_fee_customer_nok: listeNok,
    rate_card_version: card.version,
    status: 'quote' as LicenceStatus,
    notes: i.notes ?? null,
    created_by: i.createdBy ?? null,
    comp_model: i.compModel ?? 'fee',
    royalty_pct: i.compModel && i.compModel !== 'fee' ? Number(i.royaltyPct) : null,
    release_channel: i.releaseChannel ?? null,
    release_title: i.releaseTitle ?? null,
  }

  const { data, error } = await admin().from('licences').insert(rad).select('id').single()
  if (error) throw new Error(error.message)
  const licenceId = (data as { id: string }).id

  await skrivFordeling(licenceId, feeCustomer, feeActor, i.splits ?? standardSplits(i.tenantId, card))

  // Trinn: kun for verk, og kun som forslag med status 'pending'.
  if (i.kind === 'work') {
    const trinn = Object.keys(card.work.steps).map((t) => ({
      licence_id: licenceId,
      trigger_kind: t,
      pct_of_fee: card.work.steps[t],
      amount_nok: quoteStep(card, t, feeCustomer),
      actor_nok: kr((quoteStep(card, t, feeCustomer) * (feeCustomer > 0 ? feeActor / feeCustomer : 0))),
      status: 'pending' as const,
    }))
    if (trinn.length > 0) await admin().from('licence_steps').insert(trinn)
  }

  return { id: licenceId, feeCustomer, feeActor, listeNok, honorarNok }
}

/** Standardparter: infrastrukturavgiften og byrået. Agent legges til manuelt. */
export function standardSplits(tenantId: string, card: RateCard): SplitSpec[] {
  return [
    { party_type: 'platform', party_label: 'Infrastrukturavgift', basis: 'customer_fee', pct: card.platformPct ?? PLATFORM_RIGHTS_FEE_PCT },
    { party_type: 'agency', party_tenant_id: tenantId, basis: 'customer_fee', pct: null },
  ]
}

/**
 * Skriv fordelingen på nytt. Radene er AVLEDET av de to beløpene, så de
 * erstattes i sin helhet hver gang et beløp endres — det er nettopp det som
 * gjør at et nedforhandlet honorar slår gjennom hos alle som tar en andel
 * av honoraret.
 */
export async function skrivFordeling(licenceId: string, feeCustomerNok: number, feeActorNok: number, parter: SplitSpec[]) {
  const f = beregnFordeling(feeCustomerNok, feeActorNok, parter)
  await admin().from('licence_splits').delete().eq('licence_id', licenceId)
  await admin().from('licence_splits').insert(
    f.rader.map((r) => ({
      licence_id: licenceId,
      party_type: r.party_type,
      party_tenant_id: r.party_tenant_id ?? null,
      party_label: r.party_label ?? null,
      basis: r.basis,
      pct: r.pct ?? null,
      amount_nok: r.amount_nok,
    }))
  )
  return f
}

export async function lisenserForSkuespiller(actorId: string) {
  const { data } = await admin()
    .from('licences')
    .select('*')
    .eq('actor_id', actorId)
    .order('created_at', { ascending: false })
  return data || []
}

export async function fordelingFor(licenceId: string) {
  const { data } = await admin().from('licence_splits').select('*').eq('licence_id', licenceId)
  return data || []
}

export async function trinnFor(licenceId: string) {
  const { data } = await admin().from('licence_steps').select('*').eq('licence_id', licenceId).order('created_at')
  return data || []
}

export async function avregningerFor(licenceId: string) {
  const { data } = await admin()
    .from('royalty_statements').select('*')
    .eq('licence_id', licenceId)
    .order('period_start', { ascending: false })
  return data || []
}

/**
 * Før en royalty-avregning for en periode.
 *
 * Grunnlaget er `netReceiptsNok` — det TwinLedger FAKTISK mottok for
 * utgivelsen, ikke brutto fra strømmetjenestene. Brutto lagres ved siden av
 * som opplysning, så fradragskjeden er synlig for den som spør.
 *
 * ⚠️ Kadensen: DSP-ene rapporterer 2–3 måneder på etterskudd via
 * distributøren. En avregning er derfor alltid bakover i tid, og det skal stå
 * i avtalen med rettighetshaveren — ikke oppdages av vedkommende.
 */
export async function foerRoyalty(e: {
  licenceId: string
  periodStart: string
  periodEnd: string
  source?: string | null
  grossNok?: number | null
  netReceiptsNok: number
  /** Utelatt = satsen som står på lisensen. */
  artistPct?: number | null
  note?: string | null
  createdBy?: string | null
}) {
  const { data: lic } = await admin()
    .from('licences').select('id, comp_model, royalty_pct').eq('id', e.licenceId).maybeSingle()
  if (!lic) throw new Error('Lisensen finnes ikke')
  if (lic.comp_model === 'fee') throw new Error('Lisensen har fast honorar — ingen royalty å avregne')

  const pct = Number(e.artistPct ?? lic.royalty_pct)
  if (!(pct > 0)) throw new Error('Mangler royalty-sats')
  const netto = kr(Number(e.netReceiptsNok))
  const artistNok = kr((netto * pct) / 100)

  const { data, error } = await admin().from('royalty_statements').insert({
    licence_id: e.licenceId,
    period_start: e.periodStart,
    period_end: e.periodEnd,
    source: e.source ?? null,
    gross_nok: e.grossNok != null ? kr(Number(e.grossNok)) : null,
    net_receipts_nok: netto,
    artist_pct: pct,
    artist_nok: artistNok,
    note: e.note ?? null,
    created_by: e.createdBy ?? null,
  }).select('id').single()
  if (error) throw new Error(error.message)
  return { id: (data as { id: string }).id, artistNok, pct, netto }
}
