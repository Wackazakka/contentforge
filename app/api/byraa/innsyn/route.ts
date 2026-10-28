import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getTenant } from '@/lib/tenantServer'
import { erGyldigNoekkel } from '@/lib/identitet'
import { erInnsyn } from '@/lib/usageDetails'

// Byråets innsynsside (128): hva klientene ser av bruken, per lisens.
//
// 🔑 NØKKELEN ER AUTENTISERINGEN, som på innsigelsessida (116). Byrået har
// ingen konto hos oss. Nøkkelen er EGEN (talent_agents.insight_token): den
// gis bare til byrået, mens påmeldingslenka gis til skuespillere.
//
// 🔑 GET ENDRER INGENTING. E-postfiltre åpner lenker for å sjekke dem.
//
// Det byrået ser her: klientene sine, lisensene deres (hva slags, verk/periode,
// status) og nivået. Ikke beløp — dem har byrået i oppgjøret, og en lekket
// lenke skal ikke gi bort mer enn den må.

function db() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || '', process.env.SUPABASE_SERVICE_ROLE_KEY || '')
}

async function byraa(token: unknown) {
  if (!erGyldigNoekkel(token)) return null
  const tenant = await getTenant()
  if (tenant.id === 'root') return null
  const { data } = await db().from('talent_agents')
    .select('id, name, default_actor_insight')
    .eq('insight_token', token).eq('tenant_id', tenant.id).eq('is_active', true).maybeSingle()
  return data ? { ...(data as { id: string; name: string; default_actor_insight: string }), tenantId: tenant.id } : null
}

async function klienter(agentId: string, tenantId: string) {
  const { data } = await db().from('voice_actors').select('id, name')
    .eq('talent_agent_id', agentId).eq('owner_tenant_id', tenantId).order('name')
  return (data || []) as Array<{ id: string; name: string }>
}

async function oversikt(b: NonNullable<Awaited<ReturnType<typeof byraa>>>) {
  const folk = await klienter(b.id, b.tenantId)
  const ider = folk.map((a) => a.id)
  const { data: lics } = ider.length
    ? await db().from('licences')
        .select('id, actor_id, kind, asset_type, status, work_title, customer_label, media_class, territory, term_start, term_end, actor_insight, created_at')
        .in('actor_id', ider).in('status', ['quote', 'active', 'expired'])
        .order('created_at', { ascending: false })
    : { data: [] as Array<Record<string, unknown>> }
  return {
    agency: { name: b.name, defaultActorInsight: b.default_actor_insight },
    clients: folk.map((a) => ({
      id: a.id, name: a.name,
      licences: (lics || []).filter((l) => l.actor_id === a.id).map((l) => ({
        id: l.id, kind: l.kind, assetType: l.asset_type, status: l.status,
        workTitle: l.work_title, customer: l.customer_label, mediaClass: l.media_class, territory: l.territory,
        termStart: l.term_start, termEnd: l.term_end, insight: l.actor_insight,
      })),
    })),
  }
}

export async function GET(request: Request) {
  const b = await byraa(new URL(request.url).searchParams.get('token'))
  if (!b) return NextResponse.json({ error: 'Lenken er ukjent eller ikke lenger i bruk' }, { status: 404 })
  return NextResponse.json(await oversikt(b))
}

/**
 *   { token, licenceId, insight }      nivået på én lisens
 *   { token, defaultInsight }          byråets standard for nye lisenser
 *   { token, allInsight }              samme nivå på alle klientenes lisenser
 */
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}))
    const b = await byraa(body.token)
    if (!b) return NextResponse.json({ error: 'Lenken er ukjent eller ikke lenger i bruk' }, { status: 404 })
    const ider = (await klienter(b.id, b.tenantId)).map((a) => a.id)

    if (body.licenceId !== undefined) {
      if (!erInnsyn(body.insight)) return NextResponse.json({ error: 'Ukjent valg' }, { status: 400 })
      if (!ider.length) return NextResponse.json({ error: 'Fant ikke lisensen' }, { status: 404 })
      // Lisensen må tilhøre en av byråets egne klienter.
      const { data, error } = await db().from('licences').update({ actor_insight: body.insight })
        .eq('id', String(body.licenceId)).in('actor_id', ider).select('id')
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      if (!data?.length) return NextResponse.json({ error: 'Fant ikke lisensen' }, { status: 404 })
    } else if (body.defaultInsight !== undefined) {
      if (!erInnsyn(body.defaultInsight)) return NextResponse.json({ error: 'Ukjent valg' }, { status: 400 })
      const { error } = await db().from('talent_agents').update({ default_actor_insight: body.defaultInsight }).eq('id', b.id)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    } else if (body.allInsight !== undefined) {
      if (!erInnsyn(body.allInsight)) return NextResponse.json({ error: 'Ukjent valg' }, { status: 400 })
      if (ider.length) {
        const { error } = await db().from('licences').update({ actor_insight: body.allInsight })
          .in('actor_id', ider).in('status', ['quote', 'active', 'expired'])
        if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      }
    } else {
      return NextResponse.json({ error: 'Ingenting å endre' }, { status: 400 })
    }
    return NextResponse.json(await oversikt({ ...b, default_actor_insight: body.defaultInsight ?? b.default_actor_insight }))
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Ukjent feil' }, { status: 500 })
  }
}
