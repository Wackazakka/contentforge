import { NextResponse } from 'next/server'
import { admin, hashToken, hentTenant, tenantOrigin } from '@/lib/velkomst'

// Klikk på velkomstlenken (migrasjon 107). Tokenet brukes ÉN gang, og bare
// innen expires_at. Da lages en fersk Supabase-gjenopprettingslenke (gyldig
// 1 time, men brukes med en gang) som sender testeren rett til «Velg passord».
// POST (ikke GET): e-postskannere som forhåndsåpner lenker skal ikke kunne
// bruke opp tokenet — siden /velkommen krever et trykk på knappen.

export const runtime = 'nodejs'

export async function POST(request: Request) {
  let token = ''
  let besok = false
  try {
    const body = await request.json()
    token = String(body?.token || '')
    besok = body?.besok === true
  } catch { /* tom */ }
  if (!token) return NextResponse.json({ status: 'ugyldig' }, { status: 400 })

  const sb = admin()
  const hash = hashToken(token)

  // Besøk på velkomstsiden (111, Lars 27.10): registreres når siden åpnes,
  // uten å bruke opp lenken. Svarer med status, så siden kan si fra med en
  // gang om lenken er brukt eller utløpt.
  if (besok) {
    const { data: rad } = await sb.from('welcome_invites').select('id, seen_at, seen_count, used_at, expires_at').eq('token_hash', hash).maybeSingle()
    if (!rad) return NextResponse.json({ status: 'ugyldig' })
    await sb.from('welcome_invites')
      .update({ seen_at: rad.seen_at || new Date().toISOString(), seen_count: (rad.seen_count || 0) + 1 })
      .eq('id', rad.id)
    const status = rad.used_at ? 'brukt' : rad.expires_at && new Date(rad.expires_at).getTime() < Date.now() ? 'utlopt' : 'gyldig'
    return NextResponse.json({ status })
  }

  // Krev lenken atomisk: bare én forespørsel kan sette used_at
  const { data: krevd } = await sb
    .from('welcome_invites')
    .update({ used_at: new Date().toISOString() })
    .eq('token_hash', hash)
    .is('used_at', null)
    .gt('expires_at', new Date().toISOString())
    .select('id, email, tenant_slug')
  const inv = krevd?.[0]
  if (!inv) {
    // Hvorfor ikke? Gi testeren riktig beskjed
    const { data: rad } = await sb.from('welcome_invites').select('used_at, expires_at').eq('token_hash', hash).maybeSingle()
    const status = !rad ? 'ugyldig' : rad.used_at ? 'brukt' : 'utlopt'
    return NextResponse.json({ status }, { status: 410 })
  }

  const tenant = await hentTenant(inv.tenant_slug)
  const origin = tenant ? tenantOrigin(tenant) : new URL(request.url).origin
  const { data, error } = await sb.auth.admin.generateLink({
    type: 'recovery',
    email: inv.email,
    options: { redirectTo: `${origin}/reset-password?velkommen=1` },
  })
  const url = data?.properties?.action_link
  if (error || !url) {
    // Gi lenken tilbake, så testeren kan prøve igjen
    await sb.from('welcome_invites').update({ used_at: null }).eq('id', inv.id)
    console.error('[velkommen] generateLink feilet:', error?.message)
    return NextResponse.json({ status: 'feil' }, { status: 500 })
  }
  return NextResponse.json({ status: 'ok', url })
}
