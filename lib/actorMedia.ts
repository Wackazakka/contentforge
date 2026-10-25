import { createClient } from '@supabase/supabase-js'

// Visittkortets bilder, lydprøver og filmer (069/081) — voice_actors.photo_urls,
// sample_urls og video_urls.
//
// 🔑 KORTET ER OFFENTLIG, FILENE ER DET IKKE (Lars 25.10.2026, alternativ B).
// Fram til da lå de i R2-bøtta, som er eksponert i sin helhet gjennom
// `pub-…r2.dev`. Å fjerne et bilde, avpublisere kortet eller trekke seg tok
// bare lenken ut av raden; fila virket for alle, for alltid. Personvern-
// erklæringen lover at en rettighetshavers materiale bare åpnes med kortlevde
// lenker. Nå: den private bøtta, STIEN på raden, og en signert lenke hver gang
// kortet vises. Avpublisert kort = ingen nye lenker. Fjernet bilde = slettet fil.
//
// 🔑 BARE STIER UNDER SKUESPILLERENS EGET PREFIKS SIGNERES. Lista på raden kan
// skrives av adminen, og bøtta deles med treningssett, prøvebilder og
// auditions. Uten grensa kunne en sti til noe helt annet (en annens
// treningsbilder) blitt signert og vist på et offentlig kort.
//
// Eldre http-adresser slippes gjennom som de er, til de er flyttet
// (scripts/flytt-r2-personmateriale.mjs). Stiene er de samme som nøklene i R2
// var, så flyttingen trenger ikke bytte navn.

export const MEDIE_BOETTE = 'training-sets'
/** Lenkene sidene får. Lyd og film lastes først ved avspilling, så de må overleve en stund på siden. */
export const MEDIE_VIS_SEK = 3600

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  )
}

export function medieprefiks(actorId: string): string {
  return `voice-actors/${actorId}/`
}

export const erHttp = (v: string) => /^https?:\/\//.test(v)

/** Er dette en privat sti som hører til akkurat denne skuespilleren? */
export function egenSti(actorId: string, v: string): boolean {
  return !erHttp(v) && v.startsWith(medieprefiks(actorId)) && !v.includes('..')
}

export function somListe(v: unknown): string[] {
  return (Array.isArray(v) ? v : []).map(String).filter(Boolean)
}

/** Last opp til den private bøtta. Returnerer stien som skal på raden. */
export async function lagreMedie(actorId: string, filnavn: string, buf: Buffer, type: string | undefined): Promise<string> {
  const sti = `${medieprefiks(actorId)}${filnavn}`
  const { error } = await admin().storage.from(MEDIE_BOETTE).upload(sti, buf, { contentType: type || 'application/octet-stream', upsert: false })
  if (error) throw new Error(`Lagring feilet (${sti}): ${error.message}`)
  return sti
}

/**
 * Signer alt i én runde. Returnerer et oppslag verdi → lenke (null = vises
 * ikke). En fil som mangler skal ikke velte siden; den faller bare ut.
 */
export async function signerMedier(rader: Array<{ actorId: string; verdier: string[] }>): Promise<(actorId: string, v: string) => string | null> {
  const privat = new Set<string>()
  for (const r of rader) for (const v of r.verdier) if (egenSti(r.actorId, v)) privat.add(v)
  const lenker = new Map<string, string>()
  if (privat.size) {
    const { data, error } = await admin().storage.from(MEDIE_BOETTE).createSignedUrls([...privat], MEDIE_VIS_SEK)
    if (error) console.warn('[actorMedia] signering feilet:', error.message)
    for (const d of data || []) if (d.path && d.signedUrl) lenker.set(d.path, d.signedUrl)
  }
  return (actorId, v) => (erHttp(v) ? v : egenSti(actorId, v) ? lenker.get(v) ?? null : null)
}

/**
 * Slett filer fra den private bøtta. Bare skuespillerens egne stier — eldre
 * R2-adresser røres ikke her (de flyttes eller slettes av skriptet).
 */
export async function slettMedier(actorId: string, verdier: string[]): Promise<void> {
  const stier = verdier.filter((v) => egenSti(actorId, v))
  if (stier.length === 0) return
  const { error } = await admin().storage.from(MEDIE_BOETTE).remove(stier)
  if (error) console.warn('[actorMedia] sletting feilet:', error.message, stier)
}
