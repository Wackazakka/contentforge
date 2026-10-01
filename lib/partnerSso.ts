import { createClient } from '@supabase/supabase-js'
import { randomBytes, timingSafeEqual } from 'crypto'

// Partner-innlogging (2026-10-01): samme konto på promo.indigoboom.no og IndigoBoom Shootout.
// Speiler apop-showdown/netlify/functions/lib/partnerSso.js. Tre trinn, begge veier:
//   start  → innlogget bruker får en engangskode og sendes til partnerens /sso?code=…
//   redeem → partneren kaller oss server-til-server (delt hemmelighet) og får identiteten
//   finish → en kode partneren utstedte løses inn der, og knyttes til en lokal konto
// Koder lever 5 minutter og brukes nøyaktig én gang (betinget UPDATE som lås).
// Knyttet til tenant: bare tenanten som eier partneren ser knappen og kan starte.

export type Partner = { id: string; tenantSlug: string; name: string; url: string | null }

export const PARTNERS: Partner[] = [
  { id: 'shootout', tenantSlug: 'indigoboom', name: 'IndigoBoom Shootout', url: (process.env.SHOOTOUT_URL || '').replace(/\/$/, '') || null },
]
export const CODE_TTL_MS = 5 * 60_000
const SECRET = process.env.PARTNER_SSO_SECRET || ''

export function partnerForTenant(slug: string): Partner | null {
  const p = PARTNERS.find((x) => x.tenantSlug === slug)
  return p && p.url && SECRET ? p : null
}

export function secretMatches(given: string | null): boolean {
  if (!given || !SECRET) return false
  const a = Buffer.from(given), b = Buffer.from(SECRET)
  return a.length === b.length && timingSafeEqual(a, b)
}

export function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || '', process.env.SUPABASE_SERVICE_ROLE_KEY || '')
}

export type Identity = { id: string; email: string; display_name: string | null; email_verified: boolean }

export async function issueCode(user: { id: string; email?: string; email_confirmed_at?: string | null; user_metadata?: Record<string, unknown> }, audience: string): Promise<string> {
  const code = randomBytes(32).toString('hex')
  const { error } = await admin().from('partner_sso_codes').insert({
    code,
    user_id: user.id,
    email: user.email,
    display_name: (user.user_metadata?.full_name as string | undefined) || null,
    email_verified: !!user.email_confirmed_at,
    audience,
    expires_at: new Date(Date.now() + CODE_TTL_MS).toISOString(),
  })
  if (error) throw new Error('could not issue code: ' + error.message)
  return code
}

export async function redeemCode(code: string): Promise<Identity | null> {
  if (!/^[a-f0-9]{64}$/.test(code || '')) return null
  const { data, error } = await admin()
    .from('partner_sso_codes')
    .update({ used_at: new Date().toISOString() })
    .eq('code', code)
    .is('used_at', null)
    .gt('expires_at', new Date().toISOString())
    .select('user_id, email, display_name, email_verified')
  if (error) throw new Error('redeem failed: ' + error.message)
  const row = data?.[0]
  return row ? { id: row.user_id, email: row.email, display_name: row.display_name, email_verified: row.email_verified } : null
}

export class SsoError extends Error { constructor(public status: number, message: string) { super(message) } }

// Partneridentitet → lokal konto. Kjent kobling → den brukeren; ellers opprett konto (finnes
// e-posten alt → koble, men KUN når partneren har verifisert adressen, så en fremmed ikke kan
// overta en lokal konto ved å registrere e-posten der borte).
export async function resolveLocalUser(partner: Partner, identity: Identity): Promise<{ userId: string; email: string; created: boolean }> {
  const sb = admin()
  const { data: link } = await sb.from('partner_links').select('user_id, email').eq('partner_id', partner.id).eq('partner_user_id', identity.id).maybeSingle()
  if (link) return { userId: link.user_id, email: link.email, created: false }

  const email = String(identity.email || '').trim().toLowerCase()
  if (!email) throw new SsoError(400, 'Partnerkontoen mangler e-postadresse')
  const { data: created, error: cErr } = await sb.auth.admin.createUser({
    email,
    email_confirm: !!identity.email_verified,
    user_metadata: { full_name: identity.display_name || '', tenant_slug: partner.tenantSlug, partner_id: partner.id },
  })
  let userId: string
  if (!cErr) userId = created.user.id
  else if (/already|exists|registered/i.test(cErr.message)) {
    if (!identity.email_verified) throw new SsoError(409, `En konto med denne e-posten finnes her fra før. Bekreft e-posten din hos ${partner.name} først, eller logg inn med passord.`)
    const { data: g, error: gErr } = await sb.auth.admin.generateLink({ type: 'magiclink', email })
    if (gErr || !g?.user) throw new SsoError(500, 'Fant ikke kontoen')
    userId = g.user.id
  } else throw new SsoError(500, 'Kunne ikke opprette kontoen: ' + cErr.message)

  const { error: lErr } = await sb.from('partner_links').insert({ partner_id: partner.id, partner_user_id: identity.id, user_id: userId, email })
  if (lErr && !/duplicate|unique/i.test(lErr.message)) throw new SsoError(500, 'Kunne ikke koble kontoen: ' + lErr.message)
  return { userId, email, created: !cErr }
}

export async function sessionTokenFor(email: string): Promise<string> {
  const { data, error } = await admin().auth.admin.generateLink({ type: 'magiclink', email })
  if (error || !data?.properties?.hashed_token) throw new SsoError(500, 'Kunne ikke starte økten')
  return data.properties.hashed_token
}
