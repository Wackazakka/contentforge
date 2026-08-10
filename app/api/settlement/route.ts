import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { isTenantAdmin } from '@/lib/voiceBank'

// Avregning (Lars 1/8): hva skylder ContentForge white-labelen for en periode?
//
// Hver produksjon logger to tall i usage_events:
//   customer_cost_nok — hva sluttkunden betalte (hele kjedens påslag)
//   cost_nok          — ContentForges engrospris (råkost + vårt påslag)
// Differansen er white-labelens opptjente andel.
//
// Avregningen følger FORBRUK, ikke kredittsalg: en artist som kjøper i januar
// og bruker i mars, tjenes inn i mars — det er da kostnadene påløper.

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  )
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url)
    const tenantSlug = url.searchParams.get('tenant')
    // Periode: default inneværende måned
    const naa = new Date()
    const fra = url.searchParams.get('fra') || new Date(Date.UTC(naa.getUTCFullYear(), naa.getUTCMonth(), 1)).toISOString()
    const til = url.searchParams.get('til') || new Date().toISOString()

    const supabase = admin()

    // Hvem spør? Kun innlogget bruker som eier/tilhører tenanten, eller root-admin
    const auth = request.headers.get('authorization') || ''
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : null
    if (!token) return NextResponse.json({ error: 'Ikke innlogget' }, { status: 401 })
    const { data: bruker } = await supabase.auth.getUser(token)
    if (!bruker?.user) return NextResponse.json({ error: 'Ikke innlogget' }, { status: 401 })

    // Finn tenanten det spørres om
    let tenantId: string | null = null
    let tenantNavn = ''
    if (tenantSlug) {
      const { data: t } = await supabase.from('tenants').select('id, name, slug, markup_percent').eq('slug', tenantSlug).single()
      if (!t) return NextResponse.json({ error: 'Ukjent tenant' }, { status: 404 })
      // Her sto INGEN tilgangssjekk (funnet 7/8): enhver innlogget bruker kunne
      // sende ?tenant=<slug> og lese en hvilken som helst partners omsetning,
      // vår innpris og deres margin. isTenantAdmin dekker tenantens egne
      // admins og leddene OVER i treet — root ser alt, en partner ser aldri
      // sidelengs eller oppover.
      if (!(await isTenantAdmin(bruker.user.email, t.id))) {
        return NextResponse.json({ error: 'Ingen tilgang til denne tenanten' }, { status: 403 })
      }
      tenantId = t.id
      tenantNavn = t.name || t.slug
    } else {
      // Uten slug: tenanten brukeren tilhører
      const { data: org } = await supabase
        .from('organizations')
        .select('tenant_id, tenants(name, slug)')
        .eq('owner_id', bruker.user.id)
        .single()
      tenantId = (org as any)?.tenant_id || null
      tenantNavn = (org as any)?.tenants?.name || ''
    }
    if (!tenantId) return NextResponse.json({ error: 'Fant ingen tenant' }, { status: 404 })

    const { data: rader, error } = await supabase
      .from('usage_events')
      .select('event_type, cost_nok, customer_cost_nok, created_at, product_id')
      .eq('tenant_id', tenantId)
      .gte('created_at', fra)
      .lte('created_at', til)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    let omsetning = 0      // hva sluttkundene betalte
    let tilContentForge = 0 // engrospris
    let antall = 0
    const perType: Record<string, { antall: number; omsetning: number; engros: number }> = {}
    for (const r of rader || []) {
      const kunde = Number(r.customer_cost_nok ?? r.cost_nok ?? 0)
      const engros = Number(r.cost_nok ?? 0)
      omsetning += kunde
      tilContentForge += engros
      antall += 1
      const t = r.event_type || 'ukjent'
      if (!perType[t]) perType[t] = { antall: 0, omsetning: 0, engros: 0 }
      perType[t].antall += 1
      perType[t].omsetning += kunde
      perType[t].engros += engros
    }
    const tilWhiteLabel = Math.max(0, omsetning - tilContentForge)

    // ── Innkrevingsmodellen (Lars 7/8) ────────────────────────────────────
    // Sluttkundene betaler kort til OSS; vi betaler white-labelen dens andel.
    // Da holder det ikke å vite hva som er OPPTJENT — vi må vite hva som er
    // KOMMET INN, for de to er ikke like.
    //
    // Pakkene har volumrabatt: «privat-mellom» koster 500 kr og gir 5 500
    // kreditter = 550 kr i kjøpekraft. Forbruket bokføres til 550, men bare
    // 500 kom inn. Uten fordeling ville hele rabatten blitt tatt fra vår
    // margin, selv om det var partnerens kunde som fikk den.
    //
    // Rabattfaktor = betalt / tildelt kjøpekraft, målt over ALLE påfyll til
    // denne tenantens kunder (ikke bare periodens — den skal ikke svinge fordi
    // ingen tilfeldigvis kjøpte i august). Manuelle gavekreditter har ingen
    // paid_nok og trekker derfor faktoren ned: det kom ingen penger inn å
    // betale ut av. Faktor 1 når vi ikke vet noe — da er dette et rent nulltak.
    let innkrevd = 0
    let tildelt = 0
    let rabattfaktor = 1
    try {
      const { data: orgs } = await supabase.from('organizations').select('id').eq('tenant_id', tenantId)
      const orgIds = (orgs || []).map((o) => o.id)
      if (orgIds.length > 0) {
        const { data: tops } = await supabase
          .from('org_topups')
          .select('amount_nok, bonus_nok, paid_nok')
          .in('organization_id', orgIds)
        for (const r of tops || []) {
          innkrevd += Number(r.paid_nok ?? 0)
          tildelt += Number(r.amount_nok ?? 0) + Number(r.bonus_nok ?? 0)
        }
        if (tildelt > 0 && innkrevd > 0) rabattfaktor = innkrevd / tildelt
      }
    } catch { /* kolonnen ikke migrert ennå → faktor 1, som er dagens tall */ }

    const tilUtbetaling = tilWhiteLabel * rabattfaktor

    // Alt vi allerede har betalt ut for perioden — ellers viser «til gode»
    // samme beløp igjen måneden etter.
    let alleredeUtbetalt = 0
    try {
      const { data: utb } = await supabase
        .from('partner_payouts')
        .select('amount_nok')
        .eq('tenant_id', tenantId)
        .gte('periode_fra', String(fra).slice(0, 10))
        .lte('periode_til', String(til).slice(0, 10))
      alleredeUtbetalt = (utb || []).reduce((s, r) => s + Number(r.amount_nok || 0), 0)
    } catch { /* tabellen ikke migrert ennå */ }

    const kr = (n: number) => Math.round(n * 100) / 100
    return NextResponse.json({
      tenant: { id: tenantId, navn: tenantNavn },
      periode: { fra, til },
      antallHendelser: antall,
      omsetningNok: kr(omsetning),
      tilContentForgeNok: kr(tilContentForge),
      tilWhiteLabelNok: kr(tilWhiteLabel),
      // Innkreving
      innkrevdNok: kr(innkrevd),
      rabattfaktor: Math.round(rabattfaktor * 10000) / 10000,
      tilUtbetalingNok: kr(tilUtbetaling),
      alleredeUtbetaltNok: kr(alleredeUtbetalt),
      tilGodeNok: kr(Math.max(0, tilUtbetaling - alleredeUtbetalt)),
      perType,
    })
  } catch (err: any) {
    console.error('[settlement] feilet:', err?.message || err)
    return NextResponse.json({ error: 'Noe gikk galt' }, { status: 500 })
  }
}

/**
 * Registrer en utbetaling til white-labelen (Lars 7/8, innkrevingsmodellen).
 *
 * Kun ROOT-admin: det er vi som betaler ut, ikke partneren som kvitterer for
 * seg selv. isTenantAdmin på root-tenanten er akkurat den sjekken.
 */
export async function POST(request: Request) {
  try {
    const supabase = admin()
    const auth = request.headers.get('authorization') || ''
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : null
    if (!token) return NextResponse.json({ error: 'Ikke innlogget' }, { status: 401 })
    const { data: bruker } = await supabase.auth.getUser(token)
    if (!bruker?.user) return NextResponse.json({ error: 'Ikke innlogget' }, { status: 401 })

    const { data: root } = await supabase.from('tenants').select('id').eq('slug', 'centerforge').single()
    if (!root || !(await isTenantAdmin(bruker.user.email, root.id))) {
      return NextResponse.json({ error: 'Kun plattform-admin kan registrere utbetalinger' }, { status: 403 })
    }

    const { tenantSlug, periodeFra, periodeTil, amountNok, note } = await request.json()
    const belop = Number(amountNok)
    if (!tenantSlug || !periodeFra || !periodeTil) {
      return NextResponse.json({ error: 'Mangler tenantSlug, periodeFra eller periodeTil' }, { status: 400 })
    }
    if (!Number.isFinite(belop) || belop < 0) {
      return NextResponse.json({ error: 'Ugyldig beløp' }, { status: 400 })
    }
    if (periodeTil < periodeFra) {
      return NextResponse.json({ error: 'Perioden slutter før den begynner' }, { status: 400 })
    }

    const { data: t } = await supabase.from('tenants').select('id').eq('slug', tenantSlug).single()
    if (!t) return NextResponse.json({ error: 'Ukjent tenant' }, { status: 404 })

    const { error } = await supabase.from('partner_payouts').insert({
      tenant_id: t.id,
      periode_fra: periodeFra,
      periode_til: periodeTil,
      amount_nok: belop,
      note: note ? String(note).slice(0, 300) : null,
    })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    console.error('[settlement POST] feilet:', err?.message || err)
    return NextResponse.json({ error: 'Noe gikk galt' }, { status: 500 })
  }
}
