import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getTenant } from '@/lib/tenantServer'
import { isTenantAdmin } from '@/lib/voiceBank'

// Kundens forespørsel om lisens (migrasjon 090).
//
// 🔑 HVORFOR DENNE FINNES. Produksjonsflaten stenger «Produser» uten hjemmel
// og lenket til «Opprett lisens» — inn i ADMIN. En ekte kunde fikk 403 og en
// tom flate. Porten var riktig; døra på utsiden av den fantes ikke.
//
// Lisenser skal fortsatt opprettes i admin: takstkortet er en
// tilbudsgenerator, ikke en prisliste, og satsene forhandles. Kunden ber; vi
// svarer med et tilbud. Denne raden er SPØRSMÅLET, ikke avtalen.
//
// 🔑 FELTENE ER TAKSTKORTETS AKSER. En utfylt forespørsel mates rett inn i
// foreslaaPris() uten at noen oversetter for hånd.

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
  )
}

const LOVLIG = {
  asset_type: ['voice', 'face', 'both'],
  media_class: ['internal', 'online', 'broadcast'],
  territory: ['no', 'nordic', 'world'],
  exclusivity: ['none', 'category', 'full'],
} as const

/** Hvem spør? E-post og id fra verifisert JWT — aldri fra klientdata. */
async function hvemSpor(request: Request) {
  const auth = request.headers.get('authorization')
  if (!auth?.startsWith('Bearer ')) return null
  const { data } = await admin().auth.getUser(auth.slice(7))
  const u = data?.user
  return u?.id ? { id: u.id, email: u.email ?? null } : null
}

/**
 * Kundens organisasjon PÅ DETTE DOMENET — ikke den eldste hen eier.
 * Samme regel som saldoen bruker: uten den ville en kunde med flere
 * organisasjoner fått forespørselen ført på feil konto.
 */
async function orgFor(userId: string, tenantId: string): Promise<string | null> {
  const { data } = await admin()
    .from('organizations').select('id, tenant_id').eq('owner_id', userId)
    .order('created_at', { ascending: true })
  const liste = data || []
  const traff = tenantId && tenantId !== 'root' ? liste.find((o) => o.tenant_id === tenantId) : null
  return (traff ?? liste[0])?.id ?? null
}

export async function POST(request: Request) {
  try {
    const tenant = await getTenant()
    const bruker = await hvemSpor(request)
    if (!bruker) return NextResponse.json({ error: 'Ikke innlogget' }, { status: 401 })

    const b = await request.json()
    const actorId = String(b.actorId || '')
    if (!actorId) return NextResponse.json({ error: 'Mangler actorId' }, { status: 400 })

    for (const [felt, lovlige] of Object.entries(LOVLIG)) {
      const v = b[felt.replace(/_(.)/g, (_, c) => c.toUpperCase())]
      if (!(lovlige as readonly string[]).includes(v)) {
        return NextResponse.json({ error: `Ugyldig eller manglende verdi for ${felt}` }, { status: 400 })
      }
    }
    const termMonths = Number(b.termMonths)
    if (![3, 12, 0].includes(termMonths)) {
      return NextResponse.json({ error: 'Ugyldig periode' }, { status: 400 })
    }

    // Skuespilleren må faktisk være tilgjengelig for denne kunden. Uten dette
    // kunne man be om lisens på en annen banks eksklusive rettighetshaver.
    const { getAvailableVoiceActors, getAvailableFaceActors } = await import('@/lib/voiceBank')
    const [stemmer, ansikter] = await Promise.all([
      getAvailableVoiceActors(tenant.id),
      getAvailableFaceActors(tenant.id),
    ])
    const actor = [...stemmer, ...ansikter].find((a) => a.id === actorId)
    if (!actor) return NextResponse.json({ error: 'Ukjent skuespiller, eller ikke tilgjengelig her' }, { status: 404 })

    const organizationId = await orgFor(bruker.id, tenant.id)

    const { data, error } = await admin().from('licence_requests').insert({
      actor_id: actorId,
      organization_id: organizationId,
      tenant_id: tenant.id !== 'root' ? tenant.id : null,
      requested_by: bruker.id,
      requested_email: bruker.email,
      asset_type: b.assetType,
      media_class: b.mediaClass,
      territory: b.territory,
      term_months: termMonths,
      exclusivity: b.exclusivity,
      note: b.note ? String(b.note).slice(0, 2000) : null,
    }).select('id').single()

    if (error) {
      // Den unike indeksen på (actor, org) der status='open'. Å svare «finnes
      // allerede» er riktigere enn å lage duplikat nummer fem: kunden har
      // spurt, og det som mangler er vårt svar — ikke enda et spørsmål.
      if (String(error.code) === '23505') {
        return NextResponse.json(
          { error: 'Dere har allerede en åpen forespørsel på denne rettighetshaveren. Vi svarer på den.', code: 'ALREADY_OPEN' },
          { status: 409 }
        )
      }
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ ok: true, id: data!.id })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

/**
 * GET — to lesere, to svar:
 *   admin          → alle forespørsler i denne banken
 *   innlogget kunde → kun sine egne (så flaten kan si «sendt», ikke «be om»)
 */
export async function GET(request: Request) {
  try {
    const tenant = await getTenant()
    const bruker = await hvemSpor(request)
    if (!bruker) return NextResponse.json({ requests: [] })

    const sp = new URL(request.url).searchParams
    const erAdmin = bruker.email ? await isTenantAdmin(bruker.email, tenant.id) : false

    let q = admin()
      .from('licence_requests')
      .select('id, actor_id, asset_type, media_class, territory, term_months, exclusivity, note, status, created_at, requested_email, organization_id')
      .order('created_at', { ascending: false })
      .limit(200)

    if (erAdmin) {
      if (tenant.id !== 'root') q = q.eq('tenant_id', tenant.id)
    } else {
      // ⚠️ Kunden filtreres på SIN EGEN bruker-id, ikke på noe klienten sender.
      q = q.eq('requested_by', bruker.id)
    }
    const actorId = sp.get('actorId')
    if (actorId) q = q.eq('actor_id', actorId)

    const { data, error } = await q
    if (error) return NextResponse.json({ requests: [], error: error.message })
    return NextResponse.json({ requests: data || [], isAdmin: erAdmin })
  } catch (err: any) {
    return NextResponse.json({ requests: [], error: err.message })
  }
}
