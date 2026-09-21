import { createClient } from '@supabase/supabase-js'
import type { Tenant } from '@/lib/tenantServer'
import { offentligeAttributter } from '@/lib/castingAttributes'

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
// CASTINGFELTENE (083) foelger med ut hit, saa en produsent som ikke er kunde
// kan SOEKE i katalogen og ikke bare bla i den. To grenser:
//
//   · SPILLEOMRAADE (art. 9) sendes IKKE ut. Samtykket vi har innhentet
//     gjelder casting, og et innlogget castingverktoey ER casting -- en aapen
//     nettside er publisering. Se OFFENTLIGE_FASETTER i castingAttributes.
//   · Aldersmodellenes spenn foelger med, men bare fra modeller med
//     `source_cleared`: den kolonnen er en port (082), ikke et notat.
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
  videos: string[]
  hasVoice: boolean
  hasFace: boolean
  managedBy: string
  isDemo: boolean
  // Castingfeltene. `attributes` er allerede renset for art. 9 her.
  gender: string | null
  playingAgeFrom: number | null
  playingAgeTo: number | null
  heightCm: number | null
  attributes: Record<string, string[]>
  modelAges: Array<{ from: number | null; to: number | null }>
}

const FELT = 'id, owner_tenant_id, name, bio, photo_urls, sample_urls, video_urls, preview_url, elevenlabs_voice_id, face_character_id, is_public, is_active, is_exclusive, is_demo, gender, playing_age_from, playing_age_to, height_cm, attributes'

type Rad = {
  id: string; owner_tenant_id: string; name: string; bio: string | null
  photo_urls: unknown; sample_urls: unknown; video_urls: unknown; preview_url: string | null
  elevenlabs_voice_id: string | null; face_character_id: string | null
  is_public: boolean; is_active: boolean; is_exclusive: boolean | null
  is_demo: boolean | null
  gender: string | null; playing_age_from: number | null; playing_age_to: number | null
  height_cm: number | null; attributes: Record<string, string[]> | null
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

function tilPublic(
  a: Rad,
  tenantNames: Map<string, string>,
  fallbackName: string,
  modellAlder?: Map<string, Array<{ from: number | null; to: number | null }>>
): PublicActor {
  const photos = Array.isArray(a.photo_urls) ? (a.photo_urls as unknown[]).map(String) : []
  const egne = Array.isArray(a.sample_urls) ? (a.sample_urls as unknown[]).map(String) : []
  return {
    id: a.id,
    name: a.name,
    bio: a.bio,
    photos,
    samples: egne.length > 0 ? egne : (a.preview_url ? [a.preview_url] : []),
    // Film veier tyngst for en regissoer: stillbilder sier ingenting om
    // hvordan ansiktet oppfoerer seg i bevegelse.
    videos: Array.isArray(a.video_urls) ? (a.video_urls as unknown[]).map(String) : [],
    hasVoice: !!(a.elevenlabs_voice_id && String(a.elevenlabs_voice_id).trim()),
    hasFace: !!(a.face_character_id && String(a.face_character_id).trim()),
    managedBy: tenantNames.get(a.owner_tenant_id) ?? fallbackName,
    isDemo: a.is_demo === true,
    gender: a.gender ?? null,
    playingAgeFrom: a.playing_age_from ?? null,
    playingAgeTo: a.playing_age_to ?? null,
    heightCm: a.height_cm ?? null,
    attributes: offentligeAttributter(a.attributes),
    modelAges: modellAlder?.get(a.id) ?? [],
  }
}

/**
 * Aldersspenn fra klarerte ansiktsmodeller (082), per skuespiller.
 *
 * BEVISST TOLERANT: modellene beriker filteret, de bærer det ikke. Feiler
 * spørringen, skal katalogen fortsatt komme opp — en besøkende som ikke ser
 * noen i det hele tatt er langt verre enn en som ikke ser aldersmodell-merket.
 */
async function modellAlderFor(ids: string[]): Promise<Map<string, Array<{ from: number | null; to: number | null }>>> {
  const m = new Map<string, Array<{ from: number | null; to: number | null }>>()
  if (ids.length === 0) return m
  try {
    const { data, error } = await admin().from('actor_face_models')
      .select('actor_id, age_from, age_to, source_cleared').in('actor_id', ids)
    if (error) { console.warn('[publicActors] aldersmodeller utilgjengelig:', error.message); return m }
    for (const r of data || []) {
      if (r.source_cleared !== true) continue
      if (r.age_from == null && r.age_to == null) continue
      const liste = m.get(String(r.actor_id)) || []
      liste.push({ from: r.age_from ?? null, to: r.age_to ?? null })
      m.set(String(r.actor_id), liste)
    }
  } catch { /* se over: berikelse, ikke krav */ }
  return m
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
    const { trukketTilbake } = await import('@/lib/faceWithdrawal')
    const [navn, modeller, stengte] = await Promise.all([
      navnFor(rader.map((a) => a.owner_tenant_id)),
      modellAlderFor(rader.map((a) => a.id)),
      trukketTilbake(rader.map((a) => a.face_character_id)),
    ])
    return rader
      // Har hen trukket ansiktet tilbake, skal katalogen ikke love et ansikt.
      // Stemmen kan stå — det er to ulike rettigheter, og hen kan ha sagt nei
      // til den ene og ja til den andre.
      .map((a) => tilPublic(
        a.face_character_id && stengte.has(a.face_character_id) ? { ...a, face_character_id: null } : a,
        navn, tenant.app_name, modeller
      ))
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
    const { trukketTilbake } = await import('@/lib/faceWithdrawal')
    const [navn, modeller, stengte] = await Promise.all([
      navnFor([a.owner_tenant_id]),
      modellAlderFor([a.id]),
      trukketTilbake([a.face_character_id]),
    ])
    // Samme regel som i galleriet: trukket ansikt skal ikke loves på kortet.
    const rad = a.face_character_id && stengte.has(a.face_character_id) ? { ...a, face_character_id: null } : a
    return tilPublic(rad, navn, tenant.app_name, modeller)
  } catch {
    return null
  }
}
