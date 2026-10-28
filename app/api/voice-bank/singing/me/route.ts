import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getTenant } from '@/lib/tenantServer'
import { likeSafe } from '@/lib/epost'
import { modellerFor } from '@/lib/sangServer'

// Rettighetshaverens svar på sangmodellen (127) — på /min-stemme.
//
//   GET  ?actorId=                               modellene hennes, med prøven signert
//   POST { actorId, modelId, decision }          'approved' | 'rejected'
//
// 🔑 HUN HØRER PRØVEN FØR HUN SVARER, og svaret kan bare gis når det finnes en
// prøve å høre. Ingen modell tas i bruk før hun har sagt ja — det gjelder både
// en sanger og eieren av en virtuell artist.
//
// Sier hun ja og ingen modell er i bruk, tas denne i bruk med en gang (samme
// regel som egen ansiktsmodell, 115). Ny tvillingversjon lages av triggeren.

function db() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || '', process.env.SUPABASE_SERVICE_ROLE_KEY || '')
}

type Aktoer = { id: string; singing_model_id: string | null }

async function hentEgen(request: Request, actorId: unknown): Promise<{ a: Aktoer; epost: string } | NextResponse> {
  const auth = request.headers.get('authorization')
  if (!auth?.startsWith('Bearer ')) return NextResponse.json({ error: 'Ikke innlogget' }, { status: 401 })
  const { data: u } = await db().auth.getUser(auth.slice(7))
  const epost = u?.user?.email
  if (!epost) return NextResponse.json({ error: 'Ikke innlogget' }, { status: 401 })
  if (typeof actorId !== 'string' || !actorId) return NextResponse.json({ error: 'Mangler profil' }, { status: 400 })
  const tenant = await getTenant()
  const { data, error } = await db().from('voice_actors').select('id, singing_model_id')
    .eq('id', actorId).ilike('actor_email', likeSafe(epost)).eq('owner_tenant_id', tenant.id).maybeSingle()
  if (error) return NextResponse.json({ enabled: false, models: [] })
  if (!data) return NextResponse.json({ error: 'Fant ikke profilen din' }, { status: 404 })
  return { a: data as Aktoer, epost }
}

export async function GET(request: Request) {
  const g = await hentEgen(request, new URL(request.url).searchParams.get('actorId'))
  if (g instanceof NextResponse) return g
  const modeller = await modellerFor(g.a.id, g.a.singing_model_id)
  return NextResponse.json({ enabled: modeller !== null, models: modeller || [] })
}

export async function POST(request: Request) {
  try {
    const b = await request.json().catch(() => ({}))
    const g = await hentEgen(request, b.actorId)
    if (g instanceof NextResponse) return g
    const beslutning = b.decision === 'approved' ? 'approved' : b.decision === 'rejected' ? 'rejected' : null
    if (!beslutning) return NextResponse.json({ error: 'Ukjent svar' }, { status: 400 })

    const naa = new Date().toISOString()
    const { data, error } = await db().from('singing_models')
      .update({ approval_status: beslutning, approved_at: naa, approved_by: g.epost, updated_at: naa })
      .eq('id', String(b.modelId || '')).eq('actor_id', g.a.id)
      .eq('status', 'ready').eq('approval_status', 'pending').not('sample_path', 'is', null)
      .select('id')
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!data?.length) return NextResponse.json({ error: 'Modellen venter ikke på svar fra deg, eller prøven er ikke klar ennå.' }, { status: 409 })

    if (beslutning === 'approved' && !g.a.singing_model_id) {
      await db().from('voice_actors').update({ singing_model_id: data[0].id }).eq('id', g.a.id)
    }
    const modeller = await modellerFor(g.a.id, beslutning === 'approved' && !g.a.singing_model_id ? data[0].id : g.a.singing_model_id)
    return NextResponse.json({ enabled: true, models: modeller || [] })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Ukjent feil' }, { status: 500 })
  }
}
