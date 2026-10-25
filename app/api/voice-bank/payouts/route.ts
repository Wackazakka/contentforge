import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getTenant } from '@/lib/tenantServer'
import { isTenantAdmin } from '@/lib/voiceBank'
import { actorSettlement, agencySettlements, kr } from '@/lib/actorLedger'
import { fordelUtbetaling } from '@/lib/byraaOppgjoer'

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
  )
}

// Utbetalinger til rettighetshaver — den andre halvdelen av hovedboken.
//
// voice_usage_events sier hva som er OPPTJENT. actor_payouts sier hva som er
// BETALT. Differansen er «til gode», og uten dette viste avregningen samme
// beløp om igjen måned etter måned.
//
// Hvem betaler: den som har avtalen med rettighetshaveren (avtalens pkt. 7) —
// altså eiertenanten. Derfor host-tenant + admin-sjekk, ikke rot-admin slik
// partner_payouts har. Skuespilleren må være tenantens egen.

async function guard(request: Request) {
  const tenant = await getTenant()
  if (tenant.id === 'root') return { fail: NextResponse.json({ error: 'Tenant-oppsett mangler' }, { status: 404 }) }
  let email: string | null = null
  const auth = request.headers.get('authorization')
  if (auth?.startsWith('Bearer ')) {
    const { data } = await admin().auth.getUser(auth.slice(7))
    email = data?.user?.email ?? null
  }
  if (!email) return { fail: NextResponse.json({ error: 'Ikke innlogget' }, { status: 401 }) }
  if (!(await isTenantAdmin(email, tenant.id))) return { fail: NextResponse.json({ error: 'Ingen admin-tilgang' }, { status: 403 }) }
  return { tenant, email }
}

async function ownActor(tenantId: string, actorId: string) {
  const { data } = await admin()
    .from('voice_actors').select('id').eq('id', actorId).eq('owner_tenant_id', tenantId).single()
  return data
}

const isoDag = (d: Date) => d.toISOString().slice(0, 10)

// Utbetalingslisten (Lars 17/9): alle rettighetshavere i banken med hva de har
// til gode AKKURAT NÅ. «Til gode» er kumulativt (opptjent − betalt, summert i
// databasen), så listen trenger ingen skjæringsdato for å være eksakt: det som
// står her er det som skyldes, uansett når sist det ble betalt.
// Perioden per rad er informasjon til rettighetshaveren: fra dagen etter forrige
// utbetalings periode (eller første bruk) til i dag.
async function utbetalingsliste(tenantId: string) {
  const supabase = admin()
  const { data: actors } = await supabase
    .from('voice_actors')
    .select('id, name, actor_email, is_active')
    .eq('owner_tenant_id', tenantId)
    .order('name')
  const idag = isoDag(new Date())
  const rader = await Promise.all((actors || []).map(async (a) => {
    const [s, first] = await Promise.all([
      actorSettlement(a.id as string),
      supabase.from('voice_usage_events').select('created_at').eq('actor_id', a.id).order('created_at', { ascending: true }).limit(1),
    ])
    const sisteTil = s.payouts.reduce<string | null>((m, p) => (!m || p.periode_til > m ? p.periode_til : m), null)
    let fra: string
    if (sisteTil) {
      const d = new Date(sisteTil + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + 1); fra = isoDag(d)
    } else {
      const f = first.data?.[0]?.created_at as string | undefined
      fra = f ? String(f).slice(0, 10) : idag
    }
    if (fra > idag) fra = idag
    return {
      actorId: a.id as string,
      name: a.name as string,
      email: (a.actor_email as string | null) ?? null,
      isActive: !!a.is_active,
      uses: s.uses,
      earnedNok: s.earnedNok,
      paidNok: s.paidNok,
      // Til gode er hennes del (117). Byråets andel av det samme beløpet står
      // ved siden av — to overføringer, ikke én.
      dueNok: s.dueNok,
      dueGrossNok: s.dueGrossNok,
      dueAgentNok: s.dueAgentNok,
      agency: s.agency ? { name: s.agency.name, pct: s.agency.pct } : null,
      periodeFra: fra,
      periodeTil: idag,
      sistUtbetalt: s.payouts[0]?.betalt_dato ?? null,
    }
  }))
  return rader
}

export async function GET(request: Request) {
  const g = await guard(request)
  if (g.fail) return g.fail
  const params = new URL(request.url).searchParams
  if (params.get('liste')) {
    const [rader, byraaer] = await Promise.all([utbetalingsliste(g.tenant!.id), agencySettlements(g.tenant!.id)])
    return NextResponse.json({
      tenant: { name: g.tenant!.app_name },
      rader,
      totalDueNok: kr(rader.reduce((sum, r) => sum + r.dueNok, 0)),
      // Byråene (097/117): det som er frosset på skuespillernes utbetalinger
      // og ikke betalt videre. Det som venter på neste avregning står på
      // skuespillerradene (dueAgentNok), ikke her.
      byraaer,
    })
  }
  const actorId = params.get('actorId')
  if (!actorId) return NextResponse.json({ error: 'Mangler actorId' }, { status: 400 })
  if (!(await ownActor(g.tenant!.id, actorId))) {
    return NextResponse.json({ error: 'Skuespilleren finnes ikke i denne banken' }, { status: 404 })
  }
  return NextResponse.json(await actorSettlement(actorId))
}

export async function POST(request: Request) {
  const g = await guard(request)
  if (g.fail) return g.fail
  const body = await request.json().catch(() => ({}))
  const datoOk = (s: unknown) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s)

  // Byråets oppgjør (097/117): én overføring per byrå per periode. Beløpet
  // valideres mot det som er frosset på skuespillernes utbetalinger; den unike
  // indeksen på (byrå, bank, periode) stopper et dobbeltklikk.
  if (body?.agentPayout) {
    const p = body.agentPayout as Record<string, unknown>
    const agentId = String(p.agentId || '')
    const amount = Number(p.amountNok)
    if (!datoOk(p.periodeFra) || !datoOk(p.periodeTil) || String(p.periodeTil) < String(p.periodeFra)) {
      return NextResponse.json({ error: 'Ugyldig periode' }, { status: 400 })
    }
    if (!Number.isFinite(amount) || amount <= 0) return NextResponse.json({ error: 'Ugyldig beløp' }, { status: 400 })
    const byraa = (await agencySettlements(g.tenant!.id)).find((b) => b.agentId === agentId)
    if (!byraa) return NextResponse.json({ error: 'Byrået finnes ikke i denne banken' }, { status: 404 })
    if (amount > byraa.dueNok + 0.005) {
      return NextResponse.json({ error: `${byraa.name} har ${byraa.dueNok} kr til gode, ikke ${kr(amount)}. Last listen på nytt.`, code: 'STALE_LIST' }, { status: 409 })
    }
    const { error } = await admin().from('talent_agent_payouts').insert({
      talent_agent_id: agentId, tenant_id: g.tenant!.id,
      periode_fra: p.periodeFra, periode_til: p.periodeTil,
      amount_nok: kr(amount), betalt_dato: isoDag(new Date()),
      note: body.note ? String(body.note).slice(0, 300) : null, created_by: g.email,
    })
    if (error) {
      const dobbel = /duplicate|unik|unique/i.test(error.message)
      return NextResponse.json({ error: dobbel ? 'Byrået har alt et oppgjør for denne perioden' : error.message }, { status: dobbel ? 409 : 500 })
    }
    return NextResponse.json({ ok: true, sumNok: kr(amount) })
  }

  // Masseføring fra utbetalingslisten: mange rettighetshavere i ETT kall, ÉN
  // insert (alt eller ingenting). Hvert beløp valideres mot hovedboken på
  // serveren: det kan aldri føres mer enn det som faktisk står til gode. Det
  // er også dobbeltklikk-vernet — etter første føring er «til gode» null, og
  // samme forespørsel en gang til blir avvist i stedet for ført dobbelt.
  if (Array.isArray(body?.items)) {
    const items = (body.items as Array<Record<string, unknown>>).slice(0, 500)
    if (items.length === 0) return NextResponse.json({ error: 'Ingen valgt' }, { status: 400 })
    const ids = items.map((i) => String(i.actorId || ''))
    if (new Set(ids).size !== ids.length) return NextResponse.json({ error: 'Samme rettighetshaver står to ganger' }, { status: 400 })
    const { data: own } = await admin().from('voice_actors').select('id, name').in('id', ids).eq('owner_tenant_id', g.tenant!.id)
    const navn = new Map((own || []).map((a) => [a.id as string, a.name as string]))
    if (navn.size !== ids.length) return NextResponse.json({ error: 'Én eller flere finnes ikke i denne banken' }, { status: 404 })

    const rows = []
    for (const i of items) {
      const id = String(i.actorId)
      const amount = Number(i.amountNok)
      if (!Number.isFinite(amount) || amount <= 0) return NextResponse.json({ error: `Ugyldig beløp for ${navn.get(id)}` }, { status: 400 })
      if (!datoOk(i.periodeFra) || !datoOk(i.periodeTil) || String(i.periodeTil) < String(i.periodeFra)) {
        return NextResponse.json({ error: `Ugyldig periode for ${navn.get(id)}` }, { status: 400 })
      }
      const s = await actorSettlement(id)
      // Brutto, byråets andel og grunnlaget fryses her (117) — regnet på
      // serveren, aldri tatt fra klienten.
      const felter = fordelUtbetaling(s.tilGode, amount)
      if (!felter) {
        return NextResponse.json({
          error: `${navn.get(id)} har ${s.dueNok} kr til gode, ikke ${kr(amount)}. Listen er utdatert — last den på nytt.`,
          code: 'STALE_LIST',
        }, { status: 409 })
      }
      rows.push({
        actor_id: id,
        tenant_id: g.tenant!.id,
        periode_fra: i.periodeFra,
        periode_til: i.periodeTil,
        ...felter,
        talent_agent_id: felter.agent_cut_nok > 0 ? s.agency?.id ?? null : null,
        note: body.note ? String(body.note).slice(0, 300) : null,
        created_by: g.email,
      })
    }
    const { error } = await admin().from('actor_payouts').insert(rows)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({
      ok: true, antall: rows.length,
      sumNok: kr(rows.reduce((s, r) => s + r.amount_nok, 0)),
      byraaNok: kr(rows.reduce((s, r) => s + r.agent_cut_nok, 0)),
    })
  }

  const { actorId, periodeFra, periodeTil, amountNok, note } = body || {}

  if (!actorId) return NextResponse.json({ error: 'Mangler actorId' }, { status: 400 })
  if (!datoOk(periodeFra) || !datoOk(periodeTil)) {
    return NextResponse.json({ error: 'Periode må være to datoer (ÅÅÅÅ-MM-DD)' }, { status: 400 })
  }
  if (periodeTil < periodeFra) return NextResponse.json({ error: 'Perioden slutter før den begynner' }, { status: 400 })
  const amount = Number(amountNok)
  if (!Number.isFinite(amount) || amount <= 0) return NextResponse.json({ error: 'Ugyldig beløp' }, { status: 400 })
  if (!(await ownActor(g.tenant!.id, actorId))) {
    return NextResponse.json({ error: 'Skuespilleren finnes ikke i denne banken' }, { status: 404 })
  }

  // Samme fordeling som listen (117): beløpet er hennes del, byråets andel og
  // brutto regnes og fryses her. Mer enn til gode kan ikke føres.
  const s = await actorSettlement(actorId)
  const felter = fordelUtbetaling(s.tilGode, amount)
  if (!felter) return NextResponse.json({ error: `Hun har ${s.dueNok} kr til gode, ikke ${kr(amount)}.` }, { status: 409 })

  const { error } = await admin().from('actor_payouts').insert({
    actor_id: actorId,
    tenant_id: g.tenant!.id,
    periode_fra: periodeFra,
    periode_til: periodeTil,
    ...felter,
    talent_agent_id: felter.agent_cut_nok > 0 ? s.agency?.id ?? null : null,
    note: note ? String(note).slice(0, 300) : null,
    created_by: g.email,
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
