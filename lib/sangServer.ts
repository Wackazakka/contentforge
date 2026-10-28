import { createClient } from '@supabase/supabase-js'
import { hentJobb } from '@/lib/rvc'
import { boetteFor, sangSti, fullfoerSangtreninger } from '@/lib/sangTrening'

// Sangmodellene sett utenfra (127): det skuespillerkortet og /min-stemme viser,
// og prøvene som fullføres når noen ser på dem.
//
// Server-only.

function db() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || '', process.env.SUPABASE_SERVICE_ROLE_KEY || '')
}

export const MODELL_FELTER = 'id, actor_id, status, source, source_note, declaration, declared_by, declared_at, training_seconds, model_path, model_bytes, last_error, sample_input_path, sample_job_id, sample_path, approval_status, approved_at, approved_by, created_at, provider_version'

export type ModellRad = {
  id: string; actor_id: string; status: string; source: string; source_note: string | null
  declaration: string; declared_by: string; declared_at: string; training_seconds: number | null
  model_path: string | null; model_bytes: number | null; last_error: string | null
  sample_input_path: string | null; sample_job_id: string | null; sample_path: string | null
  approval_status: string; approved_at: string | null; approved_by: string | null; created_at: string
  provider_version: string | null
}

/** «sb://<bøtte>/<sti>» → signert lenke. */
export async function signerLagret(lagret: string, sekunder: number): Promise<string> {
  const m = /^sb:\/\/([^/]+)\/(.+)$/.exec(lagret)
  if (!m) throw new Error('Ukjent lagringssti')
  const { data, error } = await db().storage.from(m[1]).createSignedUrl(m[2], sekunder)
  if (error || !data?.signedUrl) throw new Error(`Kunne ikke signere (${error?.message || 'ingen lenke'})`)
  return data.signedUrl
}

export async function signerSti(sti: string, sekunder: number): Promise<string> {
  return signerLagret(`sb://${boetteFor(sti)}/${sti}`, sekunder)
}

/**
 * Hent prøven fra Replicate hvis den er ferdig, og legg den i bøtta.
 * Prøven er en mp3 på noen få MB — den flyttes her, i kallet, ikke i bakgrunnen.
 */
async function fullfoerProeve(m: ModellRad): Promise<ModellRad> {
  if (!m.sample_job_id || m.sample_path) return m
  try {
    const j = await hentJobb(m.sample_job_id)
    if (j.status === 'feilet') {
      await db().from('singing_models').update({ sample_job_id: null, last_error: `Prøven feilet: ${j.feil || 'ukjent'}`, updated_at: new Date().toISOString() }).eq('id', m.id)
      return { ...m, sample_job_id: null, last_error: `Prøven feilet: ${j.feil || 'ukjent'}` }
    }
    if (j.status !== 'ferdig' || !j.utdata) return m
    const r = await fetch(j.utdata)
    if (!r.ok) throw new Error(`nedlasting ${r.status}`)
    const buf = Buffer.from(await r.arrayBuffer())
    const sti = sangSti.proeve(m.actor_id, m.id, String(Date.now()))
    const { error } = await db().storage.from(boetteFor(sti)).upload(sti, buf, { contentType: 'audio/mpeg', upsert: true })
    if (error) throw new Error(`opplasting: ${error.message}`)
    await db().from('singing_models').update({ sample_path: sti, sample_job_id: null, last_error: null, updated_at: new Date().toISOString() })
      .eq('id', m.id).eq('sample_job_id', m.sample_job_id)
    return { ...m, sample_path: sti, sample_job_id: null, last_error: null }
  } catch (e) {
    console.error('[sang] prøven kunne ikke hentes:', e instanceof Error ? e.message : e)
    return m
  }
}

export interface ModellVisning {
  id: string; status: string; source: string; sourceNote: string | null
  declaration: string; declaredBy: string; declaredAt: string
  trainingSeconds: number | null; modelBytes: number | null; lastError: string | null
  sample: 'none' | 'running' | 'ready'; sampleUrl: string | null
  approval: string; approvedAt: string | null; createdAt: string; active: boolean
}

/** Modellene til én artist, nyeste først, med prøvene fullført og signert. */
export async function modellerFor(actorId: string, aktivId: string | null): Promise<ModellVisning[] | null> {
  await fullfoerSangtreninger({ actorId }).catch(() => undefined)
  const { data, error } = await db().from('singing_models').select(MODELL_FELTER)
    .eq('actor_id', actorId).order('created_at', { ascending: false }).limit(10)
  if (error) return null
  const ut: ModellVisning[] = []
  for (const r0 of (data || []) as ModellRad[]) {
    const r = await fullfoerProeve(r0)
    ut.push({
      id: r.id, status: r.status, source: r.source, sourceNote: r.source_note,
      declaration: r.declaration, declaredBy: r.declared_by, declaredAt: r.declared_at,
      trainingSeconds: r.training_seconds != null ? Number(r.training_seconds) : null,
      modelBytes: r.model_bytes != null ? Number(r.model_bytes) : null, lastError: r.last_error,
      sample: r.sample_path ? 'ready' : r.sample_job_id ? 'running' : 'none',
      sampleUrl: r.sample_path ? await signerSti(r.sample_path, 600).catch(() => null) : null,
      approval: r.approval_status, approvedAt: r.approved_at, createdAt: r.created_at,
      active: r.id === aktivId,
    })
  }
  return ut
}
