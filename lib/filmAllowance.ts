import { createClient } from '@supabase/supabase-js'

// Omgjøringer (Lars 4/9 + 5/9): hver betalte film gir TRE gratis
// omgjøringer av samme anledning. Er den betalte filmen ANIMERT, følger det
// i tillegg 16 nye animasjoner (Kling-klipp) med (Lars 5/9: hevet fra 12 saa én hel omgjoering faar plass) — uendrede plakater koster
// ingen, fordi dropleten gjenbruker klipp fra klipp-lageret.
//
// Blokk = en betalt film (meta.paid) og filmene etter den, frem til neste
// betalte. Første film for et produkt starter også en blokk (åpningsperiode
// uten betaling). Tellingen er usage_events 'film_production' for produktet,
// logget ved jobbstart i startProductionForDraft. Feilede renders
// (production_jobs.status = failed) teller ikke.

export const FREE_REMAKES = 3
export const ANIM_QUOTA = 16

export interface FilmAllowance {
  total: number            // filmer i alt (uten feilede)
  hasBlock: boolean        // finnes det en betalt/åpnings-film å gjøre om?
  remakesUsed: number      // omgjøringer siden blokkstart
  remakesLeft: number
  nextIsFree: boolean      // neste film er en gratis omgjøring
  blockAnimated: boolean   // var den betalte filmen animert?
  animUsed: number         // nye animasjoner brukt i blokken
  animLeft: number         // 12 − brukt (0 hvis blokken ikke er animert)
}

interface EventRow { id: string; created_at: string; meta: { jobId?: string; paid?: boolean; remake?: boolean; animated?: boolean; newClips?: number } | null }

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  )
}

export async function getFilmAllowance(productId: string): Promise<FilmAllowance> {
  const sb = admin()
  const { data } = await sb
    .from('usage_events')
    .select('id, created_at, meta')
    .eq('product_id', productId)
    .eq('event_type', 'film_production')
    .order('created_at', { ascending: true })
  let rows = (data || []) as EventRow[]
  if (rows.length > 0) {
    const jobIds = rows.map((r) => r.meta?.jobId).filter((j): j is string => !!j)
    if (jobIds.length > 0) {
      const { data: jobs } = await sb.from('production_jobs').select('id, status').in('id', jobIds)
      const failed = new Set((jobs || []).filter((j: { status: string }) => j.status === 'failed').map((j: { id: string }) => j.id))
      rows = rows.filter((r) => !(r.meta?.jobId && failed.has(r.meta.jobId)))
    }
  }
  const empty: FilmAllowance = { total: rows.length, hasBlock: false, remakesUsed: 0, remakesLeft: 0, nextIsFree: false, blockAnimated: false, animUsed: 0, animLeft: 0 }
  if (rows.length === 0) return empty
  // Blokkstart = siste betalte film; finnes ingen betalt, er første film starten
  let start = 0
  rows.forEach((r, i) => { if (r.meta?.paid === true) start = i })
  const block = rows[start]
  const after = rows.slice(start + 1)
  const blockAnimated = block.meta?.animated === true
  const animUsed = after.reduce((s, r) => s + (Number(r.meta?.newClips) || 0), 0)
  const remakesUsed = after.length
  return {
    total: rows.length,
    hasBlock: true,
    remakesUsed,
    remakesLeft: Math.max(0, FREE_REMAKES - remakesUsed),
    nextIsFree: remakesUsed < FREE_REMAKES,
    blockAnimated,
    animUsed,
    animLeft: blockAnimated ? Math.max(0, ANIM_QUOTA - animUsed) : 0,
  }
}

// Bakoverkompatible hjelpere (production.ts)
export async function filmCountForProduct(productId: string): Promise<number> {
  return (await getFilmAllowance(productId)).total
}
export async function nextFilmIsFreeRemake(productId: string): Promise<boolean> {
  return (await getFilmAllowance(productId)).nextIsFree
}
