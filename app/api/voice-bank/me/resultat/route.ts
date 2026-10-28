import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { likeSafe } from '@/lib/epost'
import { getTenant } from '@/lib/tenantServer'
import { resultatLenke } from '@/lib/innsynServer'

// GET ?event=<id> — en fersk lenke til det som ble laget i én bruk (128).
//
// Lenken hentes først når hun trykker, ikke med hele hovedboken: den varer i
// minutter, og nivået sjekkes på nytt hver gang — har byrået strammet inn
// siden siden ble lastet, gjelder det fra nå.
//
// Identitet som i /api/voice-bank/me: verifisert JWT → e-post → voice_actors.actor_email,
// i host-tenantens bank.

function db() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || '', process.env.SUPABASE_SERVICE_ROLE_KEY || '')
}

export async function GET(request: Request) {
  try {
    const auth = request.headers.get('authorization')
    const email = auth?.startsWith('Bearer ') ? (await db().auth.getUser(auth.slice(7))).data?.user?.email ?? null : null
    if (!email) return NextResponse.json({ error: 'Ikke innlogget' }, { status: 401 })

    const eventId = new URL(request.url).searchParams.get('event') || ''
    // uuid eller heltall — typen på hovedbokens id er satt utenfor repoet.
    if (!/^([0-9a-f-]{36}|\d{1,19})$/i.test(eventId)) return NextResponse.json({ error: 'Ugyldig bruk' }, { status: 400 })

    const { data: e } = await db().from('voice_usage_events')
      .select('id, actor_id, licence_id, product_id, draft_id, job_id, asset_type, meta')
      .eq('id', eventId).maybeSingle()
    if (!e) return NextResponse.json({ error: 'Fant ikke bruken' }, { status: 404 })

    const tenant = await getTenant()
    let q = db().from('voice_actors').select('id, talent_agent_id')
      .eq('id', e.actor_id as string).ilike('actor_email', likeSafe(email))
    if (tenant.id !== 'root') q = q.eq('owner_tenant_id', tenant.id)
    const { data: actor } = await q.maybeSingle()
    // Samme svar som «finnes ikke»: en fremmed skal ikke få vite at bruken finnes.
    if (!actor) return NextResponse.json({ error: 'Fant ikke bruken' }, { status: 404 })

    const url = await resultatLenke(e as never, (actor as { talent_agent_id?: string | null }).talent_agent_id ?? null)
    if (!url) return NextResponse.json({ error: 'Resultatet er ikke tilgjengelig' }, { status: 404 })
    return NextResponse.json({ url })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Ukjent feil' }, { status: 500 })
  }
}
