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
}

const FELT = 'id, owner_tenant_id, name, bio, photo_urls, sample_urls, preview_url, elevenlabs_voice_id, face_character_id, is_public, is_active, is_exclusive'

type Rad = {
  id: string; owner_tenant_id: string; name: string; bio: string | null
  photo_urls: unknown; sample_urls: unknown; preview_url: string | null
  elevenlabs_voice_id: string | null; face_character_id: string | null
  is_public: boolean; is_active: boolean; is_exclusive: boolean | null
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

function synligHer(a: Rad, chain: string[] | null): boolean {
  if (!a.is_public || !a.is_active) return false
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
    const rader = ((data || []) as Rad[]).filter((a) => synligHer(a, chain))
    const navn = await navnFor(rader.map((a) => a.owner_tenant_id))
    return rader.map((a) => tilPublic(a, navn, tenant.app_name))
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
    if (!synligHer(a, chain)) return null
    const navn = await navnFor([a.owner_tenant_id])
    return tilPublic(a, navn, tenant.app_name)
  } catch {
    return null
  }
}
