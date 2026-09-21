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

// Saldo-vakt for gateway-en. Snudd 16.09.2026 (Lars): «ingen forskuddskonto»
// betyr STOPP, ikke ubegrenset. Innkjørings-unntaket (null = fri bruk) ga en
// kunde som aldri hadde betalt fri tilgang med nøkkel. Editoren har sin egen
// vakt og er uendret. To grunner skilles så kunden får vite hva som mangler.
export type BalanceCheck = { ok: true } | { ok: false; reason: 'none' | 'empty' }
export async function checkBalance(organizationId: string): Promise<BalanceCheck> {
  const bal = await getOrgBalance(organizationId)
  if (bal === null) return { ok: false, reason: 'none' }
  if (bal <= 0) return { ok: false, reason: 'empty' }
  return { ok: true }
}

export const BALANCE_REFUSAL: Record<'none' | 'empty', { error: string; code: string }> = {
  none: { error: 'Kontoen har ingen forskuddssaldo ennå. Kjøp kreditt før API-nøkkelen kan brukes.', code: 'ORG_BALANCE_NONE' },
  empty: { error: 'Kontoen er tom. Kjøp mer kreditt for å fortsette.', code: 'ORG_BALANCE_EMPTY' },
}

// Kundepris for en asset/brukstype, ganget med tenantens utpris-kjede.
export async function customerPriceFor(auth: GatewayAuth, actor: VoiceActor, kind: string): Promise<number> {
  const { chainFactorByTenantId } = await import('@/lib/tenantBilling')
  const pf = await chainFactorByTenantId(auth.tenantId)
  return Math.round(ratesForKind(actor, kind).price * pf * 100) / 100
}

// Generer et bilde fra en skuespillers ansikt (Flux LoRA) med VÅR fal-nøkkel.
// LoRA-vektene (lora_url) slås opp server-side og forlater ALDRI serveren —
// kunden får bildet, aldri modellen. Returnerer en PNG-buffer.
export async function generateFaceImage(faceCharacterId: string, prompt: string, imageSize = '1024x1536'): Promise<Buffer> {
  const FAL_KEY = process.env.CONTENTFORGE_FAL_KEY
  if (!FAL_KEY) throw new Error('CONTENTFORGE_FAL_KEY mangler')

  // Porten: kaster AnsiktTrukketTilbake om retten er stengt. Se lib/faceWithdrawal.
  const { hentAnsiktForGenerering } = await import('@/lib/faceWithdrawal')
  const ch = await hentAnsiktForGenerering(faceCharacterId)

  const SIZE_MAP: Record<string, { width: number; height: number }> = {
    '1024x1024': { width: 1024, height: 1024 },
    '1024x1536': { width: 768, height: 1344 },
    '1536x1024': { width: 1344, height: 768 },
  }
  const image_size = SIZE_MAP[imageSize] || SIZE_MAP['1024x1536']
  const fullPrompt =
    ch.triggerWord + '. Use the trained ' + ch.triggerWord + ' LoRA with maximum identity fidelity. ' +
    ch.triggerWord + ', natural appearance, natural relaxed posture. Scene: ' + prompt +
    '. Photorealistic, professional photography, cinematic lighting. No text, letters or typography in the image.'

  const auth = { Authorization: 'Key ' + FAL_KEY }
  const submitRes = await fetch('https://queue.fal.run/fal-ai/flux-lora', {
    method: 'POST',
    headers: { ...auth, 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: fullPrompt, loras: [{ path: ch.loraUrl, scale: 1.0 }], image_size, num_images: 1, output_format: 'png' }),
  })
  const submit = await submitRes.json().catch(() => ({}))
  if (!submitRes.ok || !submit.request_id) throw new Error('fal submit feilet: ' + JSON.stringify(submit).slice(0, 200))
  const statusUrl = submit.status_url || 'https://queue.fal.run/fal-ai/flux-lora/requests/' + submit.request_id + '/status'
  const resultUrl = submit.response_url || 'https://queue.fal.run/fal-ai/flux-lora/requests/' + submit.request_id

  const deadline = Date.now() + 22_000
  let status = 'IN_QUEUE'
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 1500))
    const st = await fetch(statusUrl, { headers: auth }).then((r) => r.json()).catch(() => ({}))
    status = st.status || status
    if (status === 'COMPLETED') break
    if (status === 'FAILED' || status === 'ERROR') throw new Error('fal flux-lora ' + status)
  }
  if (status !== 'COMPLETED') throw new Error('fal flux-lora tidsavbrudd')

  const result = await fetch(resultUrl, { headers: auth }).then((r) => r.json())
  const url = result?.images?.[0]?.url || result?.data?.images?.[0]?.url
  if (!url) throw new Error('fal flux-lora: ingen bilde-URL')
  return Buffer.from(await (await fetch(url)).arrayBuffer())
}
