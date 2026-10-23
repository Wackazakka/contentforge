import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getTenant } from '@/lib/tenantServer'
import { isTenantAdmin } from '@/lib/voiceBank'

// Aldersmodellene (082) — der en admin legger dem til og forvalter dem.
// Før fantes de bare som rader lagt inn med SQL.
//
// 🔑 EN ALDERSMODELL ER EN FERDIG ANSIKTSMODELL SOM HUN HAR GODKJENT. Den
// trenes i Medvirkende fra bilder fra en tidligere periode, med henne som
// samtykkende person (089) — og hun får de samme prøvebildene til godkjenning
// (091). Først når hun har sagt ja, kan den legges til her. Godkjenningen er
// samtykket; teksten fryses på raden.
//
// 🔑 MODELLEN MÅ VÆRE AV HENNE. En modell trent med en annen persons e-post
// som samtykkende kan ikke festes på denne raden. Eksempelprofiler kan bruke
// modeller merket «ikke en virkelig person».
//
// 🔑 KILDEN SKAL STÅ PÅ RADEN (source_note), og klareringen er en PORT
// (source_cleared, 082): en uklarert aldersmodell dekkes aldri av en lisens
// (lib/twinVersions). Å klarere den gir en ny versjon av tvillingen (113).
//
// Ingen sletting: en aldersmodell slås av. Raden er provenienshistorikk, og
// databasen nekter uansett (on delete restrict).

function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || '', process.env.SUPABASE_SERVICE_ROLE_KEY || '')
}

async function guard(request: Request) {
  const tenant = await getTenant()
  if (tenant.id === 'root') return { fail: NextResponse.json({ error: 'Tenant-oppsett mangler' }, { status: 404 }) }
  const auth = request.headers.get('authorization')
  const email = auth?.startsWith('Bearer ') ? (await admin().auth.getUser(auth.slice(7))).data?.user?.email ?? null : null
  if (!email) return { fail: NextResponse.json({ error: 'Ikke innlogget' }, { status: 401 }) }
  if (!(await isTenantAdmin(email, tenant.id))) return { fail: NextResponse.json({ error: 'Ingen admin-tilgang' }, { status: 403 }) }
  return { tenant, email }
}

type Aktoer = { id: string; name: string; actor_email: string | null; face_character_id: string | null; is_demo: boolean | null }
type Karakter = {
  id: string; name: string | null; status: string; trainer: string | null
  approval_status: string | null; approved_at: string | null; withdrawn_at: string | null
  consent_subject: string | null; subject_email: string | null
}

async function hentAktoer(tenantId: string, actorId: string): Promise<Aktoer | null> {
  const { data } = await admin().from('voice_actors')
    .select('id, name, actor_email, face_character_id, is_demo')
    .eq('id', actorId).eq('owner_tenant_id', tenantId).maybeSingle()
  return data as Aktoer | null
}

/** Kan denne modellen bli en aldersmodell for denne rettighetshaveren? Null = ja, ellers grunnen. */
function hindring(a: Aktoer, k: Karakter): string | null {
  if (k.status !== 'ready') return 'Modellen er ikke ferdig trent'
  if (k.withdrawn_at) return 'Modellen er stengt'
  if (k.approval_status === 'pending') return 'Venter på at hun godkjenner prøvebildene'
  if (k.approval_status === 'rejected') return 'Hun sa nei til modellen'
  if (k.consent_subject === 'other_consented') {
    const hennes = (k.subject_email || '').trim().toLowerCase()
    if (!a.actor_email || hennes !== a.actor_email.trim().toLowerCase()) return 'Trent med en annen persons samtykke'
    return null
  }
  if (k.consent_subject === 'not_a_person') return a.is_demo ? null : 'Merket «ikke en virkelig person»'
  // 'self' og eldre rader uten erklæring: ingen bekreftelse på at det er henne.
  return 'Ikke trent med henne som samtykkende — tren den i Medvirkende med e-posten hennes'
}

async function svar(tenantId: string, a: Aktoer) {
  const db = admin()
  const { data: rader } = await db.from('actor_face_models')
    .select('id, character_id, label, age_from, age_to, source_note, source_cleared, is_default, is_active, consent_at, created_at, created_by')
    .eq('actor_id', a.id).order('is_default', { ascending: false }).order('created_at')
  const festet = new Set(((rader || []) as Array<{ character_id: string }>).map((r) => String(r.character_id)))
  const { data: karakterer } = await db.from('user_characters')
    .select('id, name, status, trainer, approval_status, approved_at, withdrawn_at, consent_subject, subject_email')
    .eq('owner_tenant_id', tenantId).order('created_at', { ascending: false })
  const alle = (karakterer || []) as Karakter[]
  const navn = new Map(alle.map((k) => [k.id, k]))
  return {
    models: ((rader || []) as Array<Record<string, unknown>>).map((r) => {
      const k = navn.get(String(r.character_id))
      return { ...r, characterName: k?.name ?? null, characterStatus: k?.status ?? null, approval: k?.approval_status ?? null, withdrawn: !!k?.withdrawn_at }
    }),
    // Kandidater: tenantens ferdige modeller som ikke alt er festet og ikke er
    // standardansiktet. Også de som ikke kan brukes, med grunnen — en tom liste
    // forteller ingen hva som mangler.
    candidates: alle
      .filter((k) => k.status === 'ready' && !festet.has(k.id) && k.id !== a.face_character_id)
      .map((k) => ({ id: k.id, name: k.name, trainer: k.trainer, approval: k.approval_status, blocked: hindring(a, k) })),
  }
}

export async function GET(request: Request) {
  const g = await guard(request)
  if (g.fail || !g.tenant) return g.fail!
  const actorId = new URL(request.url).searchParams.get('actorId') || ''
  const a = await hentAktoer(g.tenant.id, actorId)
  if (!a) return NextResponse.json({ error: 'Skuespilleren finnes ikke i denne banken' }, { status: 404 })
  return NextResponse.json(await svar(g.tenant.id, a))
}

const heltall = (v: unknown): number | null => {
  if (v === null || v === undefined || String(v).trim() === '') return null
  const n = Number(v)
  return Number.isInteger(n) && n >= 0 && n <= 120 ? n : NaN
}

export async function POST(request: Request) {
  const g = await guard(request)
  if (g.fail || !g.tenant) return g.fail!
  try {
    const b = await request.json()
    const a = await hentAktoer(g.tenant.id, String(b.actorId || ''))
    if (!a) return NextResponse.json({ error: 'Skuespilleren finnes ikke i denne banken' }, { status: 404 })

    const label = String(b.label || '').trim()
    if (!label || label.length > 60) return NextResponse.json({ error: 'Gi modellen en etikett, for eksempel «30 år» eller «1990-tallet» (maks 60 tegn).' }, { status: 400 })
    const fra = heltall(b.ageFrom), til = heltall(b.ageTo)
    if (Number.isNaN(fra) || Number.isNaN(til)) return NextResponse.json({ error: 'Alder må være et helt tall mellom 0 og 120.' }, { status: 400 })
    if (fra != null && til != null && fra > til) return NextResponse.json({ error: '«Fra»-alderen er høyere enn «til».' }, { status: 400 })
    const kilde = String(b.sourceNote || '').trim()
    if (kilde.length < 5) return NextResponse.json({ error: 'Skriv hvor bildene kommer fra. Det er proveniensen — det ingen andre kan vise til.' }, { status: 400 })

    const { data: kar } = await admin().from('user_characters')
      .select('id, name, status, trainer, approval_status, approved_at, withdrawn_at, consent_subject, subject_email')
      .eq('id', String(b.characterId || '')).eq('owner_tenant_id', g.tenant.id).maybeSingle()
    const k = kar as Karakter | null
    if (!k) return NextResponse.json({ error: 'Fant ikke modellen' }, { status: 404 })
    if (k.id === a.face_character_id) return NextResponse.json({ error: 'Det er standardansiktet hennes — det er alt med.' }, { status: 400 })
    const grunn = hindring(a, k)
    if (grunn) return NextResponse.json({ error: grunn }, { status: 409 })

    // Samtykket er godkjenningen hennes (091). Teksten fryses — slik den står
    // i dag, ikke slik den ville blitt skrevet om senere.
    const godkjent = k.approved_at ? new Date(k.approved_at).toLocaleDateString('nb-NO') : null
    const consent_text = k.consent_subject === 'not_a_person'
      ? `Modellen «${k.name ?? k.id}» er merket som ikke en virkelig person. Tilbys som aldersmodell «${label}» på eksempelprofilen ${a.name}.`
      : `${a.name} godkjente modellen «${k.name ?? k.id}»${godkjent ? ` ${godkjent}` : ''} via godkjenningslenken etter å ha sett prøvebildene. Tilbys som aldersmodell «${label}».`

    const { error } = await admin().from('actor_face_models').insert({
      actor_id: a.id, character_id: k.id, label, age_from: fra, age_to: til,
      consent_text, consent_at: k.approved_at ?? new Date().toISOString(),
      source_note: kilde, source_cleared: b.sourceCleared === true,
      is_default: false, is_active: true, created_by: g.email,
    })
    if (error) return NextResponse.json({ error: error.message.includes('actor_face_models_unik') ? 'Modellen er alt lagt til.' : error.message }, { status: 400 })
    return NextResponse.json(await svar(g.tenant.id, a))
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Ukjent feil' }, { status: 500 })
  }
}

export async function PATCH(request: Request) {
  const g = await guard(request)
  if (g.fail || !g.tenant) return g.fail!
  try {
    const b = await request.json()
    const a = await hentAktoer(g.tenant.id, String(b.actorId || ''))
    if (!a) return NextResponse.json({ error: 'Skuespilleren finnes ikke i denne banken' }, { status: 404 })
    const { data: rad } = await admin().from('actor_face_models').select('id, is_default')
      .eq('id', String(b.id || '')).eq('actor_id', a.id).maybeSingle()
    if (!rad) return NextResponse.json({ error: 'Fant ikke aldersmodellen' }, { status: 404 })
    // Standardraden speiler standardansiktet og forvaltes der (av-bryteren).
    if ((rad as { is_default: boolean }).is_default) return NextResponse.json({ error: 'Standardansiktet forvaltes over, ikke her.' }, { status: 400 })

    const patch: Record<string, unknown> = {}
    if (typeof b.sourceCleared === 'boolean') patch.source_cleared = b.sourceCleared
    if (typeof b.isActive === 'boolean') patch.is_active = b.isActive
    if (b.label !== undefined) {
      const label = String(b.label).trim()
      if (!label || label.length > 60) return NextResponse.json({ error: 'Etiketten må være 1–60 tegn.' }, { status: 400 })
      patch.label = label
    }
    if (b.sourceNote !== undefined) {
      const kilde = String(b.sourceNote).trim()
      if (kilde.length < 5) return NextResponse.json({ error: 'Skriv hvor bildene kommer fra.' }, { status: 400 })
      patch.source_note = kilde
    }
    if (b.ageFrom !== undefined || b.ageTo !== undefined) {
      const fra = heltall(b.ageFrom), til = heltall(b.ageTo)
      if (Number.isNaN(fra) || Number.isNaN(til)) return NextResponse.json({ error: 'Alder må være et helt tall mellom 0 og 120.' }, { status: 400 })
      if (fra != null && til != null && fra > til) return NextResponse.json({ error: '«Fra»-alderen er høyere enn «til».' }, { status: 400 })
      patch.age_from = fra; patch.age_to = til
    }
    if (Object.keys(patch).length === 0) return NextResponse.json({ error: 'Ingenting å endre' }, { status: 400 })
    const { error } = await admin().from('actor_face_models').update(patch).eq('id', (rad as { id: string }).id)
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json(await svar(g.tenant.id, a))
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Ukjent feil' }, { status: 500 })
  }
}
