import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getTenant } from '@/lib/tenantServer'
import { isTenantAdmin } from '@/lib/voiceBank'
import { opprettAudition, pollAudition, AUDITION_TAKE_NOK } from '@/lib/auditions'

// Audition-ruten. Tre former:
//   POST            → opprett en audition med N takes (kjører ikke noe selv)
//   GET ?id=…       → skyv alle uferdige takes ett hakk og returner tilstanden
//   GET (uten id)   → skuespillere som KAN auditione (har både stemme og ansikt)
//
// ⚠️ Ingen rute venter på en render. Klienten poller GET ?id=… , og hver
// poll flytter hver take ett steg. Det er det som gjør at en audition kan ta
// fem minutter uten at noen forespørsel står og henger.

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
  )
}

async function guard(request: Request) {
  const tenant = await getTenant()
  if (tenant.id === 'root') return { fail: NextResponse.json({ error: 'Tenant-oppsett mangler' }, { status: 404 }) }
  let email: string | null = null
  const auth = request.headers.get('authorization')
  if (auth?.startsWith('Bearer ')) {
    const { data } = await admin().auth.getUser(auth.slice(7))
    email = data?.user?.email ?? null
  }
  if (!email) return { fail: NextResponse.json({ error: 'Ikke innlogget' }, { status: 401 }) }
  if (!(await isTenantAdmin(email, tenant.id))) {
    return { fail: NextResponse.json({ error: 'Ingen tilgang' }, { status: 403 }) }
  }
  return { tenant, email }
}

export async function GET(request: Request) {
  const { tenant, fail } = await guard(request)
  if (fail || !tenant) return fail!
  try {
    const id = new URL(request.url).searchParams.get('id')

    if (id) {
      const { data: a } = await admin().from('auditions').select('id, line, direction, scene_prompt, title, status')
        .eq('id', id).eq('tenant_id', tenant.id).maybeSingle()
      if (!a) return NextResponse.json({ error: 'Finnes ikke' }, { status: 404 })
      const res = await pollAudition(id)
      return NextResponse.json({ audition: a, ...res })
    }

    // Hvem kan auditione? Bare de som har BEGGE deler — en audition uten
    // ansikt er en lydfil, og uten stemme et stillbilde.
    const { data: actors } = await admin().from('voice_actors')
      .select('id, name, is_active, is_demo, elevenlabs_voice_id, face_character_id, owner_tenant_id, photo_urls')
      .eq('is_active', true)
    const klare = (actors || []).filter((a) => a.elevenlabs_voice_id && a.face_character_id)
    return NextResponse.json({
      actors: klare.map((a) => ({
        id: a.id, name: a.name, isDemo: a.is_demo === true,
        photo: Array.isArray(a.photo_urls) && a.photo_urls.length ? String(a.photo_urls[0]) : null,
      })),
      prisPerTake: AUDITION_TAKE_NOK,
    })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}

export async function POST(request: Request) {
  const { tenant, email, fail } = await guard(request)
  if (fail || !tenant) return fail!
  try {
    const body = await request.json()
    const line = String(body.line || '').trim()
    const scenePrompt = String(body.scenePrompt || '').trim()
    const actorIds: string[] = Array.isArray(body.actorIds) ? body.actorIds.map(String) : []

    if (!line) return NextResponse.json({ error: 'Replikken mangler' }, { status: 400 })
    if (!scenePrompt) return NextResponse.json({ error: 'Scenen mangler' }, { status: 400 })
    if (actorIds.length < 1) return NextResponse.json({ error: 'Velg minst én skuespiller' }, { status: 400 })
    if (actorIds.length > 8) return NextResponse.json({ error: 'Maks åtte i én runde' }, { status: 400 })

    const res = await opprettAudition({
      tenantId: tenant.id,
      organizationId: body.organizationId ?? null,
      title: body.title ?? null,
      line, direction: body.direction ?? 'noytral', scenePrompt,
      actorIds, createdBy: email ?? null,
    })
    return NextResponse.json({ ok: true, ...res })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
