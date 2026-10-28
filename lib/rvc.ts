// Sangstemmer med RVC hos Replicate (127, 28.10.2026).
//
// RVC (Retrieval-based Voice Conversion, MIT) gjør om en sunget vokal til
// sangerens klang. Én modell per sanger — en fil vi har, slik vi har
// ansiktsmodellene. Replicate kjører treningen og konverteringen; fila ligger
// hos oss og sendes dit som en signert lenke med kort levetid.
//
//   trening       replicate/train-rvc-model       zip med dataset/<navn>/*.wav → zip med modellen
//   konvertering  zsxkib/realistic-voice-cloning  vokal eller hel låt + modell-zip → lyd
//
// 🔑 SKJEMAET LESES FØR VI SENDER. Konverteringsmodellen er lagt ut av en
// privatperson, og feltene har endret seg mellom versjonene (pitch_change har
// vært både tall og valgliste). Vi henter versjonens eget skjema og sender bare
// felt det kjenner — et ukjent felt skal ikke stoppe en jobb, og et felt som
// har skiftet type skal ikke sende tull.
//
// 🔑 VERSJONEN LÅSES PÅ RADEN. Hver jobb lagrer hvilken modellversjon den kjørte
// på, så en modell kan etterprøves den dagen noen spør hvorfor den lød slik.
// REPLICATE_RVC_TRAIN_VERSION / REPLICATE_RVC_CONVERT_VERSION låser den i
// drift; uten dem brukes nyeste.
//
// ⚠️ Replicate sletter utdata fra API-jobber etter en time. Modell-zipen må
// flyttes til vår bøtte før det (netlify/functions/sang-flytt-background).
//
// Server-only.

const API = 'https://api.replicate.com/v1'
export const TRENER = 'replicate/train-rvc-model'
export const KONVERTERER = 'zsxkib/realistic-voice-cloning'

export class RvcIkkeKonfigurert extends Error {
  constructor() { super('Sangstemmer er ikke slått på: REPLICATE_API_TOKEN mangler.') }
}

function token(): string {
  const t = process.env.REPLICATE_API_TOKEN
  if (!t) throw new RvcIkkeKonfigurert()
  return t
}

export const rvcErKonfigurert = () => !!process.env.REPLICATE_API_TOKEN

async function kall(sti: string, init?: RequestInit) {
  const res = await fetch(`${API}${sti}`, {
    ...init,
    headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json', ...(init?.headers || {}) },
    cache: 'no-store',
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(`Replicate ${res.status}: ${String(data?.detail || data?.error || JSON.stringify(data)).slice(0, 200)}`)
  return data
}

type Skjema = { properties: Record<string, { type?: string; enum?: unknown[]; allOf?: Array<{ $ref?: string }>; default?: unknown }>; enums: Record<string, unknown[]> }

/** Versjonen som skal brukes, og dens inndataskjema. */
async function versjon(modell: string, laast: string | undefined): Promise<{ id: string; skjema: Skjema }> {
  const v = laast
    ? await kall(`/models/${modell}/versions/${laast}`)
    : (await kall(`/models/${modell}`)).latest_version
  if (!v?.id) throw new Error(`Fant ingen versjon av ${modell}`)
  const s = v.openapi_schema?.components?.schemas || {}
  const enums: Record<string, unknown[]> = {}
  for (const [navn, def] of Object.entries(s as Record<string, { enum?: unknown[] }>)) if (Array.isArray(def?.enum)) enums[navn] = def.enum
  return { id: v.id, skjema: { properties: s.Input?.properties || {}, enums } }
}

/** Valgene et felt tillater: direkte, eller via en $ref til en enum. */
function lovligeVerdier(skjema: Skjema, felt: string): unknown[] | null {
  const p = skjema.properties[felt]
  if (!p) return null
  if (Array.isArray(p.enum)) return p.enum
  const ref = p.allOf?.find((x) => x.$ref)?.$ref?.split('/').pop()
  return ref && skjema.enums[ref] ? skjema.enums[ref] : null
}

/** Behold bare felt versjonen kjenner, og bare verdier den godtar. */
export function tilpassInndata(skjema: Skjema, inndata: Record<string, unknown>): Record<string, unknown> {
  const ut: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(inndata)) {
    if (v === undefined || !(k in skjema.properties)) continue
    const lov = lovligeVerdier(skjema, k)
    if (lov && !lov.includes(v)) continue
    ut[k] = v
  }
  return ut
}

export interface Jobb { id: string; versjon: string }

/**
 * Start en trening. `datasettUrl` er en signert lenke til en zip med
 * dataset/<navn>/*.wav. 80 runder er Replicates eget råd for best resultat.
 */
export async function startTrening(datasettUrl: string, opts: { runder?: number } = {}): Promise<Jobb> {
  const { id, skjema } = await versjon(TRENER, process.env.REPLICATE_RVC_TRAIN_VERSION)
  const input = tilpassInndata(skjema, {
    dataset_zip: datasettUrl,
    sample_rate: '48k',
    version: 'v2',
    f0method: 'rmvpe_gpu',
    epoch: opts.runder ?? 80,
    batch_size: 7,
  })
  if (!input.dataset_zip) throw new Error('Treneren tar ikke lenger imot dataset_zip — sjekk modellen hos Replicate.')
  const p = await kall('/predictions', { method: 'POST', body: JSON.stringify({ version: id, input }) })
  return { id: p.id, versjon: id }
}

/**
 * Gjør om en vokal (eller en hel låt) til sangerens stemme.
 * `halvtoner` flytter tonehøyden; 12 er en oktav. Godtar versjonen bare
 * valgliste (no-change / male-to-female / female-to-male), brukes den.
 */
export async function startKonvertering(lydUrl: string, modellUrl: string, opts: { halvtoner?: number } = {}): Promise<Jobb> {
  const { id, skjema } = await versjon(KONVERTERER, process.env.REPLICATE_RVC_CONVERT_VERSION)
  const h = Math.round(opts.halvtoner ?? 0)
  const tonevalg = lovligeVerdier(skjema, 'pitch_change')
  const pitch = tonevalg
    ? (h >= 12 ? 'male-to-female' : h <= -12 ? 'female-to-male' : 'no-change')
    : (skjema.properties.pitch_change?.type === 'integer' || skjema.properties.pitch_change?.type === 'number' ? h / 12 : undefined)
  const input = tilpassInndata(skjema, {
    song_input: lydUrl,
    rvc_model: 'CUSTOM',
    custom_rvc_model_download_url: modellUrl,
    // Bare vokalen. pitch_change_all flytter også musikken, og det vil vi ikke.
    pitch_change: pitch,
    f0_method: 'rmvpe',
    index_rate: 0.5,
    protect: 0.33,
    output_format: 'mp3',
  })
  if (!input.song_input || !input.custom_rvc_model_download_url) {
    throw new Error('Konverteringsmodellen har endret feltene sine — sjekk den hos Replicate før vi sender noe.')
  }
  const p = await kall('/predictions', { method: 'POST', body: JSON.stringify({ version: id, input }) })
  return { id: p.id, versjon: id }
}

export type JobbStatus = { status: 'venter' | 'ferdig' | 'feilet'; utdata: string | null; feil: string | null; sekunder: number | null }

/** Hvor jobben står. `utdata` er en adresse som slettes hos Replicate etter en time. */
export async function hentJobb(id: string): Promise<JobbStatus> {
  const p = await kall(`/predictions/${encodeURIComponent(id)}`)
  const ut = Array.isArray(p.output) ? p.output[p.output.length - 1] : p.output
  const s = p.status as string
  return {
    status: s === 'succeeded' ? 'ferdig' : s === 'failed' || s === 'canceled' ? 'feilet' : 'venter',
    utdata: typeof ut === 'string' ? ut : null,
    feil: p.error ? String(p.error).slice(0, 300) : s === 'canceled' ? 'Avbrutt' : null,
    sekunder: p.metrics?.predict_time != null ? Number(p.metrics.predict_time) : null,
  }
}
