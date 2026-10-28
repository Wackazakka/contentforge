import { createHash } from 'crypto'
import { createClient } from '@supabase/supabase-js'

// Hva som faktisk ble laget med tvillingen (127, Lars 28.10.2026).
//
// Hovedboken (voice_usage_events) sier AT stemmen eller ansiktet ble brukt,
// av hvem, under hvilken lisens og for hvor mye. Den sier ikke HVA: teksten
// som ble lest, bildet som ble laget, filmen det endte i. Uten det må
// rettighetshaveren stole på at bruken var innenfor det hun sa ja til.
//
// 🔑 TEKSTEN LIGGER IKKE I HOVEDBOKEN, BARE FINGERAVTRYKKET. Hovedboken kan
// bare legges til (118), og alt i meta inngår i hash-kjeden. En kundes manus
// der ville aldri kunne slettes. Derfor: sha256 av teksten i meta (bevisbart,
// låst), selve teksten og pekeren til resultatet her (kan rettes og slettes).
//
// 🔑 RESULTATET KOMMER OFTE ETTER RADEN. Film, radio og avatar lages på
// dropleten etter at royalty-raden er skrevet. Adressen er kjent på forhånd
// (videos/{jobId}/output.mp4 osv.) og lagres sammen med job_id; om fila
// faktisk finnes, avgjøres når hovedboken leses (asset_banks).
//
// Alt her feiler stille: innsyn er viktig, men det skal aldri velte en
// produksjon eller en royalty-rad.

function db() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || '', process.env.SUPABASE_SERVICE_ROLE_KEY || '')
}

// ── Innsynsnivåene ──────────────────────────────────────────────────────────
// Grunnlinjen (når, hva slags bruk, lisens, byrå, beløp) ser hun ALLTID — det
// er selve regnskapet. Nivåene legger til:
//   production  navnet på produksjonen
//   script      + teksten som ble lest / beskrivelsen bildet ble laget fra
//   full        + selve resultatet (lyd, bilde, film)
export const INNSYN = ['production', 'script', 'full'] as const
export type Innsyn = (typeof INNSYN)[number]
export const erInnsyn = (v: unknown): v is Innsyn => typeof v === 'string' && (INNSYN as readonly string[]).includes(v)
const RANG: Record<Innsyn, number> = { production: 0, script: 1, full: 2 }
export const ser = (niva: Innsyn, krav: Innsyn) => RANG[niva] >= RANG[krav]

/**
 * Nivået som gjelder for én bruk.
 *
 * 🔑 BARE ET BYRÅ KAN BEGRENSE. En drop-in har ingen over seg som har en
 * legitim grunn til å skjule noe for henne, så hun ser alt, uansett hva som
 * står på lisensen. Er hun kommet gjennom et byrå, gjelder lisensens valg; for
 * bruk uten lisens (prøvelytt, bruk uten hjemmel) gjelder byråets standard.
 */
export function gjeldendeInnsyn(o: { harByraa: boolean; lisens?: string | null; byraaStandard?: string | null }): Innsyn {
  if (!o.harByraa) return 'full'
  if (erInnsyn(o.lisens)) return o.lisens
  if (erInnsyn(o.byraaStandard)) return o.byraaStandard
  return 'full'
}

// ── Teksten ─────────────────────────────────────────────────────────────────
export type TekstSort = 'spoken' | 'prompt' | 'line'
export interface Tekst { body: string; kind: TekstSort }

const TAK = 20000 // et langt filmmanus er et par tusen tegn; dette er god margin

export const fingeravtrykk = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex')

/** Det som skal i meta på hovedbokraden. Tom tekst → ingenting. */
export function tekstMeta(t?: Tekst | null): Record<string, unknown> {
  const body = t?.body?.trim()
  if (!body) return {}
  return { text_sha256: fingeravtrykk(body.slice(0, TAK)), text_kind: t!.kind }
}

// ── Resultatet ──────────────────────────────────────────────────────────────
export type ResultatSort = 'audio' | 'video' | 'image'
export interface Resultat { url: string | null; kind: ResultatSort; store?: 'r2' | 'training-sets'; jobId?: string | null }

const R2 = () => (process.env.NEXT_PUBLIC_R2_URL || process.env.R2_PUBLIC_URL || 'https://pub-5dcdfe9305a740febc87568c9ccb40a6.r2.dev').replace(/\/$/, '')

/** Der dropleten legger resultatet av en jobb (contentforge-server/job-queue.js). */
export function dropletResultat(sort: 'video' | 'radio' | 'avatar', jobId: string): Resultat {
  if (sort === 'radio') return { url: `${R2()}/radio/${jobId}/output.mp3`, kind: 'audio', jobId }
  if (sort === 'avatar') return { url: `${R2()}/avatars/${jobId}/output.mp4`, kind: 'video', jobId }
  return { url: `${R2()}/videos/${jobId}/output.mp4`, kind: 'video', jobId }
}

/**
 * Skriv detaljene for én hovedbokrad. Kalles rett etter innsettingen, og
 * eventuelt én gang til når resultatet er kjent — feltene som ikke sendes,
 * blir stående.
 */
export async function skrivDetaljer(eventId: string | null | undefined, d: { tekst?: Tekst | null; resultat?: Resultat | null }): Promise<void> {
  try {
    if (!eventId) return
    const rad: Record<string, unknown> = { event_id: eventId }
    const body = d.tekst?.body?.trim()
    if (body) { rad.text_body = body.slice(0, TAK); rad.text_kind = d.tekst!.kind }
    if (d.resultat) {
      rad.output_url = d.resultat.url
      rad.output_kind = d.resultat.kind
      rad.output_store = d.resultat.store ?? 'r2'
      rad.job_id = d.resultat.jobId ?? null
    }
    if (Object.keys(rad).length === 1) return
    const { error } = await db().from('voice_usage_details').upsert(rad, { onConflict: 'event_id' })
    // 42P01: migrasjon 127 er ikke kjørt ennå — da finnes det ingenting å skrive til.
    if (error && error.code !== '42P01') console.warn('[usageDetails] kunne ikke lagre detaljer:', error.message)
  } catch (err) {
    console.warn('[usageDetails] detaljer hoppet over:', err)
  }
}

/** Samme resultat på flere rader (stemme og ansikt i samme film). */
export async function festResultat(eventIds: Array<string | null | undefined>, r: Resultat): Promise<void> {
  for (const id of eventIds) if (id) await skrivDetaljer(id, { resultat: r })
}

/** Teksten i en film: replikkene, i rekkefølge. Skjermtekst er ikke tale. */
export function manusFraSegmenter(segments: unknown): string {
  if (!Array.isArray(segments)) return ''
  return segments
    .map((s) => (s && typeof s === 'object' ? String((s as { voiceover?: unknown }).voiceover ?? '').trim() : ''))
    .filter(Boolean)
    .join('\n\n')
}
