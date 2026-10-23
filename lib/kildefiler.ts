import { createHash } from 'crypto'
import { createClient } from '@supabase/supabase-js'

// Kildematerialet (migrasjon 110): erklæring og fingeravtrykk per levert fil.
//
// 🔑 HASHEN REGNES HER, FRA FILA I LAGRINGEN. Nettleseren laster rett til den
// private bøtta (Netlify-grensen, 099); serveren henter fila tilbake og regner
// sha256 selv. En hash klienten oppgir er en påstand, ikke et bevis.
//
// 🔑 FEILER ÅPENT. Leveringen er alt lagret når dette kalles. En hash som
// ikke lot seg regne skal ikke gjøre et levert bilde til et ulevert — feilen
// skrives på raden, og et nytt forsøk (etterslepet) kan fylle den inn.

export type EierTabell = 'voice_actors' | 'voice_actor_applications'
export type Kind = 'photo' | 'recording'

function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || '', process.env.SUPABASE_SERVICE_ROLE_KEY || '')
}

export const BOETTE: Record<Kind, string> = { photo: 'training-sets', recording: 'voice-recordings' }

/** Tidspunkt og kamera fra bildets egen metadata. ALDRI GPS. Null når fila ikke har noe. */
async function lesExif(buf: Buffer): Promise<Record<string, string> | null> {
  try {
    const exifr = (await import('exifr')).default
    // reviveValues:false — EXIF-tid har ingen tidssone. Gjort om til Date ville
    // den fått serverens sone (UTC på Netlify) og en «Z» den ikke har dekning
    // for. Lagres som den står i bildet: «2014-06-21 18:30:05», lokal tid.
    const e = await exifr.parse(buf, { pick: ['DateTimeOriginal', 'CreateDate', 'Make', 'Model'], reviveValues: false })
    if (!e) return null
    const tid = String(e.DateTimeOriginal || e.CreateDate || '')
    const ut: Record<string, string> = {}
    const m = tid.match(/^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}:\d{2}:\d{2})/)
    if (m && m[1] !== '0000') ut.takenAt = `${m[1]}-${m[2]}-${m[3]} ${m[4]}`
    if (e.Make) ut.make = String(e.Make).trim().slice(0, 80)
    if (e.Model) ut.model = String(e.Model).trim().slice(0, 80)
    return Object.keys(ut).length ? ut : null
  } catch { return null }
}

/**
 * Registrer én levert fil: hent den fra lagringen, regn sha256 og (for bilder)
 * les tidspunkt og kamera, og lagre sammen med erklæringen hun avga.
 * `erklaering` null = fil levert før erklæringen fantes (etterslep).
 */
export async function registrerKildefil(a: {
  eierTabell: EierTabell; eierId: string; kind: Kind; path: string; erklaering: string | null
}): Promise<void> {
  const rad: Record<string, unknown> = {
    owner_table: a.eierTabell, owner_id: a.eierId, kind: a.kind, path: a.path,
    declaration: a.erklaering, declared_at: a.erklaering ? new Date().toISOString() : null,
    sha256: null, bytes: null, content_type: null, exif: null, error: null,
  }
  try {
    const { data, error } = await admin().storage.from(BOETTE[a.kind]).download(a.path)
    if (error || !data) throw new Error(error?.message || 'fant ikke fila')
    const buf = Buffer.from(await data.arrayBuffer())
    rad.sha256 = createHash('sha256').update(buf).digest('hex')
    rad.bytes = buf.length
    rad.content_type = data.type || null
    if (a.kind === 'photo') rad.exif = await lesExif(buf)
  } catch (e) {
    rad.error = e instanceof Error ? e.message.slice(0, 300) : 'ukjent feil'
  }
  // Etterslepet skal aldri overskrive en erklæring hun faktisk avga.
  if (!a.erklaering) {
    const { data: fins } = await admin().from('source_files').select('declaration, declared_at')
      .eq('owner_table', a.eierTabell).eq('owner_id', a.eierId).eq('path', a.path).maybeSingle()
    if (fins?.declaration) { rad.declaration = fins.declaration; rad.declared_at = fins.declared_at }
  }
  const { error } = await admin().from('source_files').upsert(rad, { onConflict: 'owner_table,owner_id,path' })
  if (error) console.error('[kildefiler] kunne ikke lagre:', error.message)
}

export async function fjernKildefil(eierTabell: EierTabell, eierId: string, path: string): Promise<void> {
  await admin().from('source_files').delete().eq('owner_table', eierTabell).eq('owner_id', eierId).eq('path', path)
}

export interface Kildefil {
  path: string; kind: Kind; sha256: string | null; bytes: number | null
  exif: { takenAt?: string; make?: string; model?: string } | null
  declaration: string | null; declared_at: string | null; error: string | null
}

export async function kildefilerFor(eierTabell: EierTabell, eierId: string): Promise<Kildefil[]> {
  const { data } = await admin().from('source_files')
    .select('path, kind, sha256, bytes, exif, declaration, declared_at, error')
    .eq('owner_table', eierTabell).eq('owner_id', eierId)
  return (data || []) as Kildefil[]
}

/**
 * Fyll inn fingeravtrykk for filer som ble levert før 110 (eller der hashen
 * feilet). Høyst `maks` filer per kall — hver fil hentes fra lagringen.
 * Returnerer hvor mange som ble gjort og hvor mange som gjenstår.
 */
export async function fyllEtterslep(maks = 15): Promise<{ gjort: number; gjenstaar: number }> {
  const db = admin()
  const mangler: Array<{ eierTabell: EierTabell; eierId: string; kind: Kind; path: string }> = []
  for (const tabell of ['voice_actors', 'voice_actor_applications'] as EierTabell[]) {
    const { data: rader } = await db.from(tabell).select('id, photo_paths, recording_paths')
    for (const r of (rader || []) as Array<{ id: string; photo_paths: string[] | null; recording_paths: string[] | null }>) {
      const alle: Array<[Kind, string]> = [
        ...(r.photo_paths || []).map((p) => ['photo', p] as [Kind, string]),
        ...(r.recording_paths || []).map((p) => ['recording', p] as [Kind, string]),
      ]
      if (!alle.length) continue
      const { data: har } = await db.from('source_files').select('path, sha256').eq('owner_table', tabell).eq('owner_id', String(r.id))
      const ferdig = new Set((har || []).filter((h: any) => h.sha256).map((h: any) => h.path))
      for (const [kind, path] of alle) if (!ferdig.has(path)) mangler.push({ eierTabell: tabell, eierId: String(r.id), kind, path })
    }
  }
  const naa = mangler.slice(0, maks)
  for (const m of naa) await registrerKildefil({ ...m, erklaering: null })
  return { gjort: naa.length, gjenstaar: mangler.length - naa.length }
}
