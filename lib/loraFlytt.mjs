// Kopier en modellfil (LoRA) fra en offentlig adresse til den private bøtta,
// og bevis at kopien er lik (25.10.2026, migrasjon 121).
//
// Delt mellom bakgrunnsfunksjonen (netlify/functions/lora-flytt-background)
// og engangsskriptet (scripts/flytt-lora-til-boette.mjs). Ren JS, fordi
// Netlify-funksjonene er .mjs (samme grunn som lib/senderContext.mjs).
//
// 🔑 KOPIEN BEVISES GJENNOM DEN VEIEN FAL BRUKER. Fila leses tilbake via en
// signert lenke — slik lib/loraKilde gir den til fal — og sha256 sammenliknes
// med originalen. En rad skal aldri peke på en kopi ingen har lest.

import { createHash } from 'node:crypto'

export const LORA_BOETTE = 'training-sets'

export const loraStiFor = (karakterId) => `trained/${karakterId}.safetensors`

async function shaAvStroem(svar) {
  const h = createHash('sha256')
  let bytes = 0
  for await (const bit of svar.body) { h.update(bit); bytes += bit.length }
  return { sha256: h.digest('hex'), bytes }
}

/**
 * @returns {{ sti: string, lagret: string, sha256: string, bytes: number }}
 *   `lagret` er verdien som skal stå i user_characters.lora_url.
 */
export async function flyttLora(db, kildeUrl, karakterId) {
  const r = await fetch(kildeUrl)
  if (!r.ok) throw new Error(`nedlasting ${r.status}`)
  // Hele fila i minnet (130–330 MB): opplastingen trenger lengden på forhånd.
  const buf = Buffer.from(await r.arrayBuffer())
  const sha256 = createHash('sha256').update(buf).digest('hex')

  const sti = loraStiFor(karakterId)
  // upsert: et nytt forsøk etter et avbrutt et skal kunne skrive over en halv kopi.
  const { error } = await db.storage.from(LORA_BOETTE).upload(sti, buf, { contentType: 'application/octet-stream', upsert: true })
  if (error) throw new Error(`opplasting: ${error.message}`)

  const { data: s, error: sFeil } = await db.storage.from(LORA_BOETTE).createSignedUrl(sti, 600)
  if (sFeil || !s?.signedUrl) throw new Error(`signering: ${sFeil?.message || 'ingen lenke'}`)
  const tilbake = await fetch(s.signedUrl)
  if (!tilbake.ok) throw new Error(`kontrollesing ${tilbake.status}`)
  const kontroll = await shaAvStroem(tilbake)
  if (kontroll.sha256 !== sha256 || kontroll.bytes !== buf.length) {
    throw new Error('kopien er ikke lik originalen')
  }
  return { sti, lagret: `sb://${LORA_BOETTE}/${sti}`, sha256, bytes: buf.length }
}
