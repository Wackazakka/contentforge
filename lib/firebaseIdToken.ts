import { createPublicKey, createVerify } from 'crypto'

// Verifiserer et Firebase-ID-token fra en PARTNERS Firebase-prosjekt (Sangskaper,
// 2026-10-23) uten firebase-admin: RS256-signaturen sjekkes mot Googles JWKS, og
// iss/aud må peke på partnerens prosjekt. Ingen delt hemmelighet — tokenet er
// kundens egen innlogging hos partneren, og vi stoler bare på det Google har signert.
// JWKS caches i minnet (Google roterer nøklene, men sjelden; vi henter på nytt ved ukjent kid).

const JWKS_URL = 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'
const JWKS_TTL_MS = 60 * 60_000

type Jwk = { kid: string; kty: string; n: string; e: string; alg?: string }
let jwksCache: { keys: Jwk[]; fetchedAt: number } | null = null

async function loadJwks(force = false): Promise<Jwk[]> {
  if (!force && jwksCache && Date.now() - jwksCache.fetchedAt < JWKS_TTL_MS) return jwksCache.keys
  const r = await fetch(JWKS_URL, { cache: 'no-store' })
  if (!r.ok) throw new Error('Kunne ikke hente Googles nøkler')
  const d = (await r.json()) as { keys?: Jwk[] }
  jwksCache = { keys: d.keys || [], fetchedAt: Date.now() }
  return jwksCache.keys
}

function b64url(s: string): Buffer {
  return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64')
}

export type FirebaseIdentity = {
  uid: string
  email: string | null
  emailVerified: boolean
  name: string | null
}

export async function verifyFirebaseIdToken(token: string, projectId: string): Promise<FirebaseIdentity> {
  const parts = token.split('.')
  if (parts.length !== 3) throw new Error('Ugyldig token')
  const header = JSON.parse(b64url(parts[0]).toString('utf8')) as { alg?: string; kid?: string }
  if (header.alg !== 'RS256' || !header.kid) throw new Error('Ugyldig token-header')

  let key = (await loadJwks()).find((k) => k.kid === header.kid)
  if (!key) key = (await loadJwks(true)).find((k) => k.kid === header.kid)
  if (!key) throw new Error('Ukjent signeringsnøkkel')

  const pub = createPublicKey({ key: { kty: key.kty, n: key.n, e: key.e }, format: 'jwk' })
  const ok = createVerify('RSA-SHA256').update(`${parts[0]}.${parts[1]}`).verify(pub, b64url(parts[2]))
  if (!ok) throw new Error('Ugyldig signatur')

  const p = JSON.parse(b64url(parts[1]).toString('utf8')) as Record<string, unknown>
  const now = Math.floor(Date.now() / 1000)
  if (p.iss !== `https://securetoken.google.com/${projectId}`) throw new Error('Feil utsteder')
  if (p.aud !== projectId) throw new Error('Feil mottaker')
  if (typeof p.exp !== 'number' || p.exp < now) throw new Error('Tokenet er utløpt')
  if (typeof p.iat !== 'number' || p.iat > now + 300) throw new Error('Tokenet er ikke gyldig ennå')
  const uid = typeof p.sub === 'string' ? p.sub : typeof p.user_id === 'string' ? p.user_id : ''
  if (!uid) throw new Error('Tokenet mangler bruker-id')

  return {
    uid,
    email: typeof p.email === 'string' ? p.email.trim().toLowerCase() : null,
    emailVerified: p.email_verified === true,
    name: typeof p.name === 'string' ? p.name : null,
  }
}
