import { timingSafeEqual } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { flyttFil } from '../../lib/loraFlytt.mjs'

// Netlify Background Function (navnet slutter på -background → opptil 15 min, svarer 202).
//
// Flytter modell-zipen fra en ferdig sangtrening hos Replicate til den private
// bøtta (127). Samme mønster som lora-flytt-background: Replicate sletter
// utdataene etter en time, og zipen kan være større enn en vanlig funksjon
// rekker å hente og skrive.
//
// 🔑 ADRESSEN HENTES HER, IKKE FRA KROPPEN. Kroppen bærer bare modell-id-en;
// Replicate-resultatet slås opp med radens egen jobb-id. En forfalsket
// forespørsel kan dermed ikke få oss til å lagre en fremmed fil som modell.

// Samme bøtte som datasettene: den tar alt imot zip og modellfiler (lib/sangTrening).
const BOETTE = 'training-sets'

export default async function handler(req) {
  const secret = process.env.CRON_SECRET || ''
  const gitt = req.headers.get('x-cron-secret') || ''
  if (!secret || gitt.length !== secret.length || !timingSafeEqual(Buffer.from(gitt), Buffer.from(secret))) {
    return new Response('Unauthorized', { status: 401 })
  }
  let body
  try { body = await req.json() } catch { return new Response('Bad request', { status: 400 }) }
  const id = String(body?.modelId || '')
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response('Bad request', { status: 400 })

  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
  const { data: rad } = await db.from('singing_models')
    .select('id, actor_id, status, external_id, model_path').eq('id', id).maybeSingle()
  if (!rad || rad.status !== 'training' || !rad.external_id || rad.model_path) {
    console.log(`[sang-flytt] ${id}: ingenting å flytte (${rad?.status ?? 'finnes ikke'})`)
    return new Response('ok', { status: 200 })
  }

  try {
    const res = await fetch(`https://api.replicate.com/v1/predictions/${encodeURIComponent(rad.external_id)}`, {
      headers: { Authorization: `Bearer ${process.env.REPLICATE_API_TOKEN || ''}` },
    })
    const p = await res.json().catch(() => ({}))
    const kilde = Array.isArray(p?.output) ? p.output[p.output.length - 1] : p?.output
    if (p?.status !== 'succeeded' || typeof kilde !== 'string') throw new Error(`Replicate ${res.status}: ingen modellfil i resultatet`)

    const sti = `sang/${rad.actor_id}/modell-${id}.zip`
    const { lagret, sha256, bytes } = await flyttFil(db, kilde, BOETTE, sti, 'application/zip')
    const { error } = await db.from('singing_models')
      .update({ model_path: lagret, model_sha256: sha256, model_bytes: bytes, flytt_startet: null, last_error: null, updated_at: new Date().toISOString() })
      .eq('id', id).eq('status', 'training').eq('external_id', rad.external_id)
    if (error) throw new Error(`raden: ${error.message}`)
    console.log(`[sang-flytt] ${id}: ${bytes} B, sha256 ${sha256.slice(0, 12)} → ${lagret}`)

    // Fullfør med en gang i stedet for å vente på neste tikk.
    const base = process.env.NEXT_PUBLIC_BASE_URL || 'https://twinledger.ai'
    await fetch(`${base}/api/cron/face-training`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-cron-secret': secret },
    }).catch((e) => console.warn('[sang-flytt] cron-kallet feilet (neste tikk tar det):', e))
  } catch (e) {
    const melding = e instanceof Error ? e.message : String(e)
    console.error(`[sang-flytt] ${id}: ${melding}`)
    await db.from('singing_models')
      .update({ last_error: `Modellfila kunne ikke lagres privat (${melding.slice(0, 160)}). Prøver igjen.` })
      .eq('id', id).eq('status', 'training')
  }
  return new Response('ok', { status: 200 })
}
