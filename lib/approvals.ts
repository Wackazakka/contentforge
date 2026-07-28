import { randomBytes } from 'crypto'
import { admin } from '@/lib/gateway'
import { chainFactorByTenantId } from '@/lib/tenantBilling'

// Godkjenningsflyt: en skuespiller kan kreve å godkjenne hver publisering per
// kunde (eller gi carte blanche). Ved review-modus genereres innholdet, men
// leveringen holdes tilbake til skuespilleren godkjenner — eller til en avtalt
// frist løper ut uten innsigelse (kundens deadlines respekteres).

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'https://contentforge-610.netlify.app'

export interface ApprovalMode {
  mode: 'auto' | 'review'
  timeoutHours: number
}

// Godkjenningsmodus for (skuespiller × kunde). Ingen rad = 'auto' (carte blanche,
// = dagens oppførsel; byrået setter 'review' der skuespilleravtalen krever det).
export async function getApprovalMode(actorId: string, organizationId: string): Promise<ApprovalMode> {
  try {
    const { data } = await admin()
      .from('actor_approval_settings')
      .select('mode, timeout_hours')
      .eq('actor_id', actorId)
      .eq('organization_id', organizationId)
      .single()
    if (data?.mode === 'review') return { mode: 'review', timeoutHours: Number(data.timeout_hours) || 24 }
    return { mode: 'auto', timeoutHours: 24 }
  } catch {
    return { mode: 'auto', timeoutHours: 24 }
  }
}

export function generateReviewToken(): string {
  return randomBytes(24).toString('hex')
}

// Opprett en ventende godkjenning + varsle skuespilleren. Returnerer id + frist.
export async function createPendingApproval(a: {
  actorId: string
  organizationId: string
  tenantId: string
  assetType: 'voice' | 'face'
  kind: string
  contentUrl: string
  detail: string
  actorRateNok: number
  customerPriceNok: number
  timeoutHours: number
}): Promise<{ id: string; expiresAt: string } | null> {
  try {
    const token = generateReviewToken()
    const expiresAt = new Date(Date.now() + a.timeoutHours * 3600_000).toISOString()
    const { data, error } = await admin()
      .from('usage_approvals')
      .insert({
        actor_id: a.actorId,
        organization_id: a.organizationId,
        tenant_id: a.tenantId,
        asset_type: a.assetType,
        kind: a.kind,
        content_url: a.contentUrl,
        detail: a.detail.slice(0, 1000),
        actor_rate_nok: a.actorRateNok,
        customer_price_nok: a.customerPriceNok,
        review_token: token,
        expires_at: expiresAt,
      })
      .select('id')
      .single()
    if (error || !data) return null
    // Varsle skuespilleren (fire-and-forget — velter aldri genereringen)
    sendApprovalEmail(a.actorId, token, a.kind, expiresAt).catch(() => {})
    return { id: data.id, expiresAt }
  } catch {
    return null
  }
}

// Send godkjenningsvarsel til skuespilleren med magisk lenke (ingen innlogging).
async function sendApprovalEmail(actorId: string, token: string, kind: string, expiresAt: string): Promise<void> {
  const supabase = admin()
  const { data: actor } = await supabase.from('voice_actors').select('name, actor_email, owner_tenant_id').eq('id', actorId).single()
  if (!actor?.actor_email) return
  const { data: tenant } = await supabase.from('tenants').select('app_name').eq('id', actor.owner_tenant_id).single()
  const brand = tenant?.app_name || 'CenterForge'
  const link = `${BASE_URL}/godkjenn/${token}`
  const frist = new Date(expiresAt).toLocaleString('nb-NO')
  const hva = kind === 'speech' ? 'et lydklipp med stemmen din' : kind === 'face' ? 'et bilde med ansiktet ditt' : 'innhold med stemmen din'

  try {
    const { Resend } = await import('resend')
    const resend = new Resend(process.env.RESEND_API_KEY)
    await resend.emails.send({
      from: `${brand} <hello@centerforge.app>`,
      to: actor.actor_email,
      subject: `Godkjenning: ${hva}`,
      html: `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#1C1A16">
        <h2 style="margin:0 0 12px">Hei ${actor.name.split(' ')[0]},</h2>
        <p>En kunde hos ${brand} ønsker å publisere ${hva}. Hør/se gjennom det og godkjenn eller avvis:</p>
        <p style="margin:24px 0"><a href="${link}" style="background:#C5451B;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600">Se og vurder</a></p>
        <p style="color:#6B6358;font-size:14px">Hvis du ikke svarer innen <strong>${frist}</strong>, blir bruken automatisk godkjent slik at kunden rekker sin frist.</p>
      </div>`,
    })
  } catch { /* e-post feiler stille */ }
}

// Logg levering i royalty-hovedboken + meter (trekker saldo). Kalles ÉN gang,
// av den som atomisk flyttet godkjenningen fra pending → approved.
export async function logApprovedDelivery(row: {
  actor_id: string
  organization_id: string
  tenant_id: string
  asset_type: string
  kind: string
  actor_rate_nok: number
  customer_price_nok: number
}): Promise<void> {
  try {
    const supabase = admin()
    await supabase.from('voice_usage_events').insert({
      actor_id: row.actor_id,
      used_by_tenant_id: row.tenant_id,
      actor_rate_nok: row.actor_rate_nok,
      customer_price_nok: row.customer_price_nok,
      asset_type: row.asset_type,
      meta: { kind: row.kind, source: 'gateway', organization_id: row.organization_id, approved: true },
    })
    const pf = await chainFactorByTenantId(row.tenant_id)
    await supabase.from('usage_events').insert({
      tenant_id: row.tenant_id,
      organization_id: row.organization_id,
      event_type: `gateway_${row.kind}`,
      cost_nok: row.customer_price_nok,
      customer_cost_nok: Math.round(row.customer_price_nok * pf * 100) / 100,
      meta: { source: 'gateway', asset_id: row.actor_id, approved: true },
    })
  } catch (err) {
    console.warn('[approvals] levering-logging feilet:', err)
  }
}

// Atomisk overgang pending → approved/rejected. Returnerer raden hvis DENNE
// kallet gjorde overgangen (idempotent), ellers null.
export async function decideApproval(match: { token?: string; id?: string }, decision: 'approved' | 'rejected', via: 'actor' | 'timeout') {
  const supabase = admin()
  let q = supabase.from('usage_approvals').update({ status: decision, decided_at: new Date().toISOString(), decided_via: via }).eq('status', 'pending')
  if (match.token) q = q.eq('review_token', match.token)
  if (match.id) q = q.eq('id', match.id)
  const { data } = await q.select('*')
  return data && data.length > 0 ? data[0] : null
}
