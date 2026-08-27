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

    // Er dette OSS? Bare plattform-admin kan registrere en utbetaling.
    const { data: rot } = await supabase.from('tenants').select('id').eq('slug', 'centerforge').single()
    const rotAdmin = !!rot && (await isTenantAdmin(bruker.user.email, rot.id))

    // Finn tenanten det spørres om
    let tenantId: string | null = null
    let tenantNavn = ''
    let lostSlug: string | null = null
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
      lostSlug = t.slug
    } else {
      // Uten slug: tenanten brukeren tilhører
      const { data: org } = await supabase
        .from('organizations')
        .select('tenant_id, tenants(name, slug)')
        .eq('owner_id', bruker.user.id)
        .single()
      tenantId = (org as any)?.tenant_id || null
      tenantNavn = (org as any)?.tenants?.name || ''
      lostSlug = (org as any)?.tenants?.slug || null
      // Denne grenen manglet ogsaa tilgangssjekk (funnet 7/8). Å tilhøre en
      // tenant er IKKE det samme som å ha rett til å se den: avregningen viser
      // HELE tenantens omsetning og margin, så enhver artist under IndigoBoom
      // kunne lese nøyaktig hva selskapet tjener på henne. Nav-lenken var
      // skjult for vanlige brukere, men API-et svarte likevel.
      if (tenantId && !(await isTenantAdmin(bruker.user.email, tenantId))) {
        return NextResponse.json({ error: 'Avregning er forbeholdt administratorer' }, { status: 403 })
      }
    }
    if (!tenantId) return NextResponse.json({ error: 'Fant ingen tenant' }, { status: 404 })

    const { data: rader, error } = await supabase
      .from('usage_events')
      .select('event_type, cost_nok, customer_cost_nok, created_at, product_id, organization_id')
      .eq('tenant_id', tenantId)
      .gte('created_at', fra)
      .lte('created_at', til)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    let omsetning = 0      // hva sluttkundene betalte
    let tilContentForge = 0 // engrospris
    let antall = 0
    const perType: Record<string, { antall: number; omsetning: number; engros: number }> = {}
    // Forbruk per kunde-organisasjon — partneren skal kunne se HVEM, ikke bare
    // hvor mye (Lars 7/8). Aggregatene alene svarte «det er omsatt for 540 kr»
    // uten å si at det var Celiin som produserte.
    const forbrukPerOrg: Record<string, { forbrukt: number; antall: number }> = {}
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
      const oid = (r as any).organization_id
      if (oid) {
        if (!forbrukPerOrg[oid]) forbrukPerOrg[oid] = { forbrukt: 0, antall: 0 }
        forbrukPerOrg[oid].forbrukt += kunde
        forbrukPerOrg[oid].antall += 1
      }
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
    // Kundelinjene: hvem kjøpte, hvem produserte, hva står igjen.
    type Hendelse = { dato: string; type: string; produkt: string | null; beloep: number }
    type Kunde = { orgId: string; navn: string; epost: string | null; kjoept: number; forbrukt: number; saldo: number | null; antall: number; hendelser: Hendelse[] }
    const perKunde: Kunde[] = []
    try {
      const { data: orgs } = await supabase
        .from('organizations')
        .select('id, name, owner_id')
        .eq('tenant_id', tenantId)
      const orgIds = (orgs || []).map((o) => o.id)
      if (orgIds.length > 0) {
        const { data: tops } = await supabase
          .from('org_topups')
          .select('organization_id, amount_nok, bonus_nok, paid_nok, created_at')
          .in('organization_id', orgIds)

        const perOrg: Record<string, { kjoeptIPerioden: number; tildeltTotalt: number }> = {}
        for (const r of tops || []) {
          innkrevd += Number(r.paid_nok ?? 0)
          tildelt += Number(r.amount_nok ?? 0) + Number(r.bonus_nok ?? 0)
          const oid = r.organization_id as string
          if (!perOrg[oid]) perOrg[oid] = { kjoeptIPerioden: 0, tildeltTotalt: 0 }
          perOrg[oid].tildeltTotalt += Number(r.amount_nok ?? 0) + Number(r.bonus_nok ?? 0)
          // «Kjøpt» telles i perioden; saldo er alltid alt-i-alt.
          const t = String(r.created_at || '')
          if (t >= String(fra) && t <= String(til)) perOrg[oid].kjoeptIPerioden += Number(r.paid_nok ?? 0)
        }

        // E-post er den eneste måten kunden faktisk kjennes igjen på.
        const eposter: Record<string, string> = {}
        for (const o of orgs || []) {
          if (!o.owner_id) continue
          try {
            const { data: u } = await supabase.auth.admin.getUserById(o.owner_id as string)
            if (u?.user?.email) eposter[o.id as string] = u.user.email
          } catch { /* slettet bruker → vis org-navnet alene */ }
        }

        // Bestillingshistorikken per kunde — «hvem har bestilt hva», ikke bare
        // hvor mye (Lars 27/8, til Standard Festmagasin-demoen). Hendelsene
        // ligger allerede i `rader`; produktnavnene slås opp i ETT kall.
        // Nyeste først, tak per kunde så svaret ikke vokser uten grense.
        const produktNavn: Record<string, string> = {}
        {
          const pids = [...new Set((rader || []).map((r) => r.product_id as string | null).filter(Boolean))] as string[]
          if (pids.length > 0) {
            const { data: prods } = await supabase.from('products').select('id, name').in('id', pids)
            for (const pr of prods || []) produktNavn[pr.id as string] = pr.name as string
          }
        }
        const hendelserPerOrg: Record<string, Hendelse[]> = {}
        for (const r of rader || []) {
          const oid = (r as { organization_id?: string | null }).organization_id
          if (!oid) continue
          if (!hendelserPerOrg[oid]) hendelserPerOrg[oid] = []
          hendelserPerOrg[oid].push({
            dato: String(r.created_at || ''),
            type: String(r.event_type || 'ukjent'),
            produkt: r.product_id ? (produktNavn[r.product_id] ?? null) : null,
            beloep: Math.round(Number(r.customer_cost_nok ?? r.cost_nok ?? 0) * 100) / 100,
          })
        }
        for (const oid of Object.keys(hendelserPerOrg)) {
          hendelserPerOrg[oid].sort((a, b) => b.dato.localeCompare(a.dato))
          hendelserPerOrg[oid] = hendelserPerOrg[oid].slice(0, 60)
        }

        // Alt forbruk i perioden må vises, også fra en org uten påfyll.
        const alleOrgIds = new Set<string>([...Object.keys(forbrukPerOrg), ...Object.keys(perOrg)])
        const { getOrgBalance } = await import('@/lib/tenantBilling')
        for (const oid of alleOrgIds) {
          if (!orgIds.includes(oid)) continue
          const org = (orgs || []).find((o) => o.id === oid)
          const p = perOrg[oid]
          const f = forbrukPerOrg[oid]
          // Saldoen er ALLTID alt-i-alt, aldri periodens tall — påfyll og
          // forbruk faller sjelden i samme måned. getOrgBalance er samme
          // funksjon produksjonssperren bruker, så tallene kan ikke sprike.
          // null = ingen forskuddskonto opprettet = ingen sperre, ikke tom konto.
          const saldo = await getOrgBalance(oid)
          perKunde.push({
            orgId: oid,
            navn: (org?.name as string) || 'Ukjent',
            epost: eposter[oid] ?? null,
            kjoept: Math.round((p?.kjoeptIPerioden ?? 0) * 100) / 100,
            forbrukt: Math.round((f?.forbrukt ?? 0) * 100) / 100,
            saldo: saldo === null ? null : Math.round(saldo * 100) / 100,
            antall: f?.antall ?? 0,
            hendelser: hendelserPerOrg[oid] ?? [],
          })
        }
        perKunde.sort((a, b) => b.forbrukt - a.forbrukt || b.kjoept - a.kjoept)

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

    let valgbare: { slug: string; navn: string }[] = []
    if (rotAdmin) {
      const { data: alle } = await supabase.from('tenants').select('slug, name, app_name').order('slug')
      valgbare = (alle || []).map((t: any) => ({ slug: t.slug, navn: t.app_name || t.name || t.slug }))
    }

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
      perKunde,
      // Styrer om «registrer utbetaling» vises — kun vi betaler ut.
      erPlattformAdmin: rotAdmin,
      // Velgeren finnes bare for oss: en partner skal ikke se at andre finnes.
      valgbareTenants: rotAdmin ? valgbare : undefined,
      tenantSlug: lostSlug,
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
