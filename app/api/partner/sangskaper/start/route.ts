import { NextResponse } from 'next/server'
import { getTenant } from '@/lib/tenantServer'
import { admin, resolveLocalUser, sessionTokenFor, SsoError, type Partner } from '@/lib/partnerSso'

// Overlevering fra Sangskaper (2026-10-23, herdet 25-10 etter Andreas' gjennomgang):
// kunden har kjøpt sangen OG «film av sangen» der (Vipps, hos Sangskaper).
// Sangskapers backend utsteder en ENGANGSKODE etter å ha sjekket at innlogget
// bruker eier sangen og at filmen er betalt; frontend POST-er koden hit. Vi
//   1) løser koden inn server-til-server hos Sangskaper (brukes én gang, 5 min)
//      og får e-post + sangen (tittel, MP3-URL, anledning) — ingen Firebase-token
//      forlater Sangskaper, og eierskapet er sjekket der
//   2) oppretter/kobler lokal konto (partnerSso), organisasjon på denne tenanten
//      og en anledning med riktig kategori
//   3) ber dropleten hente MP3-en inn i anledningens tracks-mappe, så filmsiden
//      velger den automatisk
//   4) svarer med en innloggings-URL (/sso?token_hash=…&next=…/film)
// Delt hemmelighet er valgfri: settes SANGSKAPER_PARTNER_SECRET her og
// ROPERT_PARTNER_SECRET i deres Secret Manager, kreves den ved innløsning.
// Filmen er gratis her (BILLING_ENABLED av) — betalt hos Sangskaper.

const SANGSKAPER_API = (process.env.SANGSKAPER_API_URL || 'https://sangskaper-api-351526496061.europe-north1.run.app').replace(/\/$/, '')
const PARTNER_SECRET = process.env.SANGSKAPER_PARTNER_SECRET || ''
const DROPLET_URL = 'http://139.59.212.218:3002'
const ALLOWED_ORIGINS = new Set([
  'https://sangskaper.no',
  'https://www.sangskaper.no',
  'https://sangskaper-staging.web.app',
  'http://localhost:5173',
  'http://localhost:5174',
])

const PARTNER: Partner = { id: 'sangskaper', tenantSlug: 'standardropert', name: 'Sangskaper', url: 'https://sangskaper.no' }

// Sangskapers anledninger → Roperts kategorier (lib/verticals.ts, celebration)
const CATEGORY_MAP: Record<string, string> = {
  bursdag: 'bursdag',
  bryllup: 'bryllup',
  jubileum: 'jubileum',
  konfirmasjon: 'konfirmasjon',
  daap: 'daap',
  nyfodt: 'gratulasjon',
  utdrikningslag: 'utdrikningslag',
  russ: 'annet',
  valentine: 'valentine',
  jul: 'jul',
  pensjon: 'jubileum',
  minne: 'annet',
  bedrift: 'bedrift',
}

function cors(origin: string | null) {
  const allow = origin && ALLOWED_ORIGINS.has(origin) ? origin : 'https://sangskaper.no'
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    Vary: 'Origin',
  }
}

export async function OPTIONS(request: Request) {
  return new NextResponse(null, { status: 204, headers: cors(request.headers.get('origin')) })
}

type Redeemed = {
  ok?: boolean
  reason?: string
  user?: { id: string; email: string | null; display_name: string | null; email_verified: boolean }
  song?: { clipId: string; title: string | null; audioUrl: string | null; occasion: string | null; filmPurchased: boolean }
}

export const maxDuration = 60

export async function POST(request: Request) {
  const headers = cors(request.headers.get('origin'))
  const fail = (status: number, error: string) => NextResponse.json({ error }, { status, headers })

  const tenant = await getTenant()
  if (tenant.slug !== PARTNER.tenantSlug) return fail(404, 'Overlevering fra Sangskaper er ikke aktivert her')

  let body: { code?: string } = {}
  try { body = await request.json() } catch { /* tom */ }
  if (!/^[a-f0-9]{64}$/.test(body.code || '')) return fail(400, 'Mangler eller ugyldig overleveringskode')

  // 1) Løs inn koden hos Sangskaper — de har alt sjekket eierskap og betaling
  let redeemed: Redeemed = {}
  try {
    const r = await fetch(`${SANGSKAPER_API}/api/partner/ropert/redeem`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(PARTNER_SECRET ? { 'X-Partner-Secret': PARTNER_SECRET } : {}) },
      body: JSON.stringify({ code: body.code }),
      cache: 'no-store',
    })
    redeemed = (await r.json().catch(() => ({}))) as Redeemed
  } catch {
    return fail(502, 'Sangskaper svarer ikke akkurat nå')
  }
  if (!redeemed.ok || !redeemed.user?.id || !redeemed.song) {
    return fail(400, redeemed.reason === 'invalid_or_used'
      ? 'Overleveringen er utløpt — gå tilbake til Sangskaper og trykk «Lag filmen» på nytt'
      : 'Overlevering fra Sangskaper feilet')
  }
  const { user: who, song } = redeemed
  if (!who.email) return fail(400, 'Sangskaper-kontoen mangler e-postadresse — legg inn e-post der først')
  if (song.filmPurchased !== true) return fail(402, 'Filmen er ikke betalt hos Sangskaper ennå')
  if (!song.audioUrl) return fail(409, 'Sangen mangler lydfil hos Sangskaper')

  try {
    // 2) Lokal konto + organisasjon på denne tenanten + anledning
    const { userId, email } = await resolveLocalUser(PARTNER, {
      id: who.id,
      email: who.email,
      display_name: who.display_name,
      email_verified: who.email_verified,
    })
    const sb = admin()
    let orgId: string | null = null
    {
      const { data: own } = await sb.from('organizations').select('id').eq('owner_id', userId).eq('tenant_id', tenant.id).limit(1)
      orgId = own?.[0]?.id ?? null
    }
    if (!orgId) {
      const base = who.display_name || email.split('@')[0] || 'Min'
      const { data: org, error: oErr } = await sb
        .from('organizations')
        .insert({
          name: base,
          owner_id: userId,
          slug: `${email.split('@')[0].toLowerCase().replace(/[^a-z0-9]/g, '-')}-${userId.substring(0, 8)}-${tenant.slug}`,
          description: `Fra Sangskaper (${PARTNER.id})`,
          tenant_id: tenant.id,
        })
        .select('id')
        .single()
      if (oErr || !org) throw new SsoError(500, 'Kunne ikke opprette arbeidsområdet: ' + (oErr?.message || ''))
      orgId = org.id
    }

    const title = (song.title || 'Sangen min').toString().slice(0, 120)
    const category = CATEGORY_MAP[(song.occasion || '').toLowerCase()] || 'annet'
    // Samme sang to ganger → gjenbruk anledningen (idempotent ved nytt klikk)
    const marker = `sangskaper:${song.clipId}`
    let productId: string | null = null
    {
      const { data: existing } = await sb.from('products').select('id').eq('organization_id', orgId).ilike('description', `%${marker}%`).limit(1)
      productId = existing?.[0]?.id ?? null
    }
    let imported = true
    if (!productId) {
      const { data: prod, error: pErr } = await sb
        .from('products')
        .insert({ organization_id: orgId, name: title, description: `Sang fra Sangskaper. ${marker}`, category, created_by: userId })
        .select('id')
        .single()
      if (pErr || !prod) throw new SsoError(500, 'Kunne ikke opprette anledningen: ' + (pErr?.message || ''))
      productId = prod.id

      // 3) Hent MP3-en inn i anledningens spor-mappe (dropleten laster ned fra URL-en)
      try {
        const ir = await fetch(`${DROPLET_URL}/music/import`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: song.audioUrl, folder: `tracks-${productId}`, name: title }),
        })
        imported = ir.ok
      } catch {
        imported = false
      }
    }

    // 4) Engangs-innlogging rett til filmsiden
    const token_hash = await sessionTokenFor(email)
    const next = `/dashboard/products/${productId}/film`
    // Bak Netlify er request.url permalinken, ikke tenant-domenet — bruk host-headeren.
    const host = request.headers.get('x-forwarded-host') || request.headers.get('host') || 'standardropert.norditech.io'
    const url = `https://${host}/sso?token_hash=${encodeURIComponent(token_hash)}&next=${encodeURIComponent(next)}`
    return NextResponse.json({ url, productId, imported }, { headers })
  } catch (e) {
    if (e instanceof SsoError) return fail(e.status, e.message)
    console.error('[partner/sangskaper] feil:', e instanceof Error ? e.message : e)
    return fail(500, 'Kunne ikke gjøre klar overleveringen')
  }
}
