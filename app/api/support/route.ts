import { NextResponse } from 'next/server'
import crypto from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'
import { fulltNavn } from '@/lib/tenantNames'
import { SUPPORT_KATEGORIER, SUPPORT_MOTTAKER as MOTTAKER, EPOST_MONSTER } from '@/lib/support'

// Supportsiden (/hjelp, migrasjon 109, Lars 21.10.2026). Henvendelsen lagres
// og sendes på e-post til Lars; «Svar» i e-posten går rett til brukeren.
// Åpen også for utloggede (den som ikke får logget inn, trenger hjelp mest),
// derfor felle-felt og maks 5 per time per avsender.

export const runtime = 'nodejs'

const MAKS_PER_TIME = 5

function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

function esc(s: string): string {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

export async function POST(request: Request) {
  let body: any = null
  try { body = await request.json() } catch { /* tom */ }
  // Felle: et skjult felt mennesker aldri fyller ut. Late som alt gikk bra.
  if (body?.nettsted) return NextResponse.json({ ok: true })

  const kategori = String(body?.kategori || '')
  const melding = String(body?.melding || '').trim().slice(0, 5000)
  const side = String(body?.side || '').slice(0, 300)
  if (!(SUPPORT_KATEGORIER as readonly string[]).includes(kategori)) return NextResponse.json({ error: 'Velg hva det gjelder' }, { status: 400 })
  if (melding.length < 5) return NextResponse.json({ error: 'Skriv litt mer om hva det gjelder' }, { status: 400 })

  const sb = admin()
  const { getTenant } = await import('@/lib/tenantServer')
  const tenant = await getTenant()
  const produkt = fulltNavn(tenant) || 'CenterForge'

  // Innlogget? Da vet vi hvem det er, og e-posten trengs ikke i skjemaet
  let userId: string | null = null
  let email = ''
  let navn: string | null = null
  const auth = request.headers.get('authorization')
  if (auth?.startsWith('Bearer ')) {
    const { data } = await sb.auth.getUser(auth.slice(7))
    if (data?.user) {
      userId = data.user.id
      email = data.user.email || ''
      navn = (data.user.user_metadata as any)?.full_name || null
    }
  }
  if (!email) email = String(body?.email || '').trim().toLowerCase().slice(0, 200)
  if (!EPOST_MONSTER.test(email)) return NextResponse.json({ error: 'Skriv inn e-postadressen din, så vi kan svare deg' }, { status: 400 })

  // Maks per time per avsender (IP-hash eller e-post)
  const ip = (request.headers.get('x-nf-client-connection-ip') || request.headers.get('x-forwarded-for') || '').split(',')[0].trim()
  const avsenderHash = ip ? crypto.createHash('sha256').update(ip).digest('hex') : null
  const enTimeSiden = new Date(Date.now() - 3600_000).toISOString()
  const filter = avsenderHash ? `avsender_hash.eq.${avsenderHash},email.eq.${email}` : `email.eq.${email}`
  const { count } = await sb.from('support_requests').select('id', { count: 'exact', head: true }).or(filter).gte('created_at', enTimeSiden)
  if ((count || 0) >= MAKS_PER_TIME) {
    return NextResponse.json({ error: `Du har sendt mange meldinger den siste timen. Prøv igjen litt senere, eller send e-post til ${MOTTAKER}.` }, { status: 429 })
  }

  // Litt sammenheng for Lars: artistene brukeren har på denne tjenesten
  let artister: string[] = []
  if (userId) {
    const { data: orgs } = await sb.from('organizations').select('id').eq('owner_id', userId).eq('tenant_id', tenant.id)
    const ids = (orgs || []).map((o: any) => o.id)
    if (ids.length) {
      const { data: prods } = await sb.from('products').select('name').in('organization_id', ids)
      artister = (prods || []).map((p: any) => p.name).filter(Boolean)
    }
  }
  const userAgent = (request.headers.get('user-agent') || '').slice(0, 300)

  const { data: rad, error: insErr } = await sb.from('support_requests').insert({
    user_id: userId, email, name: navn, tenant_slug: tenant.slug, kategori, melding, side: side || null,
    user_agent: userAgent || null, avsender_hash: avsenderHash,
  }).select('id').single()
  if (insErr || !rad) {
    console.error('[support] lagring feilet:', insErr?.message)
    return NextResponse.json({ error: `Noe gikk galt. Send gjerne e-post til ${MOTTAKER} i stedet.` }, { status: 500 })
  }

  const linje = (k: string, v: string) => `<tr><td style="padding:4px 12px 4px 0;color:#978B79;vertical-align:top;white-space:nowrap;">${esc(k)}</td><td style="padding:4px 0;color:#1C1A16;">${v}</td></tr>`
  const html = `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:15px;line-height:1.6;color:#1C1A16;max-width:620px;">
  <p style="margin:0 0 6px;font-size:13px;color:#978B79;">${esc(produkt)} · ${esc(kategori)} · trykk «Svar» for å svare brukeren direkte</p>
  <div style="white-space:pre-wrap;padding:14px 16px;border-radius:10px;background:#F4EEE2;margin:0 0 16px;">${esc(melding)}</div>
  <table cellpadding="0" cellspacing="0" style="font-size:13.5px;">
    ${linje('Fra', `${esc(navn || '')} &lt;${esc(email)}&gt;${userId ? '' : ' (ikke innlogget)'}`)}
    ${artister.length ? linje('Artister', esc(artister.join(', '))) : ''}
    ${side ? linje('Side', esc(side)) : ''}
    ${linje('Nettleser', esc(userAgent || 'ukjent'))}
    ${linje('Sak', esc(rad.id))}
  </table>
</div>`

  try {
    const { error: sendErr } = await new Resend(process.env.RESEND_API_KEY).emails.send({
      from: `${produkt} support <no-reply@send.norditech.io>`,
      to: MOTTAKER,
      replyTo: email,
      subject: `[${produkt}] ${kategori}: ${melding.replace(/\s+/g, ' ').slice(0, 60)}${melding.length > 60 ? '…' : ''}`,
      html,
    })
    if (sendErr) throw new Error(sendErr.message)
    await sb.from('support_requests').update({ epost_sendt: true }).eq('id', rad.id)
  } catch (err) {
    // Lagret, men ikke varslet: si fra, så brukeren ikke tror den kom fram
    console.error('[support] e-post feilet:', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: `Meldingen ble lagret, men varselet til oss feilet. Send gjerne e-post til ${MOTTAKER} også.` }, { status: 502 })
  }

  return NextResponse.json({ ok: true, email })
}
