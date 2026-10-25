import { createHmac } from 'crypto'

// Klient mot dropletens ansiktstjeneste (/opt/twinledger-embed, :8790).
//
// 🔑 SIGNERT, IKKE BAERER-NOEKKEL. Netlify snakker til dropleten over vanlig
// HTTP (samme moenster som musikktjenesten paa :3002). En noekkel i en header
// kunne sniffes; en HMAC over "<tidsstempel>.<kropp>" kan ikke brukes til
// noe annet enn nettopp denne forespoerselen, i fem minutter.
//
// FEILER AAPENT. Er tjenesten nede, skal leveringen likevel gaa gjennom —
// identitetssjekken er en vurdering paa toppen av leveringen, ikke en port
// foran den. Kalleren fanger og lagrer feilen paa bilderaden, saa det er
// synlig at sjekken mangler, ikke stille borte.

export interface Ansikt { bbox: number[]; det_score: number; embedding: number[] }
export interface FaceSvar { faces: Ansikt[]; width?: number; height?: number; model?: string; error?: string }

export function embedKonfigurert(): boolean {
  return !!(process.env.EMBED_URL && process.env.EMBED_SECRET)
}

export async function hentAnsikter(bildeUrl: string, timeoutMs = 45000): Promise<FaceSvar> {
  const base = process.env.EMBED_URL
  const secret = process.env.EMBED_SECRET
  if (!base || !secret) throw new Error('EMBED_URL/EMBED_SECRET mangler')
  const kropp = JSON.stringify({ url: bildeUrl })
  const ts = String(Math.floor(Date.now() / 1000))
  const sig = createHmac('sha256', secret).update(`${ts}.${kropp}`).digest('hex')
  const r = await fetch(`${base.replace(/\/$/, '')}/face`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Timestamp': ts, 'X-Signature': sig },
    body: kropp,
    signal: AbortSignal.timeout(timeoutMs),
  })
  const tekst = await r.text()
  if (!r.ok) throw new Error(`embed ${r.status}: ${tekst.slice(0, 200)}`)
  return JSON.parse(tekst) as FaceSvar
}

/**
 * Fingeravtrykk (sha256) av en stor fil, regnet på dropleten (/hash).
 * Modellfiler er 100–350 MB: en Netlify-funksjon rekker ikke å hente og regne
 * på dem innen fristen, dropleten står i samme datasenter som lagringen. Gir
 * også safetensors-hodet (tensornavnene), så fila kan vurderes som LoRA.
 */
export interface HashSvar {
  sha256: string; bytes: number; safetensors: boolean; tensors: number
  sample_keys: string[]; metadata: Record<string, string> | null; error: string | null
}

export async function hentHash(filUrl: string, timeoutMs = 22000): Promise<HashSvar> {
  const base = process.env.EMBED_URL
  const secret = process.env.EMBED_SECRET
  if (!base || !secret) throw new Error('EMBED_URL/EMBED_SECRET mangler')
  const kropp = JSON.stringify({ url: filUrl })
  const ts = String(Math.floor(Date.now() / 1000))
  const sig = createHmac('sha256', secret).update(`${ts}.${kropp}`).digest('hex')
  const r = await fetch(`${base.replace(/\/$/, '')}/hash`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Timestamp': ts, 'X-Signature': sig },
    body: kropp,
    signal: AbortSignal.timeout(timeoutMs),
  })
  const tekst = await r.text()
  if (!r.ok) throw new Error(`hash ${r.status}: ${tekst.slice(0, 200)}`)
  return JSON.parse(tekst) as HashSvar
}
