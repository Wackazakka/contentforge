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

/**
 * Varsle bankens admins om en ny forespørsel.
 *
 * Adressene hentes fra `tenants.admin_emails` OPPOVER I KJEDEN — samme liste
 * som `isTenantAdmin` sjekker mot. Da kan ikke varselet og tilgangen komme i
 * utakt: den som har lov til å svare, er den som får beskjed.
 *
 * Feiler stille, med vilje. Raden er lagret før dette kalles.
 */
async function varsleAdmins(i: {
  tenantId: string
  requestId: string
  actorId: string
  actorName: string
  kundeEpost: string | null
  akser: string
  note: string | null
}): Promise<void> {
  try {
    if (!process.env.RESEND_API_KEY) return
    const { tenantChainUp } = await import('@/lib/voiceBank')
    const kjede = i.tenantId !== 'root' ? await tenantChainUp(i.tenantId) : []
    if (kjede.length === 0) return

    const { data: tenants } = await admin()
      .from('tenants').select('id, app_name, admin_emails, custom_domain, slug').in('id', kjede)
    const rader = tenants || []
    const mottakere = [...new Set(
      rader.flatMap((t) => (Array.isArray(t.admin_emails) ? t.admin_emails : []))
        .map((e: unknown) => String(e).trim()).filter((e) => e.includes('@'))
    )]
    if (mottakere.length === 0) return

    const egen = rader.find((t) => t.id === i.tenantId)
    const merke = egen?.app_name || 'TwinLedger'
    const vert = egen?.custom_domain
      ? `https://${egen.custom_domain}`
      : `https://${egen?.slug || 'twinledger'}.norditech.io`
    // Rett inn i tilbudsskjemaet, med forespørselen forhåndsutfylt.
    const lenke = `${vert}/dashboard/voice-bank/${i.actorId}/lisenser?forespoersel=${i.requestId}`

    const { Resend } = await import('resend')
    await new Resend(process.env.RESEND_API_KEY).emails.send({
      from: `${merke} <hello@centerforge.app>`,
      to: mottakere,
      subject: `Lisensforespørsel: ${i.actorName}`,
      html: `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#1C1A16">
        <h2 style="margin:0 0 12px">Ny lisensforespørsel</h2>
        <p style="margin:0 0 4px"><strong>${i.actorName}</strong></p>
        <p style="margin:0 0 4px;color:#6B6358">Fra: ${i.kundeEpost || 'ukjent kunde'}</p>
        <p style="margin:0 0 16px;color:#6B6358">${i.akser}</p>
        ${i.note ? `<p style="margin:0 0 16px;font-style:italic">«${i.note}»</p>` : ''}
        <p style="margin:24px 0"><a href="${lenke}" style="background:#C5451B;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600">Lag tilbud</a></p>
        <p style="color:#6B6358;font-size:13px">Produksjon med denne rettighetshaveren er stengt hos kunden til lisensen er på plass.</p>
      </div>`,
    })
  } catch { /* e-post feiler stille — raden er allerede lagret */ }
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

    // ⚠️ VARSEL ETTER LAGRING, OG DET MÅ ALDRI VELTE FORESPØRSELEN. Raden er
    // det som betyr noe; e-posten er en bekvemmelighet. Feiler Resend, skal
    // kunden fortsatt ha fått sendt — køen i adminen viser den uansett.
    //
    // Uten dette varselet venter den første ekte forespørselen til noen
    // tilfeldigvis ser på bankforsiden, og en kunde med en stanset produksjon
    // tror hen ble oversett.
    varsleAdmins({
      tenantId: tenant.id,
      requestId: data!.id,
      actorId,
      actorName: actor.name,
      kundeEpost: bruker.email,
      akser: `${b.assetType} · ${b.mediaClass} · ${b.territory} · ${termMonths === 0 ? 'uten sluttdato' : `${termMonths} mnd`} · eksklusivitet: ${b.exclusivity}`,
      note: b.note ? String(b.note).slice(0, 500) : null,
    }).catch(() => { /* se over */ })

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
    // Én bestemt forespørsel — brukes til å forhåndsutfylle tilbudsskjemaet.
    // Filtreringen over staar fortsatt: en kunde naar bare sine egne.
    const id = sp.get('id')
    if (id) q = q.eq('id', id)

    const { data, error } = await q
    if (error) return NextResponse.json({ requests: [], error: error.message })
    return NextResponse.json({ requests: data || [], isAdmin: erAdmin })
  } catch (err: any) {
    return NextResponse.json({ requests: [], error: err.message })
  }
}

/**
 * PATCH — lukk sløyfa når et tilbud er laget.
 *
 * 🔑 UTEN DENNE BLIR KØEN ALDRI KORTERE. En forespørsel som er besvart, men
 * fortsatt staar som «open», gjør at neste forespørsel fra samme kunde
 * avvises som duplikat — og adminen slutter å stole på tallet i køen.
 *
 * Kun admins. Statusen er det eneste som kan endres; aksene er kundens ord og
 * skal ikke kunne skrives om av oss i ettertid.
 */
export async function PATCH(request: Request) {
  try {
    const tenant = await getTenant()
    const bruker = await hvemSpor(request)
    if (!bruker) return NextResponse.json({ error: 'Ikke innlogget' }, { status: 401 })
    if (!bruker.email || !(await isTenantAdmin(bruker.email, tenant.id))) {
      return NextResponse.json({ error: 'Ingen admin-tilgang' }, { status: 403 })
    }

    const b = await request.json()
    const id = String(b.id || '')
    const status = String(b.status || '')
    if (!id) return NextResponse.json({ error: 'Mangler id' }, { status: 400 })
    if (!['open', 'quoted', 'closed'].includes(status)) {
      return NextResponse.json({ error: 'Ugyldig status' }, { status: 400 })
    }

    const { error } = await admin()
      .from('licence_requests')
      .update({
        status,
        licence_id: b.licenceId ? String(b.licenceId) : null,
        handled_at: status === 'open' ? null : new Date().toISOString(),
      })
      .eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
