import { NextResponse } from 'next/server'
import { cronVakt } from '@/lib/cronVakt'
import { Resend } from 'resend'
import { admin, hashToken, nyttToken, hentTenant, tenantOrigin, paminnelseEpost } from '@/lib/velkomst'
import { UNDERSOKELSE } from '@/lib/tilbakemelding'

// Påminnelse med utvidet frist (Lars 27.10). Kalles for hånd med
// x-cron-secret = WELCOME_SEND_SECRET og { epost: [...] }.
//
// Per adresse: siste invitasjon slås opp. Har testeren aldri logget inn, lages
// en NY invitasjonsrad med fersk lenke som virker til bonusfristen — den gamle
// raden røres ikke, så lenken i første e-post virker fortsatt. Er testeren i
// gang, sendes en lenke til appen i stedet.
// variant: 'ny' | 'i_gang' overstyrer valget — bare til forhåndsvisning.

export const runtime = 'nodejs'

export async function POST(request: Request) {
  const stopp = cronVakt(request, 'WELCOME_SEND_SECRET')
  if (stopp) return stopp

  const body = await request.json().catch(() => ({}))
  const adresser: string[] = Array.isArray(body?.epost) ? body.epost.map((e: unknown) => String(e).trim().toLowerCase()).filter(Boolean) : []
  const variant = body?.variant === 'ny' || body?.variant === 'i_gang' ? body.variant : null
  if (!adresser.length) return NextResponse.json({ error: 'epost mangler' }, { status: 400 })

  const sb = admin()
  const resend = new Resend(process.env.RESEND_API_KEY)
  const resultat: Array<{ email: string; ok: boolean; variant?: string; feil?: string }> = []

  for (const email of adresser) {
    const { data: inv } = await sb
      .from('welcome_invites')
      .select('user_id, email, full_name, tenant_slug, credits, svar_til, hilsen_fra, used_at')
      .eq('email', email)
      .not('sent_at', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (!inv) { resultat.push({ email, ok: false, feil: 'ingen sendt invitasjon' }); continue }
    const tenant = await hentTenant(inv.tenant_slug)
    if (!tenant) { resultat.push({ email, ok: false, feil: `ukjent tenant ${inv.tenant_slug}` }); continue }

    const { data: bruker } = await sb.auth.admin.getUserById(inv.user_id)
    const iGang = variant ? variant === 'i_gang' : Boolean(bruker?.user?.last_sign_in_at || inv.used_at)

    let lenke: string | null = null
    let nyRad: string | null = null
    if (!iGang) {
      const token = nyttToken()
      const naa = new Date().toISOString()
      const { data: rad, error } = await sb.from('welcome_invites').insert({
        user_id: inv.user_id, email: inv.email, full_name: inv.full_name, tenant_slug: inv.tenant_slug,
        credits: inv.credits, svar_til: inv.svar_til, hilsen_fra: inv.hilsen_fra,
        send_at: naa, sent_at: naa, token_hash: hashToken(token), expires_at: UNDERSOKELSE.bonusFrist,
      }).select('id').single()
      if (error || !rad) { resultat.push({ email, ok: false, feil: error?.message || 'kunne ikke lage lenke' }); continue }
      nyRad = rad.id
      lenke = `${tenantOrigin(tenant)}/velkommen?t=${encodeURIComponent(token)}`
    }

    const { subject, html, fra } = paminnelseEpost(tenant, lenke, inv.full_name, inv.credits != null ? Number(inv.credits) : null, inv.svar_til || null, inv.hilsen_fra || null)
    try {
      // Resend KASTER IKKE ved feil — { error } må sjekkes
      const { error: sendErr } = await resend.emails.send({ from: fra, to: inv.email, subject, html, ...(inv.svar_til ? { replyTo: inv.svar_til } : {}) })
      if (sendErr) throw new Error(sendErr.message)
      resultat.push({ email, ok: true, variant: iGang ? 'i_gang' : 'ny' })
    } catch (err) {
      if (nyRad) await sb.from('welcome_invites').delete().eq('id', nyRad)
      const feil = err instanceof Error ? err.message : String(err)
      console.error('[velkommen/paminnelse]', email, feil)
      resultat.push({ email, ok: false, feil })
    }
  }

  return NextResponse.json({ sendt: resultat.filter((r) => r.ok).length, resultat })
}
