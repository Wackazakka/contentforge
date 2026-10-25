import { timingSafeEqual } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { flyttLora } from '../../lib/loraFlytt.mjs'

// Netlify Background Function (navnet slutter på -background → opptil 15 min, svarer 202).
//
// Flytter modellfila fra en ferdig ansiktstrening fra fal til den private
// bøtta FØR modellen blir «ready» (migrasjon 121). Fila er 130–330 MB — mer
// enn en vanlig funksjon rekker å hente og skrive innen fristen.
//
// Startes av lib/faceTraining (fullfoerTreninger) når fal melder COMPLETED.
// Når kopien er bevist lik, skrives sb://-stien på raden, og cron-ruta kalles
// med en gang: der blir modellen «ready», og prøvebildene og e-posten til
// rettighetshaveren går som før. Raden står i «training» til da.
//
// 🔑 ADRESSEN HENTES HER, IKKE FRA KROPPEN. Kroppen bærer bare karakter-id-en;
// fal-resultatet slås opp med radens egen request-id. En forfalsket
// forespørsel kan dermed ikke få oss til å lagre en fremmed fil som modell.
//
// Feiler stille på raden (last_error) og lar kravet stå: en ny flytting
// startes tidligst etter 20 minutter (lib/faceTraining), ikke ved hver
// sidevisning.

const STANDARD_ENDEPUNKT = 'fal-ai/flux-lora-portrait-trainer'

export default async function handler(req) {
  // Samme vakt som de andre bakgrunnsfunksjonene (sikkerhetsgjennomgangen
  // 25.10): mangler hemmeligheten, nektes alt; sammenlignet i konstant tid.
  const secret = process.env.CRON_SECRET || ''
  const gitt = req.headers.get('x-cron-secret') || ''
  if (!secret || gitt.length !== secret.length || !timingSafeEqual(Buffer.from(gitt), Buffer.from(secret))) {
    return new Response('Unauthorized', { status: 401 })
  }
  let body
  try { body = await req.json() } catch { return new Response('Bad request', { status: 400 }) }
  const id = String(body?.characterId || '')
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response('Bad request', { status: 400 })

  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
  const { data: rad } = await db.from('user_characters')
    .select('id, status, fal_request_id, trainer, lora_url').eq('id', id).maybeSingle()
  if (!rad || rad.status !== 'training' || !rad.fal_request_id) {
    console.log(`[lora-flytt] ${id}: ingenting å flytte (${rad?.status ?? 'finnes ikke'})`)
    return new Response('ok', { status: 200 })
  }

  try {
    const endepunkt = rad.trainer || STANDARD_ENDEPUNKT
    const res = await fetch(`https://queue.fal.run/${endepunkt}/requests/${rad.fal_request_id}`, {
      headers: { Authorization: `Key ${process.env.CONTENTFORGE_FAL_KEY || ''}` },
    })
    const resultat = await res.json().catch(() => ({}))
    const kilde = resultat?.diffusers_lora_file?.url
    if (!kilde) throw new Error(`fal ${res.status}: ingen modellfil i resultatet`)

    const { lagret, sha256, bytes } = await flyttLora(db, kilde, id)
    // Bare om raden fortsatt er den samme treningen — et «tren på nytt» i
    // mellomtiden lager en ny rad, men vi skriver aldri over noe vi ikke startet.
    const { error } = await db.from('user_characters')
      .update({ lora_url: lagret, lora_flytt_startet: null, last_error: null })
      .eq('id', id).eq('status', 'training').eq('fal_request_id', rad.fal_request_id)
    if (error) throw new Error(`raden: ${error.message}`)
    console.log(`[lora-flytt] ${id}: ${bytes} B, sha256 ${sha256.slice(0, 12)} → ${lagret}`)

    // Fullfør med en gang i stedet for å vente på neste tikk (≤ 10 min).
    const base = process.env.NEXT_PUBLIC_BASE_URL || 'https://twinledger.ai'
    await fetch(`${base}/api/cron/face-training`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-cron-secret': secret },
    }).catch((e) => console.warn('[lora-flytt] cron-kallet feilet (neste tikk tar det):', e))
  } catch (e) {
    const melding = e instanceof Error ? e.message : String(e)
    console.error(`[lora-flytt] ${id}: ${melding}`)
    await db.from('user_characters')
      .update({ last_error: `Modellfila kunne ikke lagres privat (${melding.slice(0, 160)}). Prøver igjen.` })
      .eq('id', id).eq('status', 'training')
  }
  return new Response('ok', { status: 200 })
}
