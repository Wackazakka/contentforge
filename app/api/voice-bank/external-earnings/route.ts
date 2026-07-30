import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getTenant } from '@/lib/tenantServer'
import { isTenantAdmin } from '@/lib/voiceBank'

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
  )
}

// Eksterne inntekter per skuespiller (f.eks. ElevenLabs Voice Library).
//
// VIKTIG (verifisert 2026-07-30): dette er et REGNSKAPSNOTAT, ikke en pengestrøm.
// Proff-klonen ligger på skuespillerens EGEN ElevenLabs-konto — det er den eneste
// lovlige modellen, siden ElevenLabs kun tillater kloning av din egen stemme. Derfor
// betaler ElevenLabs bibliotek-inntekten rett til skuespillerens Stripe Connect-konto.
// Pengene passerer aldri oss, og vi tar ingen andel. Radene her føres manuelt kun for
// å ha oversikt over hva en skuespiller tjener utenfor plattformen.
//
// Konsekvens: library_share_pct er SOVENDE (som royalty_cut_pct og fee_*_pct) og skal
// ikke brukes til å regne ut en andel til oss. Ingenting her inngår i avregningen.

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
  if (!(await isTenantAdmin(email, tenant.id))) return { fail: NextResponse.json({ error: 'Ingen admin-tilgang' }, { status: 403 }) }
  return { tenant }
}

// Skuespilleren må tilhøre gjeldende tenant
async function ownActor(tenantId: string, actorId: string) {
  const { data } = await admin()
    .from('voice_actors').select('id').eq('id', actorId).eq('owner_tenant_id', tenantId).single()
  return data
}

export async function GET(request: Request) {
  const g = await guard(request)
  if (g.fail) return g.fail
  const actorId = new URL(request.url).searchParams.get('actorId')
  if (!actorId) return NextResponse.json({ error: 'Mangler actorId' }, { status: 400 })
  if (!(await ownActor(g.tenant!.id, actorId))) {
    return NextResponse.json({ error: 'Skuespilleren finnes ikke i denne banken' }, { status: 404 })
  }
  const { data } = await admin()
    .from('external_earnings')
    .select('id, source, period, gross_nok, note, created_at')
    .eq('actor_id', actorId)
    .order('period', { ascending: false })
  return NextResponse.json({ earnings: data || [] })
}

export async function POST(request: Request) {
  const g = await guard(request)
  if (g.fail) return g.fail
  const { actorId, period, grossNok, note, source } = await request.json()
  if (!actorId || !period || !/^\d{4}-\d{2}$/.test(String(period))) {
    return NextResponse.json({ error: 'Mangler actorId eller gyldig periode (ÅÅÅÅ-MM)' }, { status: 400 })
  }
  const gross = Number(grossNok)
  if (!(gross > 0)) return NextResponse.json({ error: 'Beløpet må være større enn 0' }, { status: 400 })
  if (!(await ownActor(g.tenant!.id, actorId))) {
    return NextResponse.json({ error: 'Skuespilleren finnes ikke i denne banken' }, { status: 404 })
  }
  const { error } = await admin().from('external_earnings').insert({
    actor_id: actorId,
    source: source ? String(source) : 'elevenlabs',
    period: String(period),
    gross_nok: gross,
    note: note ? String(note).slice(0, 500) : null,
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
