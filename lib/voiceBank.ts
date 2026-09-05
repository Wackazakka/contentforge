import { createClient } from '@supabase/supabase-js'

// Stemmebank: proff-klonede skuespillerstemmer eid av en tenant, tilgjengelige
// for hele tenant-treet under eieren. Hver bruk i en produksjon logges med
// skuespiller-sats (til skuespilleren) og kundepris (byråets cut = differansen).
// Kvantumsrabatt (discount_tiers) beregnes ved AVREGNING, ikke ved logging —
// enklere, og kampanjevolum telles samlet.

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
  )
}

export interface VoiceActor {
  id: string
  owner_tenant_id: string
  name: string
  elevenlabs_voice_id: string
  actor_rate_nok: number
  customer_price_nok: number
  // Takster per brukstype (video/avatar/radio …) — overstyrer standardsatsene
  rates?: Record<string, { actor_rate_nok: number; customer_price_nok: number }> | null
  discount_tiers: Array<{ from_uses: number; discount_pct: number }>
  preview_url: string | null
  is_active: boolean
  // Eksklusiv (default): kun eierens eget kundenett. Av = delt med hele plattformen.
  is_exclusive?: boolean
  // Kobling til skuespillerens ansikt (LoRA-karakter) — muliggjør /image i gatewayen
  face_character_id?: string | null
}

// Sats for en gitt brukstype: typens egen takst hvis satt, ellers standard
export function ratesForKind(actor: VoiceActor, kind?: string | null): { rate: number; price: number } {
  const o = kind && actor.rates ? actor.rates[kind] : null
  return {
    rate: Number(o?.actor_rate_nok ?? actor.actor_rate_nok),
    price: Number(o?.customer_price_nok ?? actor.customer_price_nok),
  }
}

// Tenant-kjeden oppover (egen tenant → root), maks 5 hopp
export async function tenantChainUp(tenantId: string): Promise<string[]> {
  const supabase = admin()
  const chain: string[] = []
  let cur: string | null = tenantId
  for (let i = 0; i < 5 && cur; i++) {
    chain.push(cur)
    const res: { data: { parent_tenant_id: string | null } | null } = await supabase
      .from('tenants').select('parent_tenant_id').eq('id', cur).single()
    cur = res.data?.parent_tenant_id ?? null
  }
  return chain
}

/**
 * Admin-tilgang til en tenants adminflater: kun tenantens egne admins og
 * admins i leddene OVER i treet (root ser alt; en tenant ser aldri oppover).
 * admin_emails er en jsonb-liste med e-poster på tenants-raden.
 */
export async function isTenantAdmin(email: string | null | undefined, tenantId: string): Promise<boolean> {
  try {
    if (!email) return false
    const chain = await tenantChainUp(tenantId)
    if (chain.length === 0) return false
    const { data } = await admin()
      .from('tenants')
      .select('id, admin_emails')
      .in('id', chain)
    const needle = email.trim().toLowerCase()
    return (data || []).some((t) =>
      Array.isArray(t.admin_emails) && t.admin_emails.some((e: unknown) => String(e).trim().toLowerCase() === needle)
    )
  } catch {
    return false
  }
}

// Stemmer tilgjengelige for en tenant = aktive stemmer eid av tenanten selv
// eller noen av dens forfedre (banken «arves» nedover i treet) — pluss
// IKKE-eksklusive stemmer fra resten av plattformen (eieren har valgt å dele).
export async function getAvailableVoiceActors(tenantId: string): Promise<VoiceActor[]> {
  try {
    const chain = await tenantChainUp(tenantId)
    if (chain.length === 0) return []
    const { data, error } = await admin()
      .from('voice_actors')
      .select('*')
      .eq('is_active', true)
      .or(`owner_tenant_id.in.(${chain.join(',')}),is_exclusive.eq.false,library_enabled.eq.true`)
      .order('name')
    if (!error) return (data || []) as VoiceActor[]
    // is_exclusive-kolonnen ikke kjørt ennå → fall tilbake til ren kjede-arv
    const { data: fallback } = await admin()
      .from('voice_actors')
      .select('*')
      .eq('is_active', true)
      .in('owner_tenant_id', chain)
      .order('name')
    return (fallback || []) as VoiceActor[]
  } catch {
    return []
  }
}

/**
 * Preview-royalty: når kunden EKSPERIMENTERER med en skuespillerstemme i
 * editoren (tester tekster), får skuespilleren en liten tegnbasert betaling —
 * på nivå med ElevenLabs' Voice Library-satser. Per 1000 tegn, forholdsmessig.
 * Kan overstyres per skuespiller via rates['preview'] (tolkes som per 1000 tegn).
 */
export const PREVIEW_ROYALTY_PER_1000 = { actor: 0.35, customer: 0.7 }

// INFRASTRUKTURAVGIFTEN (Lars 2026-07-29): CenterForge tar 3 % av brutto
// aktiva-omsetning (stemme + ansikt, alle kinds) i ALLE ledd — betaling for
// rettighetshåndtering, logging og utbetaling. Ikke forhandlingsbar.
// I tillegg kan mellomledd sette en LISENSAVGIFT per partner
// (tenants.license_fee_pct, redigeres av forelderen i Partnere-adminen).
// ERSTATTER to-sats-marginmodellen (fee_direct/indirect ligger sovende).
export const PLATFORM_RIGHTS_FEE_PCT = 3

// ABONNEMENTSDEKNING (Lars 2026-08-06): en proff-klone ligger på skuespillerens
// EGEN ElevenLabs-konto, og kontoen må etter alt å dømme bli værende på Creator
// for at delingen til oss skal fortsette å virke. VoiceBank dekker det sentralt
// for ALLE skuespillere — også partnernes — fordi konsekvensen av en glemt
// fornyelse ikke er en ubetalt faktura, men produksjonsstans hos en kunde.
// Fast i KRONER, ikke dollar: $22 ≈ 220 kr, justeres årlig i stedet for at noen
// skal følge valutakursen hver måned. Partnere faktureres en forvaltningsavgift
// per aktiv skuespiller (avtaleforhold, ikke gjennomstrømming).
// ⚠️ Dette er en kostnad UTEN inntekt bak — en skuespiller som aldri blir valgt
// koster 2 640 kr i året. Derfor er summen synlig i stemmebank-adminen.
// Én måned ElevenLabs Creator (USD 22) — det klonen trenger for å kunne DELES.
// ENGANGSKOSTNAD ved onboarding, ikke løpende: delingen overlever at eieren
// nedgraderer til gratis etterpå (bekreftet av ElevenLabs 03.09.2026).
export const ACTOR_SUBSCRIPTION_NOK = 220

// Aktivum-modellen (2026-07-29): én bankrad = én forvaltningsavtale — stemme,
// ansikt eller begge. Avledes, ingen egen kolonne.
export function actorHasVoice(a: { elevenlabs_voice_id?: string | null }): boolean {
  return !!(a.elevenlabs_voice_id && String(a.elevenlabs_voice_id).trim())
}
export function actorHasFace(a: { face_character_id?: string | null }): boolean {
  return !!(a.face_character_id && String(a.face_character_id).trim())
}

// Ansiktsbanken bruker NØYAKTIG samme tilgjengelighetslås som stemmene
// (kjede-arv + eksklusivitet + Voice Library) — getAvailableVoiceActors er
// aktivum-agnostisk, vi filtrerer bare på at raden har et ansikt.
export async function getAvailableFaceActors(tenantId: string): Promise<VoiceActor[]> {
  const actors = await getAvailableVoiceActors(tenantId)
  return actors.filter((a) => actorHasFace(a as { face_character_id?: string | null }))
}

export async function logPreviewRoyalty(e: {
  elevenlabsVoiceId?: string | null
  usedByTenantId?: string | null
  organizationId?: string | null
  chars: number
  draftId?: string | null
  meta?: Record<string, unknown>
}): Promise<{ actorNok: number; customerNok: number } | null> {
  try {
    if (!e.elevenlabsVoiceId || !e.usedByTenantId || !(e.chars > 0)) return null
    const actors = await getAvailableVoiceActors(e.usedByTenantId)
    const actor = actors.find((a) => a.elevenlabs_voice_id === e.elevenlabsVoiceId)
    if (!actor) return null
    const o = actor.rates?.preview
    const perActor = Number(o?.actor_rate_nok ?? PREVIEW_ROYALTY_PER_1000.actor)
    const perCustomer = Number(o?.customer_price_nok ?? PREVIEW_ROYALTY_PER_1000.customer)
    const actorNok = Math.max(0.01, Math.round((e.chars / 1000) * perActor * 100) / 100)
    const customerNok = Math.max(0.02, Math.round((e.chars / 1000) * perCustomer * 100) / 100)
    await admin().from('voice_usage_events').insert({
      actor_id: actor.id,
      used_by_tenant_id: e.usedByTenantId,
      organization_id: e.organizationId ?? null,
      draft_id: e.draftId ?? null,
      actor_rate_nok: actorNok,
      customer_price_nok: customerNok,
      asset_type: 'voice',
      meta: { kind: 'preview', chars: e.chars, ...(e.meta ?? {}) },
    })
    return { actorNok, customerNok }
  } catch {
    return null
  }
}

/**
 * Logg bruk av en skuespillers ANSIKT (Flux LoRA-karakter) i en produksjon.
 * Kobling: voice_actors.face_character_id → user_characters.id. Takst =
 * 'face'-taksten hvis satt, ellers standardsatsene. Samme hovedbok som
 * stemmen, skilt med asset_type='face'. Feiler stille.
 */
export async function logFaceUsage(e: {
  characterId?: string | null
  usedByTenantId?: string | null
  organizationId?: string | null
  productId?: string | null
  draftId?: string | null
  jobId?: string | null
}): Promise<void> {
  try {
    if (!e.characterId || !e.usedByTenantId) return
    // Samme tilgjengelighetslogikk som stemmer: kjede + delt + library —
    // delte/library-ansikter blir dermed fakturerbare også utenfor eierkjeden
    const available = await getAvailableFaceActors(e.usedByTenantId)
    const actor = available.find((a) => (a as { face_character_id?: string | null }).face_character_id === e.characterId) as VoiceActor | undefined
    if (!actor) return
    const { rate, price } = ratesForKind(actor, 'face')
    await admin().from('voice_usage_events').insert({
      actor_id: actor.id,
      used_by_tenant_id: e.usedByTenantId,
      // Kunden fryses PÅ raden. product_id alene duger ikke: slettes produktet,
      // ryker sporet til hvem som betalte, mens beløpene blir stående.
      organization_id: e.organizationId ?? null,
      product_id: e.productId ?? null,
      draft_id: e.draftId ?? null,
      job_id: e.jobId ?? null,
      actor_rate_nok: rate,
      customer_price_nok: price,
      asset_type: 'face',
      meta: { kind: 'face' },
    })
    console.log(`[voiceBank] Ansikts-royalty: ${actor.name} brukt av tenant ${e.usedByTenantId}`)
  } catch (err) {
    console.warn('[voiceBank] ansikts-logging feilet (ignoreres):', err)
  }
}

/**
 * Logg bruk av en skuespillerstemme i en produksjon (royalty-hendelse).
 * Kalles ved produksjonsstart med ElevenLabs-voice-id-en produksjonen bruker;
 * gjør ingenting hvis stemmen ikke er en registrert skuespiller. Feiler stille.
 */
export async function logVoiceUsage(e: {
  elevenlabsVoiceId?: string | null
  usedByTenantId?: string | null
  organizationId?: string | null
  productId?: string | null
  draftId?: string | null
  jobId?: string | null
  meta?: Record<string, unknown>
}): Promise<void> {
  try {
    if (!e.elevenlabsVoiceId || !e.usedByTenantId) return
    const actors = await getAvailableVoiceActors(e.usedByTenantId)
    const actor = actors.find((a) => a.elevenlabs_voice_id === e.elevenlabsVoiceId)
    if (!actor) return
    // Takst etter brukstype (meta.kind) — fryses på raden
    const { rate, price } = ratesForKind(actor, typeof e.meta?.kind === 'string' ? e.meta.kind : null)
    await admin().from('voice_usage_events').insert({
      actor_id: actor.id,
      used_by_tenant_id: e.usedByTenantId,
      // Kunden fryses PÅ raden. product_id alene duger ikke: slettes produktet,
      // ryker sporet til hvem som betalte, mens beløpene blir stående.
      organization_id: e.organizationId ?? null,
      product_id: e.productId ?? null,
      draft_id: e.draftId ?? null,
      job_id: e.jobId ?? null,
      actor_rate_nok: rate,
      customer_price_nok: price,
      meta: e.meta ?? {},
    })
    console.log(`[voiceBank] Royalty-hendelse: ${actor.name} brukt av tenant ${e.usedByTenantId}`)
  } catch (err) {
    console.warn('[voiceBank] logging feilet (ignoreres):', err)
  }
}
