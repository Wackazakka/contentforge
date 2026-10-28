import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getTenant } from '@/lib/tenantServer'
import { isTenantAdmin } from '@/lib/voiceBank'
import { kr } from '@/lib/byraaOppgjoer'
import { erBetaler, foreslaattBetaler, kanBetale, lesBeloep, lesDekning } from '@/lib/onboardingUtlegg'
import { UTLEGG_FELTER, tilUtlegg, utleggFor, utleggErSlaattPaa, avgiftFor } from '@/lib/onboardingServer'

// Stemmeabonnementet ved onboarding og påmeldingsavgiften (126, 28.10.2026).
//
// Pengene går ikke gjennom systemet, som ellers i utbetalingene: hun betaler
// abonnementet med sitt eget kort i møtet, du overfører refusjonen i
// nettbanken, og fører det her. Siden holder rede på hvem som skal ha pengene
// tilbake, og hvilke byråer som skal faktureres.
//
//   GET    ?actorId=   abonnementet hennes, hvem som skal dekke det, avgiften
//   GET    ?liste=1    alt som venter: refusjoner og byråfakturaer
//   POST   { actorId, amountNok, amountUsd?, payer?, note?, refunded? }
//   PATCH  { id, action: 'refunded' }       refusjonen er overført
//          { agentId, action: 'invoiced' }  byrået er fakturert for alt refundert
//          { actorId, action: 'waive_fee' } frita for påmeldingsavgiften
//   DELETE { id }                            feilregistrert, bare før refusjon

function db() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || '', process.env.SUPABASE_SERVICE_ROLE_KEY || '')
}

async function vakt(request: Request) {
  const tenant = await getTenant()
  if (tenant.id === 'root') return { fail: NextResponse.json({ error: 'Tenant-oppsett mangler' }, { status: 404 }) }
  const auth = request.headers.get('authorization')
  const email = auth?.startsWith('Bearer ') ? (await db().auth.getUser(auth.slice(7))).data?.user?.email ?? null : null
  if (!email) return { fail: NextResponse.json({ error: 'Ikke innlogget' }, { status: 401 }) }
  if (!(await isTenantAdmin(email, tenant.id))) return { fail: NextResponse.json({ error: 'Ingen admin-tilgang' }, { status: 403 }) }
  return { tenant, email }
}

const ikkeKjoert = () => NextResponse.json({
  error: 'Utleggsføringen er ikke slått på ennå (migrasjon 126 mangler).', code: 'NOT_ENABLED',
}, { status: 409 })

type Aktoer = { id: string; name: string; owner_tenant_id: string; talent_agent_id: string | null; wants_face: boolean | null }

async function egenAktoer(tenantId: string, actorId: unknown): Promise<Aktoer | null> {
  if (typeof actorId !== 'string' || !actorId) return null
  const { data } = await db().from('voice_actors')
    .select('id, name, owner_tenant_id, talent_agent_id, wants_face').eq('id', actorId).eq('owner_tenant_id', tenantId).maybeSingle()
  return (data as Aktoer | null) ?? null
}

async function byraaFor(agentId: string | null) {
  if (!agentId) return null
  const { data, error } = await db().from('talent_agents').select('id, name, covers_onboarding').eq('id', agentId).maybeSingle()
  if (error) {
    // Før 126 finnes ikke kolonnen — byrået finnes likevel.
    const { data: d2 } = await db().from('talent_agents').select('id, name').eq('id', agentId).maybeSingle()
    return d2 ? { id: d2.id as string, name: d2.name as string, covers_onboarding: 'platform' } : null
  }
  return data ? { id: data.id as string, name: data.name as string, covers_onboarding: lesDekning(data.covers_onboarding) } : null
}

async function kort(a: Aktoer) {
  const [utlegg, byraa, avgift, paa] = await Promise.all([utleggFor(a.id), byraaFor(a.talent_agent_id), avgiftFor(a), utleggErSlaattPaa()])
  return {
    enabled: paa,
    expense: utlegg,
    suggestedPayer: foreslaattBetaler(byraa),
    agency: byraa ? { id: byraa.id, name: byraa.name, covers: byraa.covers_onboarding } : null,
    // Avgiften vises bare der den gjelder: drop-in som vil ha ansikt.
    fee: avgift.amountNok != null && !a.talent_agent_id && a.wants_face === true ? avgift : null,
  }
}

async function venteliste(tenantId: string) {
  const { data, error } = await db().from('onboarding_expenses')
    .select(`${UTLEGG_FELTER}, voice_actors(name, actor_email)`)
    .eq('tenant_id', tenantId).neq('payer', 'actor')
    .or('refunded_at.is.null,and(payer.eq.agency,invoiced_at.is.null)')
    .order('created_at', { ascending: true })
  if (error) return null
  const rader = (data || []) as unknown as Array<Parameters<typeof tilUtlegg>[0] & { voice_actors?: { name?: string; actor_email?: string | null } | null }>
  const medNavn = rader.map((r) => ({ ...tilUtlegg(r), actorId: r.actor_id, actorName: r.voice_actors?.name ?? '—', actorEmail: r.voice_actors?.actor_email ?? null }))
  const tilRefusjon = medNavn.filter((u) => u.status === 'to_refund')
  const perByraa = new Map<string, { agentId: string; name: string; sumNok: number; items: typeof medNavn }>()
  for (const u of medNavn.filter((x) => x.status === 'to_invoice' && x.agentId)) {
    const b = perByraa.get(u.agentId!) ?? { agentId: u.agentId!, name: u.agentName ?? '—', sumNok: 0, items: [] }
    b.sumNok = kr(b.sumNok + u.amountNok)
    b.items.push(u)
    perByraa.set(u.agentId!, b)
  }
  return { toRefund: tilRefusjon, toInvoice: [...perByraa.values()] }
}

export async function GET(request: Request) {
  const v = await vakt(request)
  if (v.fail) return v.fail
  const params = new URL(request.url).searchParams
  if (params.get('liste')) {
    const liste = await venteliste(v.tenant!.id)
    return NextResponse.json(liste ? { enabled: true, ...liste } : { enabled: false, toRefund: [], toInvoice: [] })
  }
  const a = await egenAktoer(v.tenant!.id, params.get('actorId'))
  if (!a) return NextResponse.json({ error: 'Skuespilleren finnes ikke i denne banken' }, { status: 404 })
  return NextResponse.json(await kort(a))
}

export async function POST(request: Request) {
  try {
    const v = await vakt(request)
    if (v.fail) return v.fail
    const b = await request.json().catch(() => ({}))
    const a = await egenAktoer(v.tenant!.id, b.actorId)
    if (!a) return NextResponse.json({ error: 'Skuespilleren finnes ikke i denne banken' }, { status: 404 })
    if (!(await utleggErSlaattPaa())) return ikkeKjoert()

    const amountNok = lesBeloep(b.amountNok)
    if (amountNok == null) return NextResponse.json({ error: 'Skriv beløpet kortet ble belastet, i kroner.' }, { status: 400 })
    const amountUsd = b.amountUsd != null && String(b.amountUsd).trim() !== '' ? lesBeloep(b.amountUsd) : null
    if (b.amountUsd != null && String(b.amountUsd).trim() !== '' && amountUsd == null) {
      return NextResponse.json({ error: 'Ugyldig dollarbeløp' }, { status: 400 })
    }

    // Forslaget kommer fra veien inn; adminen kan overstyre (en avtale
    // systemet ikke kjenner). «Byrået» krever et byrå å fakturere.
    const byraa = await byraaFor(a.talent_agent_id)
    const payer = b.payer === undefined || b.payer === null || b.payer === '' ? foreslaattBetaler(byraa) : b.payer
    if (!erBetaler(payer)) return NextResponse.json({ error: 'Ukjent betaler' }, { status: 400 })
    if (!kanBetale(payer, !!byraa)) return NextResponse.json({ error: 'Hun er ikke knyttet til noe byrå, så byrået kan ikke faktureres.' }, { status: 400 })

    const naa = new Date().toISOString()
    const refundert = payer !== 'actor' && b.refunded === true
    const { error } = await db().from('onboarding_expenses').insert({
      tenant_id: v.tenant!.id,
      actor_id: a.id,
      kind: 'voice_subscription',
      amount_nok: amountNok,
      amount_usd: amountUsd,
      payer,
      talent_agent_id: payer === 'agency' ? byraa!.id : null,
      refunded_at: refundert ? naa : null,
      refunded_by: refundert ? v.email : null,
      note: b.note ? String(b.note).slice(0, 300) : null,
      created_by: v.email,
    })
    if (error) {
      const dobbel = /duplicate|unique/i.test(error.message)
      return NextResponse.json({ error: dobbel ? 'Abonnementet hennes er alt registrert.' : error.message }, { status: dobbel ? 409 : 500 })
    }
    // Det gamle flagget (072) følger med, så oversikten teller riktig.
    if (payer !== 'actor') await db().from('voice_actors').update({ subscription_covered: true }).eq('id', a.id)
    return NextResponse.json(await kort(a))
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Ukjent feil' }, { status: 500 })
  }
}

export async function PATCH(request: Request) {
  try {
    const v = await vakt(request)
    if (v.fail) return v.fail
    const b = await request.json().catch(() => ({}))
    const naa = new Date().toISOString()

    if (b.action === 'refunded') {
      const { data, error } = await db().from('onboarding_expenses')
        .update({ refunded_at: naa, refunded_by: v.email })
        .eq('id', String(b.id || '')).eq('tenant_id', v.tenant!.id).neq('payer', 'actor').is('refunded_at', null)
        .select('actor_id')
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      if (!data?.length) return NextResponse.json({ error: 'Fant ingen refusjon som venter. Last siden på nytt.' }, { status: 409 })
      const a = await egenAktoer(v.tenant!.id, data[0].actor_id)
      return NextResponse.json(a ? await kort(a) : { ok: true })
    }

    if (b.action === 'invoiced') {
      // Alt byrået skylder, i én faktura. Bare det som faktisk er refundert.
      const { data, error } = await db().from('onboarding_expenses')
        .update({ invoiced_at: naa, invoiced_by: v.email })
        .eq('talent_agent_id', String(b.agentId || '')).eq('tenant_id', v.tenant!.id)
        .eq('payer', 'agency').not('refunded_at', 'is', null).is('invoiced_at', null)
        .select('amount_nok')
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      if (!data?.length) return NextResponse.json({ error: 'Ingenting å fakturere for dette byrået. Last siden på nytt.' }, { status: 409 })
      return NextResponse.json({ ok: true, antall: data.length, sumNok: kr(data.reduce((s, r) => s + Number(r.amount_nok), 0)) })
    }

    if (b.action === 'waive_fee') {
      const a = await egenAktoer(v.tenant!.id, b.actorId)
      if (!a) return NextResponse.json({ error: 'Skuespilleren finnes ikke i denne banken' }, { status: 404 })
      const avgift = await avgiftFor(a)
      if (avgift.status) return NextResponse.json({ error: avgift.status === 'paid' ? 'Avgiften er alt betalt.' : 'Hun er alt fritatt.' }, { status: 409 })
      const { error } = await db().from('enrollment_fees').insert({
        tenant_id: v.tenant!.id, actor_id: a.id, amount_nok: avgift.amountNok ?? 0,
        status: 'waived', waived_by: v.email,
      })
      if (error) {
        if (/relation|schema cache|does not exist/i.test(error.message)) return ikkeKjoert()
        const dobbel = /duplicate|unique/i.test(error.message)
        return NextResponse.json({ error: dobbel ? 'Hun er alt fritatt eller har betalt.' : error.message }, { status: dobbel ? 409 : 500 })
      }
      return NextResponse.json(await kort(a))
    }

    return NextResponse.json({ error: 'Ukjent handling' }, { status: 400 })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Ukjent feil' }, { status: 500 })
  }
}

export async function DELETE(request: Request) {
  try {
    const v = await vakt(request)
    if (v.fail) return v.fail
    const b = await request.json().catch(() => ({}))
    // Bare det som ikke er refundert: en overført refusjon er en hendelse i
    // nettbanken og skal stå i sporet.
    const { data, error } = await db().from('onboarding_expenses')
      .delete().eq('id', String(b.id || '')).eq('tenant_id', v.tenant!.id).is('refunded_at', null)
      .select('actor_id, payer')
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!data?.length) return NextResponse.json({ error: 'Kan ikke slettes: finnes ikke, eller er alt refundert.' }, { status: 409 })
    if (data[0].payer !== 'actor') await db().from('voice_actors').update({ subscription_covered: false }).eq('id', data[0].actor_id)
    const a = await egenAktoer(v.tenant!.id, data[0].actor_id)
    return NextResponse.json(a ? await kort(a) : { ok: true })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Ukjent feil' }, { status: 500 })
  }
}
