import { NextResponse } from 'next/server'
import { randomBytes } from 'crypto'
import { createClient } from '@supabase/supabase-js'
import { getTenant } from '@/lib/tenantServer'

// «Start opptaket» fra hennes egen side (steg 1, migrasjon 101).
//
// 🔑 SAMME OEKT SOM ADMINEN LAGER, MEN HUN LAGER DEN SELV. Foer maatte en admin
// trykke «Be om opptak» paa raden hennes. Naa er hun paameldt og innlogget, og
// opptaksloeypa (095) er hennes aa starte. Regelen «én aapen oekt per
// skuespiller» staar: finnes en, returneres den.
//
// 🔑 EGEN RUTE FORDI AUTENTISERINGEN ER EN ANNEN. /stemmeopptak kjenner henne
// paa tokenet i lenken; /stemmeopptak/admin kjenner en admin. Denne kjenner
// en INNLOGGET RETTIGHETSHAVER: JWT-ens e-post maa matche actor_email paa den
// raden hun ber om. Ingen av de tre maa kunne forveksles.

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  )
}

export async function POST(request: Request) {
  try {
    const tenant = await getTenant()
    if (tenant.id === 'root') return NextResponse.json({ error: 'Tenant-oppsett mangler' }, { status: 404 })
    const auth = request.headers.get('authorization')
    if (!auth?.startsWith('Bearer ')) return NextResponse.json({ error: 'Ikke innlogget' }, { status: 401 })
    const { data: u } = await admin().auth.getUser(auth.slice(7))
    const epost = u?.user?.email
    if (!epost) return NextResponse.json({ error: 'Ikke innlogget' }, { status: 401 })

    const b = await request.json()
    const actorId = String(b.actorId || '')
    const { data: actor } = await admin()
      .from('voice_actors')
      .select('id, name, actor_email, offers_voice, has_own_recording')
      .eq('id', actorId)
      .eq('owner_tenant_id', tenant.id)
      .ilike('actor_email', epost)
      .maybeSingle()
    if (!actor) return NextResponse.json({ error: 'Fant ikke raden din' }, { status: 404 })
    if (actor.offers_voice === false) return NextResponse.json({ error: 'Denne raden gjelder ikke stemme' }, { status: 400 })
    if (actor.has_own_recording === true) {
      return NextResponse.json({ error: 'Du sa du hadde et opptak fra før — last det opp i stedet' }, { status: 400 })
    }

    const { data: finnes } = await admin()
      .from('voice_recording_sessions')
      .select('id, token, status').eq('actor_id', actor.id).eq('status', 'open').maybeSingle()
    const oekt = (finnes as { id: string; token: string } | null) ?? await (async () => {
      const token = randomBytes(24).toString('base64url')
      const { data, error } = await admin().from('voice_recording_sessions').insert({
        actor_id: actor.id, tenant_id: tenant.id, token, subject_email: actor.actor_email,
      }).select('id, token').single()
      if (error) throw new Error(error.message)
      return data as { id: string; token: string }
    })()

    return NextResponse.json({ lenke: `/opptak/${oekt.token}` })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
