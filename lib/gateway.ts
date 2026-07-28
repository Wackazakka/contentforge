import { createClient } from '@supabase/supabase-js'
import { createHash, randomBytes } from 'crypto'
import { getAvailableVoiceActors, ratesForKind, type VoiceActor } from '@/lib/voiceBank'
import { getOrgBalance } from '@/lib/tenantBilling'

// Asset-gateway: ekstern tilgang til stemme/ansikt via ÉN nøkkel per kunde.
// Kunden ser bare våre asset-ID-er (voice_actors.id) — aldri de underliggende
// ElevenLabs-/LoRA-ID-ene. All bruk logges i samme royalty-hovedbok som editoren.

export function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
  )
}

export function hashKey(key: string): string {
  return createHash('sha256').update(key).digest('hex')
}

// Generer en ny nøkkel: returnerer klartekst (vises ÉN gang) + hash + prefiks
export function generateApiKey(): { key: string; hash: string; prefix: string } {
  const key = 'sk_live_' + randomBytes(24).toString('hex')
  return { key, hash: hashKey(key), prefix: key.slice(0, 12) }
}

export interface GatewayAuth {
  organizationId: string
  tenantId: string
  scopes: string[]
  creditLimitNok: number | null
  keyId: string
}

// Autentiser en gateway-forespørsel. Returnerer kundekonteksten, eller null.
export async function authenticateKey(request: Request): Promise<GatewayAuth | null> {
  const header = request.headers.get('authorization')
  if (!header?.startsWith('Bearer ')) return null
  const raw = header.slice(7).trim()
  if (!raw.startsWith('sk_live_')) return null
  const { data } = await admin()
    .from('api_keys')
    .select('id, organization_id, tenant_id, scopes, credit_limit_nok, status')
    .eq('key_hash', hashKey(raw))
    .single()
  if (!data || data.status !== 'active') return null
  // Sist brukt (fire-and-forget)
  admin().from('api_keys').update({ last_used_at: new Date().toISOString() }).eq('id', data.id).then(() => {}, () => {})
  return {
    organizationId: data.organization_id,
    tenantId: data.tenant_id,
    scopes: (data.scopes as string[]) || [],
    creditLimitNok: data.credit_limit_nok != null ? Number(data.credit_limit_nok) : null,
    keyId: data.id,
  }
}

// Finn en asset (voice_actor) som er tilgjengelig for kundens tenant.
// Gjenbruker kjede-arv + eksklusivitet fra voiceBank.
export async function resolveAsset(auth: GatewayAuth, assetId: string): Promise<VoiceActor | null> {
  const actors = await getAvailableVoiceActors(auth.tenantId)
  return actors.find((a) => a.id === assetId) || null
}

// Saldo-vakt: false hvis kunden har en forskuddskonto som er tom.
export async function hasBalance(organizationId: string): Promise<boolean> {
  const bal = await getOrgBalance(organizationId)
  return bal === null || bal > 0 // null = ingen konto opprettet → ubegrenset (innkjøring)
}

// Kundepris for en asset/brukstype, ganget med tenantens utpris-kjede.
export async function customerPriceFor(auth: GatewayAuth, actor: VoiceActor, kind: string): Promise<number> {
  const { chainFactorByTenantId } = await import('@/lib/tenantBilling')
  const pf = await chainFactorByTenantId(auth.tenantId)
  return Math.round(ratesForKind(actor, kind).price * pf * 100) / 100
}
