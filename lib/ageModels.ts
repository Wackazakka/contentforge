import { createClient } from '@supabase/supabase-js'
import type { AldersmodellValg } from '@/lib/aldersvalg'

// Aldersmodellene som faktisk KAN genereres med (082/113). Ett oppslag for
// alle genereringsveiene — gatewayen, produksjonene og audition — så de ikke
// kan være uenige om hvilke som er åpne.
//
// Brukbar = alle fire porter åpne:
//   · aldersmodellen er aktiv og ikke standardraden,
//   · kilden er KLARERT (source_cleared er en port, 082 — uklarerte skal ikke
//     kunne selges, og en lisens dekker dem aldri),
//   · modellen er ferdig trent og ikke stengt (av-bryteren, 088),
//   · hun har GODKJENT den, eller den krever ikke godkjenning (091).
//
// Feiler stille til tom liste: da genereres det med standardansiktet, og en
// kunde som ba om en alder får beskjed om at den ikke finnes — aldri en annen
// alder i stillhet.

function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || '', process.env.SUPABASE_SERVICE_ROLE_KEY || '')
}

export async function brukbareAldersmodeller(actorIds: string[]): Promise<AldersmodellValg[]> {
  if (actorIds.length === 0) return []
  try {
    const db = admin()
    const { data: rader } = await db.from('actor_face_models')
      .select('id, actor_id, character_id, label, age_from, age_to')
      .in('actor_id', actorIds).eq('is_active', true).eq('is_default', false).eq('source_cleared', true)
    const liste = (rader || []) as Array<{ id: string; actor_id: string; character_id: string; label: string; age_from: number | null; age_to: number | null }>
    if (liste.length === 0) return []
    const { data: kar } = await db.from('user_characters')
      .select('id, status, lora_url, withdrawn_at, approval_status')
      .in('id', liste.map((r) => r.character_id))
    const aapne = new Set(((kar || []) as Array<{ id: string; status: string; lora_url: string | null; withdrawn_at: string | null; approval_status: string | null }>)
      .filter((k) => k.status === 'ready' && k.lora_url && !k.withdrawn_at && k.approval_status !== 'pending' && k.approval_status !== 'rejected')
      .map((k) => k.id))
    return liste.filter((r) => aapne.has(String(r.character_id))).map((r) => ({
      id: r.id, actorId: String(r.actor_id), characterId: String(r.character_id),
      label: r.label, ageFrom: r.age_from, ageTo: r.age_to,
    }))
  } catch {
    return []
  }
}
