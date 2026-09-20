import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getTenant } from '@/lib/tenantServer'
import { isTenantAdmin } from '@/lib/voiceBank'
import {
  opprettLisens, lisenserForSkuespiller, fordelingFor, trinnFor,
  foreslaaPris, skrivFordeling, standardSplits, hentTakstkort,
  type LisensInput, type SplitSpec, type LicenceStatus,
} from '@/lib/licences'
import { kr } from '@/lib/rateCard'

// Lisensadministrasjon for stemmebanken. Samme vakt som /api/voice-bank/admin:
// host-tenant + admin-sjekk oppover kjeden, identitet fra verifisert JWT.

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
  )
}

async function guard(request: Request): Promise<{ tenant?: Awaited<ReturnType<typeof getTenant>>; email?: string; fail?: NextResponse }> {
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
    return { fail: NextResponse.json({ error: 'Ingen admin-tilgang' }, { status: 403 }) }
  }
  return { tenant, email }
}

/** Skuespilleren må tilhøre denne banken — ellers kan en admin skrive lisenser på andres rader. */
async function eierSkuespilleren(tenantId: string, actorId: string): Promise<boolean> {
  const { data } = await admin()
    .from('voice_actors').select('id').eq('id', actorId).eq('owner_tenant_id', tenantId).maybeSingle()
  return !!data
}

// GET ?actorId=… → lisenser med fordeling og trinn
// GET ?actorId=…&quote=1&kind=…&… → listepris uten å lagre (forhåndsutfylling)
export async function GET(request: Request) {
  const { tenant, fail } = await guard(request)
  if (fail || !tenant) return fail!
  try {
    const url = new URL(request.url)
    const actorId = url.searchParams.get('actorId') || ''
    if (!actorId) return NextResponse.json({ error: 'Mangler actorId' }, { status: 400 })
    if (!(await eierSkuespilleren(tenant.id, actorId))) {
      return NextResponse.json({ error: 'Skuespilleren finnes ikke i denne banken' }, { status: 404 })
    }

    if (url.searchParams.get('quote')) {
      const i = {
        actorId, tenantId: tenant.id,
        kind: (url.searchParams.get('kind') || 'campaign') as LisensInput['kind'],
        asset: (url.searchParams.get('asset') || 'voice') as LisensInput['asset'],
        mediaClass: url.searchParams.get('mediaClass') as LisensInput['mediaClass'],
        territory: url.searchParams.get('territory') as LisensInput['territory'],
        termMonths: Number(url.searchParams.get('termMonths') ?? 3),
        exclusivity: (url.searchParams.get('exclusivity') || 'none') as LisensInput['exclusivity'],
        productionTier: url.searchParams.get('productionTier') as LisensInput['productionTier'],
        roleScope: url.searchParams.get('roleScope') as LisensInput['roleScope'],
      } as LisensInput
      const { listeNok, honorarNok, card } = await foreslaaPris(i)
      return NextResponse.json({ listeNok, honorarNok, rateCardVersion: card.version })
    }

    const licences = await lisenserForSkuespiller(actorId)
    const detaljer = await Promise.all(
      licences.map(async (l: { id: string }) => ({
        ...l,
        splits: await fordelingFor(l.id),
        steps: await trinnFor(l.id),
      }))
    )
    const card = await hentTakstkort(tenant.id)
    return NextResponse.json({ licences: detaljer, rateCard: card })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}

export async function POST(request: Request) {
  const { tenant, email, fail } = await guard(request)
  if (fail || !tenant) return fail!
  try {
    const body = await request.json()
    const actorId = String(body.actorId || '')
    if (!actorId) return NextResponse.json({ error: 'Mangler actorId' }, { status: 400 })
    if (!(await eierSkuespilleren(tenant.id, actorId))) {
      return NextResponse.json({ error: 'Skuespilleren finnes ikke i denne banken' }, { status: 404 })
    }
    if (body.kind === 'work' && !String(body.workTitle || '').trim()) {
      // Evigheten er bundet til verket. Uten tittel er bindingen tom, og da
      // har kunden i praksis kjøpt modellen.
      return NextResponse.json({ error: 'Verkslisens krever en verkstittel' }, { status: 400 })
    }
    const res = await opprettLisens({
      ...body,
      actorId,
      tenantId: tenant.id,
      createdBy: email ?? null,
    } as LisensInput)
    return NextResponse.json({ ok: true, ...res })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}

// PATCH: endre beløp, status eller parter på en eksisterende lisens.
// Endres et av beløpene, skrives fordelingen om i sin helhet — det er slik et
// nedforhandlet honorar slår gjennom hos alle som tar en andel AV honoraret.
export async function PATCH(request: Request) {
  const { tenant, fail } = await guard(request)
  if (fail || !tenant) return fail!
  try {
    const body = await request.json()
    const licenceId = String(body.licenceId || '')
    if (!licenceId) return NextResponse.json({ error: 'Mangler licenceId' }, { status: 400 })

    const { data: lic } = await admin()
      .from('licences').select('*').eq('id', licenceId).eq('tenant_id', tenant.id).maybeSingle()
    if (!lic) return NextResponse.json({ error: 'Lisensen finnes ikke i denne banken' }, { status: 404 })

    const patch: Record<string, unknown> = {}
    if (body.feeCustomerNok !== undefined) {
      const v = Number(body.feeCustomerNok)
      if (!(v >= 0)) return NextResponse.json({ error: 'Ugyldig kundepris' }, { status: 400 })
      patch.fee_customer_nok = kr(v)
    }
    if (body.feeActorNok !== undefined) {
      const v = Number(body.feeActorNok)
      if (!(v >= 0)) return NextResponse.json({ error: 'Ugyldig honorar' }, { status: 400 })
      patch.fee_actor_nok = kr(v)
    }
    if (typeof body.status === 'string') {
      const lovlige: LicenceStatus[] = ['quote', 'active', 'expired', 'superseded', 'cancelled']
      if (!lovlige.includes(body.status)) return NextResponse.json({ error: 'Ugyldig status' }, { status: 400 })
      patch.status = body.status
      if (body.status === 'active' && !lic.signed_at) patch.signed_at = new Date().toISOString()
    }
    if (body.notes !== undefined) patch.notes = String(body.notes || '') || null

    if (Object.keys(patch).length > 0) {
      const { error } = await admin().from('licences').update(patch).eq('id', licenceId)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const feeCustomer = Number(patch.fee_customer_nok ?? lic.fee_customer_nok)
    const feeActor = Number(patch.fee_actor_nok ?? lic.fee_actor_nok)

    // Partene: enten nye fra klienten, eller de som allerede ligger der.
    let parter: SplitSpec[]
    if (Array.isArray(body.splits)) {
      parter = body.splits as SplitSpec[]
    } else {
      const eksisterende = await fordelingFor(licenceId)
      parter = (eksisterende as Array<Record<string, unknown>>)
        .filter((r) => r.party_type !== 'rights_holder')
        .map((r) => ({
          party_type: r.party_type as SplitSpec['party_type'],
          party_tenant_id: (r.party_tenant_id as string) ?? null,
          party_label: (r.party_label as string) ?? null,
          basis: r.basis as SplitSpec['basis'],
          // Byrået er alltid resten — behold det som en restpost, ikke som et
          // frosset kronebeløp, ellers blir differansen borte ved neste endring.
          pct: r.party_type === 'agency' ? null : (r.pct as number) ?? null,
        }))
      if (parter.length === 0) parter = standardSplits(tenant.id, await hentTakstkort(tenant.id))
    }

    const fordeling = await skrivFordeling(licenceId, feeCustomer, feeActor, parter)
    return NextResponse.json({ ok: true, fordeling })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
