// Flytter de gamle audition-opptakene fra den offentlige R2-bøtta til den
// private Supabase-bøtta (lib/auditions.ts, AUDITION_BOETTE), og skriver
// radene om fra offentlig URL til sti. Engangsjobb, 25.10.2026.
//
// Tre trinn, hvert sitt flagg. Uten flagg skjer ingenting — skriptet viser
// bare hva det ville gjort.
//
//   node scripts/flytt-audition-opptak.mjs             # tørrkjøring
//   node scripts/flytt-audition-opptak.mjs --kopier    # kopier, kontroller, skriv om radene
//   node scripts/flytt-audition-opptak.mjs --slett-r2  # slett fra R2 det som er bekreftet kopiert
//
// 🔑 INGENTING SLETTES FRA R2 UTEN BEVIS. En fil slettes bare når kopien i
// Supabase er lastet ned igjen og har samme sha256 som originalen, OG ingen
// rad lenger peker på den offentlige adressen. Ellers står den urørt, og
// skriptet sier hvorfor.
//
// Stiene er de samme som R2-nøklene (`auditions/<audition>/…`), så en rad
// skrives om ved å kutte bort `R2_PUBLIC_URL/`.
//
// Miljø: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, R2_ENDPOINT,
// R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME, R2_PUBLIC_URL.

import { createHash } from 'crypto'
import { createClient } from '@supabase/supabase-js'
import { S3Client, ListObjectsV2Command, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3'

const BOETTE = 'training-sets'
const PREFIKS = 'auditions/'
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
const nokkelFra = (url) => (typeof url === 'string' && url.startsWith(BASE + PREFIKS) ? url.slice(BASE.length) : null)

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
  let token
  do {
    const r = await r2.send(new ListObjectsV2Command({ Bucket: R2_BOETTE, Prefix: PREFIKS, ContinuationToken: token }))
    for (const o of r.Contents || []) ut.push({ key: o.Key, size: o.Size })
    token = r.IsTruncated ? r.NextContinuationToken : undefined
  } while (token)
  return ut
}

/** Alle radfelt som peker på en offentlig R2-adresse under auditions/. */
async function offentligeRader() {
  const felt = []
  const { data: takes, error: e1 } = await db.from('audition_takes').select('id, still_url, video_url, audio_url')
  if (e1) throw new Error(e1.message)
  for (const t of takes || []) for (const k of ['still_url', 'video_url', 'audio_url']) {
    const key = nokkelFra(t[k]); if (key) felt.push({ tabell: 'audition_takes', id: t.id, kolonne: k, url: t[k], key })
  }
  const { data: reads, error: e2 } = await db.from('audition_reads').select('id, audio_url')
  if (e2) throw new Error(e2.message)
  for (const r of reads || []) {
    const key = nokkelFra(r.audio_url); if (key) felt.push({ tabell: 'audition_reads', id: r.id, kolonne: 'audio_url', url: r.audio_url, key })
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
console.log(`R2 ${R2_BOETTE}/${PREFIKS}: ${objekter.length} objekter, ${objekter.reduce((s, o) => s + o.size, 0)} bytes`)
console.log(`Radfelt med offentlig R2-adresse: ${felt.length}`)
const iR2 = new Set(objekter.map((o) => o.key))
const uten = felt.filter((f) => !iR2.has(f.key))
if (uten.length) console.log(`⚠️  ${uten.length} radfelt peker på noe som ikke finnes i R2 (røres ikke):`, uten.map((f) => `${f.tabell}.${f.kolonne} ${f.id}`))

const tall = { kopiert: 0, fantesAlt: 0, bekreftet: 0, konflikt: 0, raderOmskrevet: 0, slettet: 0, ikkeSlettet: 0 }

if (!KOPIER && !SLETT) {
  for (const o of objekter) console.log(`  ville kopiert ${o.key} (${o.size} B)`)
  for (const f of felt) console.log(`  ville skrevet om ${f.tabell}.${f.kolonne} ${f.id} → ${f.key}`)
  console.log('\nTørrkjøring. Kjør med --kopier, deretter --slett-r2.')
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
  for (const f of felt) {
    if (!ok.has(f.key)) continue
    // `eq(kolonne, url)`: skrives bare om raden fortsatt har den gamle adressen.
    const { data, error } = await db.from(f.tabell).update({ [f.kolonne]: f.key }).eq('id', f.id).eq(f.kolonne, f.url).select('id')
    if (error) console.log(`✗ ${f.tabell}.${f.kolonne} ${f.id}: ${error.message}`)
    else if (data?.length) tall.raderOmskrevet++
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
