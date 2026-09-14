import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Instagram-publisering i to steg (server-side).
 *
 * Meta bruker 30-60 s paa aa prosessere en video, og Netlify kutter et
 * API-svar etter 26 s. Publish-ruta oppretter derfor bare containeren og
 * logger en rad i `publications` med status 'processing' -- container-id-en
 * laaner `post_id` til innlegget er ute. Fullfoeringen skjer her, EN
 * statussjekk per kall, fra klientens polling (GET /api/publish/instagram/
 * status) eller fra cronen (publish-scheduled). Samme moenster som ReelHome
 * (boligforge, commit 986af9a).
 */

export type FinishStatus = 'processing' | 'published' | 'failed'
export type FinishResult = { status: FinishStatus; postId?: string; error?: string }
export type PendingOutcome = FinishResult & { id: string; pageName: string | null }

// Hvor lenge en container faar staa som 'processing' foer vi gir opp. Meta
// bruker normalt under et minutt; en time betyr at noe har gaatt galt.
export const PROCESSING_MAX_MS = 60 * 60 * 1000

const GRAPH = 'https://graph.facebook.com/v21.0'

/** Sjekker containeren hos Meta EN gang og publiserer hvis den er ferdig. */
export async function finishInstagramContainer(
  igAccountId: string,
  accessToken: string,
  containerId: string
): Promise<FinishResult> {
  try {
    const statusRes = await fetch(
      `${GRAPH}/${containerId}?fields=status_code&access_token=${accessToken}`
    )
    const statusData = await statusRes.json()
    if (statusData.error) {
      return { status: 'failed', error: statusData.error.message ?? 'Could not read container status' }
    }
    const code: string = statusData.status_code ?? ''
    console.log('[instagram] Container', containerId, 'status:', code)
    if (code === 'ERROR' || code === 'EXPIRED') {
      return { status: 'failed', error: `Instagram processing failed: ${code}` }
    }
    if (code !== 'FINISHED') return { status: 'processing' }

    const publishRes = await fetch(`${GRAPH}/${igAccountId}/media_publish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ creation_id: containerId, access_token: accessToken }),
    })
    const publishData = await publishRes.json()
    if (!publishData.id) {
      console.error('[instagram] Publish failed:', publishData.error)
      return { status: 'failed', error: publishData.error?.message ?? 'Publish failed' }
    }
    console.log('[instagram] Published:', publishData.id)
    return { status: 'published', postId: publishData.id }
  } catch (err) {
    console.error('[instagram] Exception:', err)
    return { status: 'failed', error: String(err) }
  }
}

/**
 * Fullfoerer Instagram-rader som staar som 'processing'. Ingen venting her --
 * kalleren (klientens polling eller cronen) kommer tilbake. Rader som har
 * staatt for lenge markeres som feilet.
 */
export async function finishPendingPublications(
  supabase: SupabaseClient,
  filter: { userId?: string | null; ids?: string[] }
): Promise<PendingOutcome[]> {
  let query = supabase
    .from('publications')
    .select('id, user_id, connection_id, page_id, page_name, post_id, created_at')
    .eq('status', 'processing')
    .eq('platform', 'instagram')
  if (filter.userId) query = query.eq('user_id', filter.userId)
  if (filter.ids && filter.ids.length > 0) query = query.in('id', filter.ids)
  const { data: rows, error } = await query
  if (error) {
    console.error('[instagram] Could not load pending publications:', error.message)
    return []
  }

  const out: PendingOutcome[] = []
  for (const row of rows ?? []) {
    let res: FinishResult
    const conn = row.connection_id
      ? (await supabase
          .from('social_connections')
          .select('access_token, user_access_token')
          .eq('id', row.connection_id)
          .maybeSingle()).data
      : null
    const token = conn?.user_access_token || conn?.access_token
    if (!token || !row.post_id || !row.page_id) {
      res = { status: 'failed', error: 'The connected account no longer exists' }
    } else {
      res = await finishInstagramContainer(row.page_id, token, row.post_id)
    }
    if (res.status === 'processing' && Date.now() - new Date(row.created_at).getTime() > PROCESSING_MAX_MS) {
      res = { status: 'failed', error: 'Timeout: Instagram did not finish processing within an hour' }
    }
    if (res.status !== 'processing') {
      const { error: updErr } = await supabase
        .from('publications')
        .update({ status: res.status, post_id: res.postId ?? null, error: res.error ?? null })
        .eq('id', row.id)
      if (updErr) console.error('[instagram] Could not update publication:', updErr.message)
    }
    out.push({ id: row.id, pageName: row.page_name, ...res })
  }
  return out
}
