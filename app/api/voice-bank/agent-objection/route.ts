import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { erGyldigNoekkel } from '@/lib/identitet'

// «Ikke vår klient» (116) — byråets innsigelse fra e-posten.
//
// 🔑 TOKENET ER AUTENTISERINGEN, som på godkjenningssida (091). Byrået har
// ingen konto hos oss og skal ikke trenge en for å si «vi kjenner ikke denne
// personen». Tokenet finnes bare på raden som kom gjennom lenken, og brennes
// når det brukes.
//
// 🔑 GET ENDRER INGENTING. E-postfiltre åpner lenker for å sjekke dem; en
// innsigelse som skjedde ved GET, ville blitt utløst av en skanner. Sida viser
// hvem det gjelder, og POST gjør jobben.
//
// Virkning: bekreftelsen trekkes (self_declared), koblingen til byrået
// fjernes, og profilen tas ned. Den kan ikke publiseres igjen før identiteten
// er bekreftet på en annen måte.

function db() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || '', process.env.SUPABASE_SERVICE_ROLE_KEY || '')
}

async function hent(token: unknown) {
  if (!erGyldigNoekkel(token)) return null
  const { data } = await db().from('voice_actors')
    .select('id, name, notes, talent_agent_id, talent_agents(name)')
    .eq('agent_objection_token', token).maybeSingle()
  return data as { id: string; name: string; notes: string | null; talent_agent_id: string | null; talent_agents: { name: string } | { name: string }[] | null } | null
}

const byraaNavn = (r: NonNullable<Awaited<ReturnType<typeof hent>>>) =>
  (Array.isArray(r.talent_agents) ? r.talent_agents[0]?.name : r.talent_agents?.name) ?? null

export async function GET(request: Request) {
  const r = await hent(new URL(request.url).searchParams.get('token'))
  if (!r) return NextResponse.json({ error: 'Lenken er brukt eller ukjent' }, { status: 404 })
  return NextResponse.json({ name: r.name, agency: byraaNavn(r) })
}

export async function POST(request: Request) {
  try {
    const b = await request.json().catch(() => ({}))
    const r = await hent(b.token)
    if (!r) return NextResponse.json({ error: 'Lenken er brukt eller ukjent' }, { status: 404 })
    const dato = new Date().toISOString().slice(0, 10)
    const { error } = await db().from('voice_actors').update({
      identity_basis: 'self_declared',
      talent_agent_id: null,
      agent_commission_pct: null,
      identity_confirmed_by: null,
      identity_confirmed_at: null,
      agent_objection_token: null,
      is_public: false,
      notes: [r.notes, `${byraaNavn(r) || 'Byrået'}: «ikke vår klient» ${dato}`].filter(Boolean).join(' · '),
    }).eq('id', r.id).eq('agent_objection_token', b.token)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Ukjent feil' }, { status: 500 })
  }
}
