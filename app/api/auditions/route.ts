import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getTenant } from '@/lib/tenantServer'
import { isTenantAdmin } from '@/lib/voiceBank'
import {
  opprettAudition, pollAudition, lagLesning, velgLesning, startFilm,
  AUDITION_FILM_NOK, AUDITION_READ_NOK,
} from '@/lib/auditions'

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
      .select('id, name, is_active, is_demo, elevenlabs_voice_id, face_character_id, owner_tenant_id, photo_urls, gender, playing_age_from, playing_age_to, height_cm, attributes')
      .eq('is_active', true)
    const klare = (actors || []).filter((a) => a.elevenlabs_voice_id && a.face_character_id)

    // Aldersmodellene (082) hører med i plukkeren: en veteran med modeller på
    // 30, 40 og 50 skal komme opp på «30» selv om hens eget spenn starter på
    // 55. Det er hele poenget med aldersmodellene, og et filter som bare så
    // på personens eget spenn ville skjult dem.
    //
    // ⚠️ Kun modeller med klarert treningssett: source_cleared er en PORT
    // (082), ikke et notat. En modell vi ikke kan selge, skal heller ikke
    // gjøre noen søkbar.
    //
    // Oppslaget er BEVISST tolerant: aldersmodellene beriker plukkeren, de
    // bærer den ikke. Feiler spørringen, skal utvalget fortsatt komme opp —
    // en caster som ikke får se noen i det hele tatt er langt verre enn en
    // som ikke ser aldersmodell-merket.
    const modellAlder = new Map<string, Array<{ from: number | null; to: number | null }>>()
    if (klare.length > 0) {
      const { data: modeller, error: modellFeil } = await admin().from('actor_face_models')
        .select('actor_id, age_from, age_to, source_cleared')
        .in('actor_id', klare.map((a) => a.id))
      if (modellFeil) console.warn('[audition] aldersmodeller utilgjengelig:', modellFeil.message)
      for (const m of modeller || []) {
        if (m.source_cleared !== true) continue
        if (m.age_from == null && m.age_to == null) continue
        const liste = modellAlder.get(String(m.actor_id)) || []
        liste.push({ from: m.age_from ?? null, to: m.age_to ?? null })
        modellAlder.set(String(m.actor_id), liste)
      }
    }

    // Hele kandidatsettet går ut i ett svar, og plukkeren filtrerer lokalt:
    // en caster klikker seg gjennom mange kombinasjoner, og et rundturskall
    // per klikk ville gjort utvalget tregt å utforske. Raden er liten.
    // Taket er der så svaret ikke vokser uten grense — nås det, sier
    // plukkeren fra i stedet for å vise et stille avkuttet utvalg.
    const TAK = 500
    return NextResponse.json({
      actors: klare.slice(0, TAK).map((a) => ({
        id: a.id, name: a.name, isDemo: a.is_demo === true,
        photo: Array.isArray(a.photo_urls) && a.photo_urls.length ? String(a.photo_urls[0]) : null,
        gender: a.gender ?? null,
        playingAgeFrom: a.playing_age_from ?? null,
        playingAgeTo: a.playing_age_to ?? null,
        heightCm: a.height_cm ?? null,
        attributes: (a.attributes as Record<string, string[]>) || {},
        modelAges: modellAlder.get(String(a.id)) || [],
      })),
      totalt: klare.length,
      avkuttet: klare.length > TAK,
      prisPerFilm: AUDITION_FILM_NOK,
      prisPerLesning: AUDITION_READ_NOK,
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

// PUT: de menneskelige handlingene i fase 1 og overgangen til fase 2.
//   read   — lag én lesning til på en skuespillerplass (billig, gjentakbar)
//   choose — velg hvilken lesning filmen skal bygges på
//   film   — start fase 2 for den plassen
//
// Alle tre er korte kall. Selve filmen skyves videre av poll-ruten, som før.
export async function PUT(request: Request) {
  const { tenant, fail } = await guard(request)
  if (fail || !tenant) return fail!
  try {
    const body = await request.json()
    const action = String(body.action || '')

    // Plassen må høre til en audition i DENNE banken — ellers kunne en admin
    // hos én tenant kjørt opp kostnader på en annen.
    const tilhorer = async (takeId: string) => {
      const { data } = await admin()
        .from('audition_takes')
        .select('id, audition_id, auditions!inner(tenant_id)')
        .eq('id', takeId).maybeSingle()
      const t = data as unknown as { auditions?: { tenant_id?: string } } | null
      return !!t && t.auditions?.tenant_id === tenant.id
    }

    if (action === 'read') {
      const takeId = String(body.takeId || '')
      if (!takeId || !(await tilhorer(takeId))) return NextResponse.json({ error: 'Finnes ikke' }, { status: 404 })
      const res = await lagLesning(takeId, body.direction ?? null)
      return NextResponse.json({ ok: true, ...res })
    }

    if (action === 'choose') {
      const readId = String(body.readId || '')
      if (!readId) return NextResponse.json({ error: 'Mangler readId' }, { status: 400 })
      const { data: r } = await admin().from('audition_reads').select('take_id').eq('id', readId).maybeSingle()
      if (!r || !(await tilhorer(String(r.take_id)))) return NextResponse.json({ error: 'Finnes ikke' }, { status: 404 })
      const res = await velgLesning(readId)
      return NextResponse.json({ ok: true, ...res })
    }

    if (action === 'film') {
      const takeId = String(body.takeId || '')
      if (!takeId || !(await tilhorer(takeId))) return NextResponse.json({ error: 'Finnes ikke' }, { status: 404 })
      await startFilm(takeId)
      return NextResponse.json({ ok: true })
    }

    return NextResponse.json({ error: 'Ukjent handling' }, { status: 400 })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 })
  }
}
