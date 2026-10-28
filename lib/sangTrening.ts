import { createClient } from '@supabase/supabase-js'
import { hentJobb, rvcErKonfigurert } from '@/lib/rvc'

// Fullføring av sangtreninger (127) — delt mellom cron-ruta for treninger
// (hvert tiende minutt) og skuespillerkortet (når adminen ser på det).
//
// Samme gang som ansiktsmodellene (121): når Replicate melder ferdig, flyttes
// modell-zipen til den private bøtta av en bakgrunnsfunksjon
// (sang-flytt-background), og først når kopien er bevist lik, blir modellen
// «ready». Replicate sletter utdataene etter en time — ingen modell skal peke
// på en adresse som forsvinner.
//
// Server-only.

function db() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || '', process.env.SUPABASE_SERVICE_ROLE_KEY || '')
}

// Zip-filer (datasett og modeller) i bøtta som alt tar imot zip og modellfiler;
// lyd (vokaler inn, prøver ut) i bøtta som alt tar imot lyd. Begge private.
export const ZIP_BOETTE = 'training-sets'
export const LYD_BOETTE = 'voice-recordings'
export const boetteFor = (sti: string) => (sti.endsWith('.zip') ? ZIP_BOETTE : LYD_BOETTE)
export const sangSti = {
  datasett: (actorId: string, stempel: string) => `sang/${actorId}/datasett-${stempel}.zip`,
  modell: (actorId: string, modellId: string) => `sang/${actorId}/modell-${modellId}.zip`,
  inn: (actorId: string, stempel: string, ext: string) => `sang/${actorId}/inn-${stempel}.${ext}`,
  proeve: (actorId: string, modellId: string, stempel: string) => `sang/${actorId}/proeve-${modellId}-${stempel}.mp3`,
}

/** Er stien en av våre sang-stier for nettopp denne skuespilleren? */
export function erSangSti(sti: unknown, actorId: string): sti is string {
  return typeof sti === 'string' && sti.startsWith(`sang/${actorId}/`) && !sti.includes('..') && sti.length < 300
}

type Rad = { id: string; actor_id: string; status: string; external_id: string | null; model_path: string | null; flytt_startet: string | null }

/** Be bakgrunnsfunksjonen flytte modellen. Ikke oftere enn hvert 20. minutt per rad. */
async function startFlytting(r: Rad) {
  if (r.flytt_startet && Date.now() - new Date(r.flytt_startet).getTime() < 20 * 60 * 1000) return false
  await db().from('singing_models').update({ flytt_startet: new Date().toISOString() }).eq('id', r.id).eq('status', 'training')
  const base = process.env.NEXT_PUBLIC_BASE_URL || 'https://twinledger.ai'
  await fetch(`${base}/.netlify/functions/sang-flytt-background`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-cron-secret': process.env.CRON_SECRET || '' },
    body: JSON.stringify({ modelId: r.id }),
  }).catch((e) => console.warn('[sang] flytting kunne ikke startes (neste tikk prøver):', e))
  return true
}

/**
 * Se over alle sangtreninger som pågår. Idempotent: en rad som alt er ferdig
 * eller feilet, røres ikke. Feiler åpent før 127 (tabellen finnes ikke).
 */
export async function fullfoerSangtreninger(opts: { actorId?: string } = {}): Promise<{ sjekket: number; ferdige: number; feilet: number; flyttes: number }> {
  const ut = { sjekket: 0, ferdige: 0, feilet: 0, flyttes: 0 }
  if (!rvcErKonfigurert()) return ut
  let q = db().from('singing_models').select('id, actor_id, status, external_id, model_path, flytt_startet').eq('status', 'training')
  if (opts.actorId) q = q.eq('actor_id', opts.actorId)
  const { data, error } = await q.limit(25)
  if (error || !data) return ut
  for (const r of data as Rad[]) {
    ut.sjekket++
    if (r.model_path) {
      // Kopien er bevist (bakgrunnsfunksjonen skriver stien bare da).
      await db().from('singing_models').update({ status: 'ready', last_error: null, updated_at: new Date().toISOString() })
        .eq('id', r.id).eq('status', 'training')
      ut.ferdige++
      continue
    }
    if (!r.external_id) continue
    try {
      const j = await hentJobb(r.external_id)
      if (j.status === 'feilet') {
        await db().from('singing_models').update({ status: 'failed', last_error: j.feil || 'Treningen feilet hos Replicate', updated_at: new Date().toISOString() })
          .eq('id', r.id).eq('status', 'training')
        ut.feilet++
      } else if (j.status === 'ferdig') {
        if (await startFlytting(r)) ut.flyttes++
      }
    } catch (e) {
      console.error('[sang] status feilet for', r.id, e instanceof Error ? e.message : e)
    }
  }
  return ut
}
