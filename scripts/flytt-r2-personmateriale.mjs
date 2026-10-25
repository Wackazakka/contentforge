// Flytter ekte menneskers stemme og ansikt fra den offentlige R2-bøtta til den
// private Supabase-bøtta training-sets, og skriver radene om fra offentlig URL
// til sti. Engangsjobb, 25.10.2026 — søster av flytt-audition-opptak.mjs.
//
//   voice-actors/  visittkortene (voice_actors.photo_urls/sample_urls/video_urls)
//                  + råfilene fra filmøkta 20.09, som ingen rad peker på
//   lesninger/     leseøkta 20.09 — ingen rad peker hit
//   own-voice/     «Les inn selv» — to testopptak fra 17.09
//   trening/       Maris treningssett (user_characters.training_set_url, 094)
//
// ⚠️ REKKEFØLGE. Koden som signerer stier (lib/actorMedia, migrasjon 122) må
// være i produksjon FØR --kopier. Ellers står det en sti på kortet som
// nettleseren ikke kan åpne.
//
// Tre trinn, hvert sitt flagg. Uten flagg skjer ingenting — skriptet viser
// bare hva det ville gjort.
//
//   node scripts/flytt-r2-personmateriale.mjs             # tørrkjøring
//   node scripts/flytt-r2-personmateriale.mjs --kopier    # kopier, kontroller, skriv om radene
//   node scripts/flytt-r2-personmateriale.mjs --slett-r2  # slett fra R2 det som er bekreftet kopiert
//
// 🔑 INGENTING SLETTES FRA R2 UTEN BEVIS. En fil slettes bare når kopien i
// Supabase er lastet ned igjen og har samme sha256 som originalen, OG ingen
// kjent rad lenger peker på den offentlige adressen. Ellers står den urørt, og
// skriptet sier hvorfor.
//
// 🔑 own-voice/ SKRIVES IKKE OM. Editoren og dropleten leser fortsatt
// offentlige adresser derfra (klippcachen på dropleten bruker adressen i
// nøkkelen). Peker et utkast på en fil, kopieres den, men utkastet røres ikke
// og fila blir stående i R2.
//
// Radene skriptet kjenner til, er de koden skriver. En database-vid kontroll
// (alle tekst- og jsonb-kolonner) ligger i scripts/finn-r2-referanser.sql —
// kjør den før --slett-r2.
//
// Stiene er de samme som R2-nøklene, så en rad skrives om ved å kutte bort
// `R2_PUBLIC_URL/`.
//
// Miljø: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, R2_ENDPOINT,
// R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME, R2_PUBLIC_URL.

import { createHash } from 'crypto'
import { createClient } from '@supabase/supabase-js'
import { S3Client, ListObjectsV2Command, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3'

const BOETTE = 'training-sets'
const PREFIKSER = ['voice-actors/', 'lesninger/', 'own-voice/', 'trening/']
const KOPIER = process.argv.includes('--kopier')
const SLETT = process.argv.includes('--slett-r2')

const mangler = ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'R2_ENDPOINT', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_PUBLIC_URL']
  .filter((k) => !process.env[k])
if (mangler.length) { console.error('Mangler miljø:', mangler.join(', ')); process.exit(1) }

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
const r2 = new S3Client({
  region: 'auto', endpoint: process.env.R2_ENDPOINT,
  credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY },
})
const R2_BOETTE = process.env.R2_BUCKET_NAME || 'contentforge-assets'
const BASE = process.env.R2_PUBLIC_URL.replace(/\/$/, '') + '/'

const sha = (buf) => createHash('sha256').update(buf).digest('hex')
const nokkelFra = (url) => (typeof url === 'string' && url.startsWith(BASE) && PREFIKSER.some((p) => url.startsWith(BASE + p)) ? url.slice(BASE.length) : null)
const liste = (v) => (Array.isArray(v) ? v.map(String) : [])

async function lesR2(key) {
  const r = await r2.send(new GetObjectCommand({ Bucket: R2_BOETTE, Key: key }))
  return { buf: Buffer.from(await r.Body.transformToByteArray()), type: r.ContentType || 'application/octet-stream' }
}

async function lesSupabase(sti) {
  const { data, error } = await db.storage.from(BOETTE).download(sti)
  if (error || !data) return null
  return Buffer.from(await data.arrayBuffer())
}

async function listR2() {
  const ut = []
  for (const prefiks of PREFIKSER) {
    let token
    do {
      const r = await r2.send(new ListObjectsV2Command({ Bucket: R2_BOETTE, Prefix: prefiks, ContinuationToken: token }))
      for (const o of r.Contents || []) ut.push({ key: o.Key, size: o.Size })
      token = r.IsTruncated ? r.NextContinuationToken : undefined
    } while (token)
  }
  return ut
}

/** Alle sider av en tabell (PostgREST gir 1000 om gangen). */
async function alle(tabell, kolonner) {
  const ut = []
  for (let fra = 0; ; fra += 1000) {
    const { data, error } = await db.from(tabell).select(kolonner).range(fra, fra + 999)
    if (error) throw new Error(`${tabell}: ${error.message}`)
    ut.push(...(data || []))
    if (!data || data.length < 1000) return ut
  }
}

/**
 * Alle kjente radfelt som peker på en offentlig R2-adresse under prefiksene.
 * `omskriv: true` = skriptet skriver feltet om til sti. `false` = feltet bare
 * BLOKKERER sletting (raden leses av kode som fortsatt venter en URL).
 */
async function offentligeRader() {
  const felt = []
  for (const a of await alle('voice_actors', 'id, photo_urls, sample_urls, video_urls, preview_url')) {
    for (const k of ['photo_urls', 'sample_urls', 'video_urls']) {
      for (const url of liste(a[k])) {
        const key = nokkelFra(url); if (key) felt.push({ tabell: 'voice_actors', id: a.id, kolonne: k, url, key, omskriv: key.startsWith(`voice-actors/${a.id}/`) })
      }
    }
    const key = nokkelFra(a.preview_url); if (key) felt.push({ tabell: 'voice_actors', id: a.id, kolonne: 'preview_url', url: a.preview_url, key, omskriv: false })
  }
  for (const c of await alle('user_characters', 'id, training_set_url')) {
    const key = nokkelFra(c.training_set_url); if (key) felt.push({ tabell: 'user_characters', id: c.id, kolonne: 'training_set_url', url: c.training_set_url, key, omskriv: true })
  }
  // `*`: sample_urls er eldre enn migrasjonene og finnes kanskje ikke overalt.
  for (const s of await alle('voice_actor_applications', '*')) {
    for (const k of ['photo_urls', 'sample_urls']) {
      for (const url of liste(s[k])) {
        const key = nokkelFra(url); if (key) felt.push({ tabell: 'voice_actor_applications', id: s.id, kolonne: k, url, key, omskriv: false })
      }
    }
  }
  // Utkastenes scener (voiceover_url, voice_history …) — søkes som tekst.
  const moenster = new RegExp(BASE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?:' + PREFIKSER.map((p) => p.replace('/', '\\/')).join('|') + ')[^"\\s]+', 'g')
  for (const d of await alle('production_drafts', 'id, segments')) {
    for (const url of new Set(JSON.stringify(d.segments || []).match(moenster) || [])) {
      felt.push({ tabell: 'production_drafts', id: d.id, kolonne: 'segments', url, key: url.slice(BASE.length), omskriv: false })
    }
  }
  return felt
}

/** Er kopien i Supabase identisk med originalen i R2? */
async function bekreftet(key, original) {
  const kopi = await lesSupabase(key)
  return !!kopi && kopi.length === original.length && sha(kopi) === sha(original)
}

const objekter = await listR2()
const felt = await offentligeRader()
for (const p of PREFIKSER) {
  const l = objekter.filter((o) => o.key.startsWith(p))
  console.log(`R2 ${R2_BOETTE}/${p}: ${l.length} objekter, ${l.reduce((s, o) => s + o.size, 0)} bytes`)
}
console.log(`Radfelt med offentlig R2-adresse: ${felt.length} (${felt.filter((f) => f.omskriv).length} skrives om, ${felt.filter((f) => !f.omskriv).length} blokkerer bare sletting)`)
const iR2 = new Set(objekter.map((o) => o.key))
const uten = felt.filter((f) => !iR2.has(f.key))
if (uten.length) console.log(`⚠️  ${uten.length} radfelt peker på noe som ikke finnes i R2 (røres ikke):`, uten.map((f) => `${f.tabell}.${f.kolonne} ${f.id} → ${f.key}`))
const pekesPaa = new Set(felt.map((f) => f.key))
console.log(`Objekter ingen kjent rad peker på: ${objekter.filter((o) => !pekesPaa.has(o.key)).length} av ${objekter.length}`)

const tall = { kopiert: 0, fantesAlt: 0, bekreftet: 0, konflikt: 0, raderOmskrevet: 0, slettet: 0, ikkeSlettet: 0 }

if (!KOPIER && !SLETT) {
  for (const o of objekter) console.log(`  ville kopiert ${o.key} (${o.size} B)${pekesPaa.has(o.key) ? '' : '  [ingen rad]'}`)
  for (const f of felt) {
    console.log(f.omskriv
      ? `  ville skrevet om ${f.tabell}.${f.kolonne} ${f.id} → ${f.key}`
      : `  BLOKKERER sletting: ${f.tabell}.${f.kolonne} ${f.id} → ${f.key}`)
  }
  console.log('\nTørrkjøring. Kjør med --kopier, deretter scripts/finn-r2-referanser.sql, deretter --slett-r2.')
  process.exit(0)
}

if (KOPIER) {
  const ok = new Set()
  for (const o of objekter) {
    const { buf, type } = await lesR2(o.key)
    const { error } = await db.storage.from(BOETTE).upload(o.key, buf, { contentType: type, upsert: false })
    if (error) {
      // Finnes den alt (en tidligere kjøring), godtas den bare om den er identisk.
      if (!/exists|duplicate/i.test(error.message)) { console.log(`✗ ${o.key}: ${error.message}`); tall.konflikt++; continue }
      tall.fantesAlt++
    } else tall.kopiert++
    if (await bekreftet(o.key, buf)) { ok.add(o.key); tall.bekreftet++; console.log(`✓ ${o.key}`) }
    else { tall.konflikt++; console.log(`✗ ${o.key}: kopien i Supabase er ikke lik originalen — rad og R2 røres ikke`) }
  }

  // voice_actors: lister. Raden leses på nytt rett før den skrives, og bare
  // elementer med bekreftet kopi byttes ut.
  const skuespillere = [...new Set(felt.filter((f) => f.omskriv && f.tabell === 'voice_actors').map((f) => f.id))]
  for (const id of skuespillere) {
    const { data: a, error: e1 } = await db.from('voice_actors').select('photo_urls, sample_urls, video_urls').eq('id', id).maybeSingle()
    if (e1 || !a) { console.log(`✗ voice_actors ${id}: ${e1?.message || 'finnes ikke'}`); continue }
    const patch = {}
    for (const k of ['photo_urls', 'sample_urls', 'video_urls']) {
      const gammel = liste(a[k])
      const ny = gammel.map((url) => { const key = nokkelFra(url); return key && ok.has(key) && key.startsWith(`voice-actors/${id}/`) ? key : url })
      if (ny.some((v, i) => v !== gammel[i])) patch[k] = ny
    }
    if (!Object.keys(patch).length) continue
    const { error } = await db.from('voice_actors').update(patch).eq('id', id)
    if (error) console.log(`✗ voice_actors ${id}: ${error.message}`)
    else { tall.raderOmskrevet++; console.log(`✎ voice_actors ${id}: ${Object.keys(patch).join(', ')}`) }
  }

  // user_characters.training_set_url: `eq(kolonne, url)` — skrives bare om
  // raden fortsatt har den gamle adressen.
  for (const f of felt.filter((x) => x.omskriv && x.tabell === 'user_characters')) {
    if (!ok.has(f.key)) continue
    const { data, error } = await db.from('user_characters').update({ training_set_url: f.key }).eq('id', f.id).eq('training_set_url', f.url).select('id')
    if (error) console.log(`✗ user_characters.training_set_url ${f.id}: ${error.message}`)
    else if (data?.length) { tall.raderOmskrevet++; console.log(`✎ user_characters ${f.id}: training_set_url`) }
  }
}

if (SLETT) {
  const fortsatt = new Set((await offentligeRader()).map((f) => f.key))
  for (const o of objekter) {
    if (fortsatt.has(o.key)) { tall.ikkeSlettet++; console.log(`– ${o.key}: en rad peker fortsatt på den offentlige adressen`); continue }
    const { buf } = await lesR2(o.key)
    if (!(await bekreftet(o.key, buf))) { tall.ikkeSlettet++; console.log(`– ${o.key}: ingen identisk kopi i Supabase`); continue }
    await r2.send(new DeleteObjectCommand({ Bucket: R2_BOETTE, Key: o.key }))
    tall.slettet++
    console.log(`🗑 ${o.key}`)
  }
}

console.log('\n', tall)
