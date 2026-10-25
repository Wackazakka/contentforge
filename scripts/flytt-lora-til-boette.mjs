// Flytter de trente ansiktsmodellene fra fal (offentlige, evige adresser) til
// den private bøtta, og skriver user_characters.lora_url om til sb://-stien.
// Engangsjobb, 25.10.2026 (migrasjon 121). Nye treninger flyttes av
// netlify/functions/lora-flytt-background før de blir «ready».
//
//   node scripts/flytt-lora-til-boette.mjs            # tørrkjøring
//   node scripts/flytt-lora-til-boette.mjs --kopier   # kopier, kontroller, skriv om radene
//
// 🔑 EN RAD SKRIVES BARE OM NÅR KOPIEN ER BEVIST LIK. Fila leses tilbake
// gjennom en signert lenke (den veien fal får den) og sammenliknes med
// sha256 av originalen — se lib/loraFlytt.mjs. Raden skrives bare om hvis
// den fortsatt har den gamle adressen.
//
// ⚠️ ORIGINALEN HOS FAL SLETTES IKKE HER. Den er fortsatt åpen for den som
// har lenken, til fal sletter den (DELETE /v1/models/requests/<id>/payloads
// — kan ikke angres). Det er en egen beslutning.
//
// Miljø: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.

import { createClient } from '@supabase/supabase-js'
import { flyttLora, loraStiFor } from '../lib/loraFlytt.mjs'

const KOPIER = process.argv.includes('--kopier')

const mangler = ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'].filter((k) => !process.env[k])
if (mangler.length) { console.error('Mangler miljø:', mangler.join(', ')); process.exit(1) }

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

const { data: rader, error } = await db.from('user_characters')
  .select('id, name, status, trainer, lora_url').like('lora_url', 'http%').order('created_at')
if (error) { console.error(error.message); process.exit(1) }
console.log(`Rader med offentlig modelladresse: ${rader.length}`)

if (!KOPIER) {
  for (const r of rader) console.log(`  ville flyttet ${r.id} «${r.name}» (${r.status}, ${r.trainer || '–'}) → ${loraStiFor(r.id)}`)
  console.log('\nTørrkjøring. Kjør med --kopier.')
  process.exit(0)
}

const tall = { flyttet: 0, feilet: 0, endretUnderveis: 0 }
for (const r of rader) {
  try {
    const { lagret, sha256, bytes } = await flyttLora(db, r.lora_url, r.id)
    // eq('lora_url', gammel): skrives bare om raden fortsatt peker på originalen.
    const { data, error: e } = await db.from('user_characters')
      .update({ lora_url: lagret }).eq('id', r.id).eq('lora_url', r.lora_url).select('id')
    if (e) throw new Error(e.message)
    if (!data?.length) { tall.endretUnderveis++; console.log(`– ${r.id}: raden er endret underveis, ikke skrevet om`); continue }
    tall.flyttet++
    console.log(`✓ ${r.id} «${r.name}»: ${(bytes / 1e6).toFixed(1)} MB, sha256 ${sha256} → ${lagret}`)
  } catch (e) {
    tall.feilet++
    console.log(`✗ ${r.id} «${r.name}»: ${e instanceof Error ? e.message : e} — raden er urørt`)
  }
}
console.log('\n', tall)
