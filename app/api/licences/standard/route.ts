import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getTenant } from '@/lib/tenantServer'
import { standardTilbud, kjoepStandardLisens, kundensLisenser, lesValg } from '@/lib/standardLisensServer'

// Standardlisens for en innlogget kunde (128) — fra «Be om lisens»-sida.
//
//   GET  ?actorId=&kind=&asset=&mediaClass=&territory=&termMonths=&exclusivity=
//        → kan valget kjøpes som standardlisens, prisen, vilkårene, og kundens
//          lisenser på denne rettighetshaveren
//   POST { actorId, ...valget, productionTitle?, termsText }
//        → lisensen, aktiv med en gang, prisen trukket fra saldoen
//
// 🔑 KUNDEN OG ORGANISASJONEN KOMMER FRA SESJONEN, prisen fra takstkortet på
// serveren. Klienten sender bare valget og vilkårsteksten hun godtok.

function db() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || '', process.env.SUPABASE_SERVICE_ROLE_KEY || '')
}

async function hvem(request: Request) {
  const auth = request.headers.get('authorization')
  if (!auth?.startsWith('Bearer ')) return null
  const { data } = await db().auth.getUser(auth.slice(7))
  return data?.user?.id ? { id: data.user.id, email: data.user.email ?? null } : null
}

/** Kundens organisasjon PÅ DETTE DOMENET — samme regel som forespørslene og saldoen. */
async function orgFor(userId: string, tenantId: string): Promise<{ id: string; name: string | null } | null> {
  const { data } = await db().from('organizations').select('id, name, tenant_id').eq('owner_id', userId)
    .order('created_at', { ascending: true })
  const liste = data || []
  const traff = tenantId && tenantId !== 'root' ? liste.find((o) => o.tenant_id === tenantId) : null
  const o = traff ?? liste[0]
  return o ? { id: o.id as string, name: (o.name as string | null) ?? null } : null
}

/** Rettighetshaveren må være tilgjengelig for kunder på dette domenet. */
async function tilgjengelig(tenantId: string, actorId: string): Promise<boolean> {
  const { getAvailableVoiceActors, getAvailableFaceActors } = await import('@/lib/voiceBank')
  const [s, f] = await Promise.all([getAvailableVoiceActors(tenantId), getAvailableFaceActors(tenantId)])
  return [...s, ...f].some((a) => a.id === actorId)
}

export async function GET(request: Request) {
  const bruker = await hvem(request)
  if (!bruker) return NextResponse.json({ error: 'Ikke innlogget' }, { status: 401 })
  const p = new URL(request.url).searchParams
  const actorId = String(p.get('actorId') || '')
  const tenant = await getTenant()
  if (!actorId || !(await tilgjengelig(tenant.id, actorId))) {
    return NextResponse.json({ error: 'Ukjent skuespiller, eller ikke tilgjengelig her' }, { status: 404 })
  }
  const tilbud = await standardTilbud(actorId, lesValg(Object.fromEntries(p.entries())))
  const org = await orgFor(bruker.id, tenant.id)
  const lisenser = org ? await kundensLisenser(org.id, actorId).catch(() => []) : []
  return NextResponse.json({ ...tilbud, myLicences: lisenser })
}

export async function POST(request: Request) {
  try {
    const bruker = await hvem(request)
    if (!bruker) return NextResponse.json({ error: 'Ikke innlogget' }, { status: 401 })
    const b = await request.json().catch(() => ({}))
    const actorId = String(b.actorId || '')
    const tenant = await getTenant()
    if (!actorId || !(await tilgjengelig(tenant.id, actorId))) {
      return NextResponse.json({ error: 'Ukjent skuespiller, eller ikke tilgjengelig her' }, { status: 404 })
    }
    const org = await orgFor(bruker.id, tenant.id)
    if (!org) return NextResponse.json({ error: 'Kontoen har ingen organisasjon ennå. Åpne oversikten én gang, så lages den.', code: 'NO_ORG' }, { status: 409 })

    const svar = await kjoepStandardLisens({
      actorId, organizationId: org.id, hvem: bruker.email || bruker.id, valg: lesValg(b),
      productionTitle: b.productionTitle ? String(b.productionTitle) : null,
      termsText: b.termsText, via: 'web', customerLabel: org.name,
    })
    if (!svar.ok) return NextResponse.json({ error: svar.error, code: svar.code }, { status: svar.status })
    return NextResponse.json({ ...svar, myLicences: await kundensLisenser(org.id, actorId).catch(() => []) })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Ukjent feil' }, { status: 500 })
  }
}
