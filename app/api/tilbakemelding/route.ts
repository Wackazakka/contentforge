import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getOrgBalance } from '@/lib/tenantBilling'
import { UNDERSOKELSE, validerSvar, bonusKredittFor } from '@/lib/tilbakemelding'

// Tilbakemeldingsskjemaet (migrasjon 108, Lars 21.10.2026).
// GET  → status: saldo, tidligere svar, om bonusen er mulig/gitt
// POST → lagre svaret (oppdateres ved ny innsending) og gi bonusen hvis
//        testeren har under grensen igjen og fristen ikke er ute.
// Bonusen gis bare inviterte testere (welcome_invites), maks én gang, og
// kreves atomisk (bonus_granted_at settes bare der den er null).

export const runtime = 'nodejs'

function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

async function hvem(request: Request) {
  const auth = request.headers.get('authorization')
  if (!auth?.startsWith('Bearer ')) return null
  const sb = admin()
  const { data } = await sb.auth.getUser(auth.slice(7))
  const user = data?.user
  if (!user) return null
  const { getTenant } = await import('@/lib/tenantServer')
  const tenant = await getTenant()
  // Organisasjonen på DETTE domenet (samme regel som /api/org-balance)
  const { data: orgs } = await sb.from('organizations').select('id, tenant_id').eq('owner_id', user.id).order('created_at', { ascending: true })
  const org = (orgs || []).find((o: any) => o.tenant_id === tenant.id) ?? null
  const { data: invitasjoner } = await sb.from('welcome_invites').select('created_at')
    .eq('user_id', user.id).eq('tenant_slug', UNDERSOKELSE.tenantSlug)
    .order('created_at', { ascending: true }).limit(1)
  const forste = invitasjoner?.[0]?.created_at ?? null
  const kroner = org ? await getOrgBalance(org.id) : null
  return {
    sb, user, tenant, org,
    aktiv: tenant.slug === UNDERSOKELSE.tenantSlug,
    invitert: !!forste,
    bonusKreditter: bonusKredittFor(forste),
    saldoKreditter: kroner === null ? null : Math.round(kroner * 10 * 10) / 10,
  }
}

function fristUte(): boolean {
  return Date.now() > new Date(UNDERSOKELSE.bonusFrist).getTime()
}

export async function GET(request: Request) {
  const h = await hvem(request)
  if (!h) return NextResponse.json({ error: 'Ikke innlogget' }, { status: 401 })
  if (!h.aktiv) return NextResponse.json({ aktiv: false })
  const { data: rad } = await h.sb.from('feedback_responses').select('answers, bonus_granted_at, updated_at')
    .eq('user_id', h.user.id).eq('survey', UNDERSOKELSE.id).maybeSingle()
  return NextResponse.json({
    aktiv: true,
    saldoKreditter: h.saldoKreditter,
    svar: rad?.answers ?? null,
    sistSendt: rad?.updated_at ?? null,
    bonus: {
      tilbys: h.invitert,
      gitt: !!rad?.bonus_granted_at,
      fristUte: fristUte(),
      grense: UNDERSOKELSE.grenseKreditter,
      kreditter: h.bonusKreditter,
      fristTekst: UNDERSOKELSE.bonusFristTekst,
    },
  })
}

export async function POST(request: Request) {
  const h = await hvem(request)
  if (!h) return NextResponse.json({ error: 'Ikke innlogget' }, { status: 401 })
  if (!h.aktiv) return NextResponse.json({ error: 'Ikke tilgjengelig her' }, { status: 404 })

  let body: any = null
  try { body = await request.json() } catch { /* tom */ }
  const { svar, mangler } = validerSvar(body?.svar)
  if (mangler.length) return NextResponse.json({ error: 'Mangler svar', mangler }, { status: 400 })

  const { error: lagreFeil } = await h.sb.from('feedback_responses').upsert({
    user_id: h.user.id,
    organization_id: h.org?.id ?? null,
    tenant_slug: h.tenant.slug,
    survey: UNDERSOKELSE.id,
    answers: svar,
    balance_credits_at_submit: h.saldoKreditter,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id,survey' })
  if (lagreFeil) {
    console.error('[tilbakemelding] lagring feilet:', lagreFeil.message)
    return NextResponse.json({ error: 'Kunne ikke lagre svaret' }, { status: 500 })
  }

  // Bonus: invitert tester, innen fristen, under grensen, ikke gitt før
  let bonusGitt = false
  const mulig = h.invitert && !fristUte() && h.org && h.saldoKreditter !== null && h.saldoKreditter < UNDERSOKELSE.grenseKreditter
  if (mulig && h.org) {
    const { data: krevd } = await h.sb.from('feedback_responses')
      .update({ bonus_granted_at: new Date().toISOString(), bonus_credits: h.bonusKreditter })
      .eq('user_id', h.user.id).eq('survey', UNDERSOKELSE.id).is('bonus_granted_at', null)
      .select('id')
    if (krevd?.length) {
      const { error: kErr } = await h.sb.from('org_topups').insert({
        organization_id: h.org.id,
        amount_nok: 0,
        bonus_nok: h.bonusKreditter / 10, // kreditter = kr × 10
        note: `Tilbakemeldingsbonus ${UNDERSOKELSE.id}: ${h.bonusKreditter} kreditter (under ${UNDERSOKELSE.grenseKreditter} igjen ved innsending)`,
      })
      if (kErr) {
        // Gi kravet tilbake, så neste innsending kan prøve igjen
        await h.sb.from('feedback_responses').update({ bonus_granted_at: null, bonus_credits: null }).eq('id', krevd[0].id)
        console.error('[tilbakemelding] bonus feilet:', kErr.message)
      } else {
        bonusGitt = true
      }
    }
  }

  const kroner = h.org ? await getOrgBalance(h.org.id) : null
  return NextResponse.json({
    ok: true,
    bonusGitt,
    saldoKreditter: kroner === null ? null : Math.round(kroner * 10 * 10) / 10,
  })
}
