import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

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

    return NextResponse.json({
      tenant: { id: tenantId, navn: tenantNavn },
      periode: { fra, til },
      antallHendelser: antall,
      omsetningNok: Math.round(omsetning * 100) / 100,
      tilContentForgeNok: Math.round(tilContentForge * 100) / 100,
      tilWhiteLabelNok: Math.round(tilWhiteLabel * 100) / 100,
      perType,
    })
  } catch (err: any) {
    console.error('[settlement] feilet:', err?.message || err)
    return NextResponse.json({ error: 'Noe gikk galt' }, { status: 500 })
  }
}
