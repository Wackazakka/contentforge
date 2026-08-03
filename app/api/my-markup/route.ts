import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getTenant } from '@/lib/tenantServer'
import { isTenantAdmin } from '@/lib/voiceBank'

// Partnerens EGET påslag (Lars 3/8: «kan vi la dem sette påslag selv i admin?»).
//
// Hvorfor en egen rute: /api/partners lar deg redigere BARNA dine. Den sperren
// er bevisst — ingen skal kunne endre en annens rad. Her endres kun raden til
// tenanten forespørselen kommer fra (verten avgjør, ikke klienten), og kun ett
// felt.
//
// Påslaget styrer bare partnerens egen utsalgspris. Innprisen fra leddet over
// er den samme uansett, så dette er partnerens beslutning å ta.

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
  )
}

// Samme tilgangsmodell som resten av adminflatene: tenanten kommer fra VERTEN,
// og brukeren må være admin for den tenanten.
async function guard(request: Request) {
  const tenant = await getTenant()
  if (tenant.id === 'root') {
    return { fail: NextResponse.json({ error: 'Gjelder ikke denne kontoen' }, { status: 403 }) }
  }
  const auth = request.headers.get('authorization')
  let email: string | null = null
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

export async function GET(request: Request) {
  try {
    const g = await guard(request)
    if (g.fail) return g.fail
    const { data: t } = await admin()
      .from('tenants')
      .select('app_name, markup_percent, parent_tenant_id')
      .eq('id', g.tenant!.id)
      .single()
    if (!t) return NextResponse.json({ error: 'Fant ikke kontoen' }, { status: 404 })
    // Root har ingen innpris å legge på — påslaget gjelder bare underledd
    if (!t.parent_tenant_id) return NextResponse.json({ error: 'Gjelder ikke denne kontoen' }, { status: 403 })
    return NextResponse.json({ navn: t.app_name, markupPercent: Number(t.markup_percent ?? 0) })
  } catch {
    return NextResponse.json({ error: 'Noe gikk galt' }, { status: 500 })
  }
}

export async function PATCH(request: Request) {
  try {
    const g = await guard(request)
    if (g.fail) return g.fail
    const { data: t } = await admin()
      .from('tenants')
      .select('parent_tenant_id')
      .eq('id', g.tenant!.id)
      .single()
    if (!t?.parent_tenant_id) return NextResponse.json({ error: 'Gjelder ikke denne kontoen' }, { status: 403 })

    const { markupPercent } = await request.json().catch(() => ({}))
    const v = Number(markupPercent)
    if (!Number.isFinite(v)) {
      return NextResponse.json({ error: 'Påslaget må være et tall.' }, { status: 400 })
    }
    // Gulvet er 0: da selges det til innpris. Under det ville hver produksjon
    // gitt tap, og avregningen vist negativ «Til dere» — en knapp ingen skal
    // kunne skade seg på. Taket fanger skrivefeil (3000 i stedet for 300).
    if (v < 0) {
      return NextResponse.json({ error: 'Påslaget kan ikke være negativt — da ville dere solgt med tap.' }, { status: 400 })
    }
    if (v > 500) return NextResponse.json({ error: 'Maks 500 %.' }, { status: 400 })

    const verdi = Math.round(v * 100) / 100
    const { error } = await admin().from('tenants').update({ markup_percent: verdi }).eq('id', g.tenant!.id)
    if (error) return NextResponse.json({ error: 'Lagring feilet' }, { status: 500 })
    return NextResponse.json({ ok: true, markupPercent: verdi })
  } catch {
    return NextResponse.json({ error: 'Noe gikk galt' }, { status: 500 })
  }
}
