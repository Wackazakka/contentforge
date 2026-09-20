import { createClient } from '@supabase/supabase-js'
import type { Tenant } from '@/lib/tenantServer'

// Det OFFENTLIGE utsnittet av stemme- og ansiktsbanken: det en som ikke er
// kunde får se. Én kilde for både galleriet (/stemmer) og visittkortet
// (/stemme/[id]), så de to aldri kan være uenige om hvem som er synlig.
//
// Synlig = publisert (is_public) OG aktiv OG tilgjengelig på dette domenet:
// eid av tenanten selv eller et ledd over (banken arves nedover), eller delt
// med hele plattformen (is_exclusive = false). Et byrå ser altså sine egne og
// forvalterens — aldri et annet byrås eksklusive.
//
// EKSEMPELPROFILER (is_demo) er unntaket: de står KUN i våre egne dører
// (twinledger + rota), aldri hos en partner. En partner selger i sin egen
// drakt, og skal ikke ha vårt demomateriale stående som om det var deres
// portefølje. Flagget følger raden ut hit slik at hver flate kan merke den —
// et kort som ser ut som en ekte bookbar person, på en side som lover ekte
// mennesker, er nøyaktig det vi ikke skal lage.
//
// Hva som ALDRI sendes ut herfra: satser, kundepriser, e-post, ElevenLabs-id,
// LoRA-id. Bare det skuespilleren selv har valgt å vise fram.
//
// Server-only: importerer service-nøkkelen.

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
  )
}

export interface PublicActor {
  id: string
  name: string
  bio: string | null
  photos: string[]
  samples: string[]
  hasVoice: boolean
  hasFace: boolean
  managedBy: string
  isDemo: boolean
}

const FELT = 'id, owner_tenant_id, name, bio, photo_urls, sample_urls, preview_url, elevenlabs_voice_id, face_character_id, is_public, is_active, is_exclusive, is_demo'

type Rad = {
  id: string; owner_tenant_id: string; name: string; bio: string | null
  photo_urls: unknown; sample_urls: unknown; preview_url: string | null
  elevenlabs_voice_id: string | null; face_character_id: string | null
  is_public: boolean; is_active: boolean; is_exclusive: boolean | null
  is_demo: boolean | null
}

async function kjedeOpp(tenantId: string): Promise<string[]> {
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

function tilPublic(a: Rad, tenantNames: Map<string, string>, fallbackName: string): PublicActor {
  const photos = Array.isArray(a.photo_urls) ? (a.photo_urls as unknown[]).map(String) : []
  const egne = Array.isArray(a.sample_urls) ? (a.sample_urls as unknown[]).map(String) : []
  return {
    id: a.id,
    name: a.name,
    bio: a.bio,
    photos,
    samples: egne.length > 0 ? egne : (a.preview_url ? [a.preview_url] : []),
    hasVoice: !!(a.elevenlabs_voice_id && String(a.elevenlabs_voice_id).trim()),
    hasFace: !!(a.face_character_id && String(a.face_character_id).trim()),
    managedBy: tenantNames.get(a.owner_tenant_id) ?? fallbackName,
    isDemo: a.is_demo === true,
  }
}

async function navnFor(ids: string[]): Promise<Map<string, string>> {
  const m = new Map<string, string>()
  const unike = [...new Set(ids.filter(Boolean))]
  if (unike.length === 0) return m
  const { data } = await admin().from('tenants').select('id, app_name, name').in('id', unike)
  for (const t of data || []) m.set(t.id as string, (t.app_name || t.name || '') as string)
  return m
}

// Våre egne dører: TwinLedgers eget domene og rota. ROOT_TENANT har slug
// 'centerforge', så begge formene av rota dekkes av sluggen alene — samme
// avgrensning som produktsiden i app/twinledger/page.tsx bruker.
function erEgenDor(tenant: Tenant): boolean {
  return tenant.slug === 'twinledger' || tenant.slug === 'centerforge'
}

function synligHer(a: Rad, chain: string[] | null, egenDor: boolean): boolean {
  if (!a.is_public || !a.is_active) return false
  if (a.is_demo === true && !egenDor) return false
  if (chain === null) return true // rot-domenet ser på tvers
  return chain.includes(a.owner_tenant_id) || a.is_exclusive === false
}

export async function getPublicActors(tenant: Tenant): Promise<PublicActor[]> {
  try {
    const { data } = await admin()
      .from('voice_actors').select(FELT)
      .eq('is_public', true).eq('is_active', true)
      .order('name')
    const chain = tenant.id === 'root' ? null : await kjedeOpp(tenant.id)
    const egenDor = erEgenDor(tenant)
    const rader = ((data || []) as Rad[]).filter((a) => synligHer(a, chain, egenDor))
    const navn = await navnFor(rader.map((a) => a.owner_tenant_id))
    return rader
      .map((a) => tilPublic(a, navn, tenant.app_name))
      // Eksempler sist: så snart én ekte rettighetshaver er publisert, skal
      // hen stå først i hylla — uten at noen må huske å rydde.
      .sort((a, b) => Number(a.isDemo) - Number(b.isDemo))
  } catch {
    return []
  }
}

export async function getPublicActor(tenant: Tenant, actorId: string): Promise<PublicActor | null> {
  try {
    const { data } = await admin().from('voice_actors').select(FELT).eq('id', actorId).single()
    const a = data as Rad | null
    if (!a) return null
    const chain = tenant.id === 'root' ? null : await kjedeOpp(tenant.id)
    if (!synligHer(a, chain, erEgenDor(tenant))) return null
    const navn = await navnFor([a.owner_tenant_id])
    return tilPublic(a, navn, tenant.app_name)
  } catch {
    return null
  }
}
