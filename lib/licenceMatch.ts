import { createClient } from '@supabase/supabase-js'
import { dekkerPerioden } from '@/lib/licenceMath'

// Hvilken lisens hjemler denne genereringen?
//
// Dette er leddet som gjør hovedboken til et KLARERINGSREGISTER i stedet for
// en forbruksmåler: hvert genererte aktivum peker på avtalen som ga lov, og
// «var dette autorisert?» blir et oppslag i stedet for en gjetning.
//
// 🔑 Konservativ med vilje. Er det tvil om hvilken lisens som gjelder, lenkes
// ingen. En rad uten hjemmel er et ærlig hull man kan lete opp; en rad med
// FEIL hjemmel er en påstand om at noe var klarert da det ikke var det — og
// det er den ene feilen et proveniensprodukt ikke har råd til.
//
// Egen modul, uten import fra lib/voiceBank: voiceBank kaller hit, og
// lib/licences kaller voiceBank. Uten skillet blir det en importsirkel.

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
  )
}

/** Hvorfor raden fikk (eller ikke fikk) en hjemmel. Lagres i meta, så hullene kan revideres. */
export type LisensTreff = 'explicit' | 'inferred' | 'none' | 'ambiguous' | 'no_customer'

export interface LisensKobling {
  licenceId: string | null
  match: LisensTreff
}

/**
 * Finn hjemmelen for én generering.
 *
 * 1. Et eksplisitt valg vinner alltid — men valideres mot skuespilleren, så
 *    en klient ikke kan feste bruk til en fremmed avtale.
 * 2. Uten kunde kan bruken ikke tilskrives noen avtale.
 * 3. Ellers: aktive lisenser på denne skuespilleren, for denne kunden, som
 *    dekker aktivumet og gjelder i dag. Nøyaktig én → lenk. Flere → la være.
 */
export async function finnLisensFor(e: {
  actorId: string
  organizationId?: string | null
  /** 'voice' | 'face' — 'both'-lisenser dekker begge. */
  assetType?: string | null
  licenceId?: string | null
  at?: Date
}): Promise<LisensKobling> {
  try {
    const supabase = admin()

    if (e.licenceId) {
      const { data } = await supabase
        .from('licences').select('id, actor_id, status')
        .eq('id', e.licenceId).maybeSingle()
      const ok = data && data.actor_id === e.actorId && data.status === 'active'
      return ok ? { licenceId: e.licenceId, match: 'explicit' } : { licenceId: null, match: 'none' }
    }

    if (!e.organizationId) return { licenceId: null, match: 'no_customer' }

    const dag = (e.at ?? new Date()).toISOString().slice(0, 10)
    const dekker = e.assetType === 'face' ? ['face', 'both'] : ['voice', 'both']

    const { data } = await supabase
      .from('licences')
      .select('id, term_start, term_end')
      .eq('actor_id', e.actorId)
      .eq('organization_id', e.organizationId)
      .eq('status', 'active')
      .in('asset_type', dekker)

    // Perioden filtreres i koden, ikke i spørringen: null betyr «ingen grense»
    // i begge ender, og det uttrykkes tungt i PostgREST.
    const gyldige = (data || []).filter((l) =>
      dekkerPerioden(l.term_start as string | null, l.term_end as string | null, dag)
    )

    if (gyldige.length === 1) return { licenceId: gyldige[0].id as string, match: 'inferred' }
    if (gyldige.length > 1) return { licenceId: null, match: 'ambiguous' }
    return { licenceId: null, match: 'none' }
  } catch {
    // Hjemmelsoppslaget skal ALDRI stoppe en logging. En rad uten hjemmel er
    // langt bedre enn ingen rad — da forsvinner både royaltyen og sporet.
    return { licenceId: null, match: 'none' }
  }
}
