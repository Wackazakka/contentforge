import { NextResponse } from 'next/server'
import { getTenant } from '@/lib/tenantServer'
import { admin, resolveLocalUser, sessionTokenFor, SsoError, type Partner } from '@/lib/partnerSso'
import { verifyFirebaseIdToken } from '@/lib/firebaseIdToken'

// Overlevering fra Sangskaper (2026-10-23): kunden har kjøpt sangen OG «film av
// sangen» der (Vipps, hos Sangskaper). Sangskapers frontend POST-er kundens
// Firebase-ID-token + clipId hit. Vi
//   1) verifiserer tokenet mot Googles nøkler (prosjekt sangskaper-1) → e-post
//   2) henter sangen fra Sangskapers offentlige /api/song-details og krever
//      filmPurchased — betalingsbeviset kommer fra DERES server, ikke klienten
//   3) oppretter/kobler lokal konto (partnerSso), organisasjon på denne tenanten
//      og en anledning med riktig kategori
//   4) ber dropleten hente MP3-en inn i anledningens tracks-mappe, så filmsiden
//      velger den automatisk
//   5) svarer med en innloggings-URL (/sso?token_hash=…&next=…/film)
// Ingen delt hemmelighet: tokenet er Google-signert, og filmPurchased leses fra
// Sangskapers API. Filmen er gratis her (BILLING_ENABLED av) — betalt hos dem.

const SANGSKAPER_API = (process.env.SANGSKAPER_API_URL || 'https://sangskaper-api-351526496061.europe-north1.run.app').replace(/\/$/, '')
const SANGSKAPER_PROJECT = process.env.SANGSKAPER_FIREBASE_PROJECT || 'sangskaper-1'
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

type SongDetails = {
  sunoClipId: string
  audioUrl: string | null
  titleFromSuno?: string
  aiGeneratedTitleForJob?: string | null
  filmPurchased?: boolean
  occasion?: string | null
}

export const maxDuration = 60

export async function POST(request: Request) {
  const headers = cors(request.headers.get('origin'))
  const fail = (status: number, error: string) => NextResponse.json({ error }, { status, headers })

  const tenant = await getTenant()
  if (tenant.slug !== PARTNER.tenantSlug) return fail(404, 'Overlevering fra Sangskaper er ikke aktivert her')

  let body: { idToken?: string; clipId?: string } = {}
  try { body = await request.json() } catch { /* tom */ }
  if (!body.idToken || !body.clipId || !/^[A-Za-z0-9_-]{6,80}$/.test(body.clipId)) return fail(400, 'Mangler idToken eller clipId')

  // 1) Hvem er kunden?
  let who
  try {
    who = await verifyFirebaseIdToken(body.idToken, SANGSKAPER_PROJECT)
  } catch (e) {
    return fail(401, `Innloggingen hos Sangskaper kunne ikke bekreftes (${e instanceof Error ? e.message : 'ukjent feil'})`)
  }
  if (!who.email) return fail(400, 'Sangskaper-kontoen mangler e-postadresse — legg inn e-post der først')

  // 2) Er filmen betalt? Svaret kommer fra Sangskapers server.
  let song: SongDetails
  try {
    const r = await fetch(`${SANGSKAPER_API}/api/song-details/${encodeURIComponent(body.clipId)}?t=${Date.now()}`, { cache: 'no-store' })
    if (r.status === 403) return fail(402, 'Sangen er ikke kjøpt hos Sangskaper ennå')
    if (!r.ok) return fail(502, 'Sangskaper svarer ikke akkurat nå')
    song = (await r.json()) as SongDetails
  } catch {
    return fail(502, 'Sangskaper svarer ikke akkurat nå')
  }
  if (song.filmPurchased !== true) return fail(402, 'Filmen er ikke betalt hos Sangskaper ennå')
  if (!song.audioUrl) return fail(409, 'Sangen mangler lydfil hos Sangskaper')

  try {
    // 3) Lokal konto + organisasjon på denne tenanten + anledning
    const { userId, email } = await resolveLocalUser(PARTNER, {
      id: who.uid,
      email: who.email,
      display_name: who.name,
      email_verified: who.emailVerified,
    })
    const sb = admin()
    let orgId: string | null = null
    {
      const { data: own } = await sb.from('organizations').select('id').eq('owner_id', userId).eq('tenant_id', tenant.id).limit(1)
      orgId = own?.[0]?.id ?? null
    }
    if (!orgId) {
      const base = who.name || email.split('@')[0] || 'Min'
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

    const title = (song.aiGeneratedTitleForJob || song.titleFromSuno || 'Sangen min').toString().slice(0, 120)
    const category = CATEGORY_MAP[(song.occasion || '').toLowerCase()] || 'annet'
    // Samme sang to ganger → gjenbruk anledningen (idempotent ved nytt klikk)
    const marker = `sangskaper:${song.sunoClipId || body.clipId}`
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

      // 4) Hent MP3-en inn i anledningens spor-mappe (dropleten laster ned fra URL-en)
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

    // 5) Engangs-innlogging rett til filmsiden
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
