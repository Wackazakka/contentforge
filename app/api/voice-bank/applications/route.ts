import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getTenant } from '@/lib/tenantServer'
import { isTenantAdmin } from '@/lib/voiceBank'

// Skuespiller-søknadene («Bli en stemme i banken»): kø + beslutning + opt-in-bryter.

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
  )
}

// Felles vakt for alle metodene: host-tenant + admin-sjekk oppover kjeden.
// Returnerer tenanten, eller et ferdig feilsvar.
async function guard(request: Request): Promise<{ tenant?: Awaited<ReturnType<typeof getTenant>>; fail?: NextResponse }> {
  const tenant = await getTenant()
  if (tenant.id === 'root') {
    return { fail: NextResponse.json({ error: 'Tenant-oppsett mangler' }, { status: 404 }) }
  }
  // Hvem spør? E-post fra verifisert JWT — aldri fra klientdata
  let email: string | null = null
  const auth = request.headers.get('authorization')
  if (auth?.startsWith('Bearer ')) {
    const { data } = await admin().auth.getUser(auth.slice(7))
    email = data?.user?.email ?? null
  }
  if (!email) return { fail: NextResponse.json({ error: 'Ikke innlogget' }, { status: 401 }) }
  if (!(await isTenantAdmin(email, tenant.id))) {
    return { fail: NextResponse.json({ error: 'Ingen admin-tilgang' }, { status: 403 }) }
  }
  return { tenant }
}

// Liste over søknader til DENNE tenanten + opt-in-status
export async function GET(request: Request) {
  try {
    const g = await guard(request)
    if (g.fail) return g.fail
    const tenant = g.tenant!

    // Defensivt: tabell/kolonne kan mangle før migrasjonen — svar tomt, ikke 500
    const { data: apps, error } = await admin()
      .from('voice_actor_applications')
      .select('*')
      .eq('tenant_id', tenant.id)
      .order('created_at', { ascending: false })
      .limit(200)
    const { data: t } = await admin().from('tenants').select('accept_actor_applications').eq('id', tenant.id).single()

    return NextResponse.json({
      applications: error ? [] : (apps || []),
      acceptApplications: t?.accept_actor_applications === true,
      migrated: !error,
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// Beslutning på en søknad, eller opt-in-bryteren for egen tenant
export async function PATCH(request: Request) {
  try {
    const g = await guard(request)
    if (g.fail) return g.fail
    const tenant = g.tenant!
    const body = await request.json()

    // Opt-in-bryteren: første «egen tenant»-innstilling — trygt scopet til egen rad
    if (typeof body.toggleAccept === 'boolean') {
      const { error } = await admin()
        .from('tenants')
        .update({ accept_actor_applications: body.toggleAccept })
        .eq('id', tenant.id)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ ok: true, acceptApplications: body.toggleAccept })
    }

    const applicationId = String(body.applicationId || '')
    const decision = String(body.decision || '')
    if (!applicationId || !['approved', 'rejected'].includes(decision)) {
      return NextResponse.json({ error: 'Mangler applicationId/decision' }, { status: 400 })
    }

    // Idempotent: kun fra status 'new', kun egen tenants søknader
    const { data: app, error: fetchErr } = await admin()
      .from('voice_actor_applications')
      .select('*')
      .eq('id', applicationId)
      .eq('tenant_id', tenant.id)
      .single()
    if (fetchErr || !app) return NextResponse.json({ error: 'Søknaden finnes ikke' }, { status: 404 })
    if (app.status !== 'new') {
      return NextResponse.json({ error: `Søknaden er allerede ${app.status === 'approved' ? 'godkjent' : 'avvist'}` }, { status: 409 })
    }

    let actorId: string | null = null
    if (decision === 'approved') {
      // Opprett INAKTIV skuespiller: satser + ElevenLabs-kloning gjøres på
      // skuespillersiden før aktivering (PVC-onboardingen er manuell = samtykkemodellen)
      const kontakt = [`Drop-in-søknad ${String(app.created_at).slice(0, 10)}`, app.phone ? `Tlf: ${app.phone}` : '', app.wants_face ? 'Vil også tilby ansiktet.' : '']
        .filter(Boolean).join(' · ')
      const { data: actor, error: createErr } = await admin()
        .from('voice_actors')
        .insert({
          owner_tenant_id: tenant.id,
          name: app.name,
          elevenlabs_voice_id: 'PENDING-KLONING',
          honorarium_nok: 0,
          actor_rate_nok: 0,
          customer_price_nok: 0,
          discount_tiers: [],
          notes: [kontakt, app.bio].filter(Boolean).join('\n'),
          actor_email: app.email,
          sample_urls: app.sample_urls || [],
          is_active: false,
          is_exclusive: true,
        })
        .select('id')
        .single()
      if (createErr) return NextResponse.json({ error: 'Kunne ikke opprette skuespilleren: ' + createErr.message }, { status: 500 })
      actorId = actor.id
    }

    const { error: updErr } = await admin()
      .from('voice_actor_applications')
      .update({ status: decision, decided_at: new Date().toISOString() })
      .eq('id', applicationId)
      .eq('status', 'new')
    if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 })

    return NextResponse.json({ ok: true, actorId })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
