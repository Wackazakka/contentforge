import { NextResponse } from 'next/server'
import crypto from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'
import { produktnavn } from '@/lib/tenantNames'

// Supabase Send Email Hook: kalles hver gang Supabase skal sende en auth-mail
// (bekreftelse, reset, invitasjon, magisk lenke, e-postbytte). Vi tar over
// utsendingen for aa kunne velge SPRAAK og MERKE per tenant -- Supabase har
// bare én malsett per database (Lars 06.10). Norsk for PromoMaker, engelsk for
// Isabel, med riktig navn/logo.
//
// 🔑 BLAST RADIUS: dette er ALL auth-e-post for ALLE tenanter. Feiler ruta,
// faar ingen bekreftelses-/reset-mail. Rulle tilbake = sett
// hook_send_email_enabled=false i Supabase, saa gjelder de innebygde malene
// igjen (de norske satt 06.10). Derfor: verifiser signatur, og returner 500
// ved ekte feil saa brukeren ser «kunne ikke sende» i stedet for aa tro det
// gikk bra uten aa faa noe.

export const runtime = 'nodejs' // node:crypto + Resend trenger Node, ikke edge

function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

function esc(s: string): string {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

// Velg lesbar knappetekst ut fra aksentfargens luminans. Isabels aksent er lys
// lilla -> hvit tekst forsvinner; mørk tekst paa lys bakgrunn, lys paa mørk.
function lesbarTekst(bg: string): string {
  const m = /^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.exec(String(bg).trim())
  if (!m) return '#FFFDF8'
  let h = m[1]
  if (h.length === 3) h = h.split('').map((c) => c + c).join('')
  const ch = (i: number) => parseInt(h.slice(i, i + 2), 16) / 255
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4))
  const L = 0.2126 * lin(ch(0)) + 0.7152 * lin(ch(2)) + 0.0722 * lin(ch(4))
  return L > 0.5 ? '#1C1A16' : '#FFFDF8'
}

// Standard Webhooks (samme som Supabase signerer med). Secret: «v1,whsec_<b64>».
function verifiser(secretRaw: string, headers: Headers, body: string): boolean {
  const id = headers.get('webhook-id')
  const ts = headers.get('webhook-timestamp')
  const sigHeader = headers.get('webhook-signature')
  if (!id || !ts || !sigHeader) return false
  // Replay-vern: innen 5 minutter
  if (Math.abs(Math.floor(Date.now() / 1000) - Number(ts)) > 300) return false
  const base = secretRaw.startsWith('v1,') ? secretRaw.slice(3) : secretRaw
  const key = Buffer.from(base.replace(/^whsec_/, ''), 'base64')
  const forventet = crypto.createHmac('sha256', key).update(`${id}.${ts}.${body}`).digest('base64')
  // Headeren er mellomromsdelt liste av «v1,<sig>»
  return sigHeader.split(' ').some((del) => {
    const sig = del.includes(',') ? del.split(',')[1] : del
    try {
      const a = Buffer.from(sig)
      const b = Buffer.from(forventet)
      return a.length === b.length && crypto.timingSafeEqual(a, b)
    } catch {
      return false
    }
  })
}

type TenantLite = {
  slug: string
  app_name: string
  product_name: string | null
  logo_url: string | null
  default_locale: string | null
  colors: Record<string, string> | null
}

const ROOT: TenantLite = { slug: 'centerforge', app_name: 'CenterForge', product_name: null, logo_url: null, default_locale: 'no', colors: null }
const COLS = 'slug, app_name, product_name, logo_url, default_locale, colors'

// Finn tenant fra domenet i redirect_to (eget domene ELLER subdomene av
// norditech.io), ellers tenant_slug lagret paa brukeren ved registrering.
async function finnTenant(redirectTo: string | undefined, slug: string | undefined): Promise<TenantLite> {
  const sb = admin()
  let host = ''
  try {
    if (redirectTo) host = new URL(redirectTo).host.split(':')[0].toLowerCase().replace(/^www\./, '')
  } catch { /* ugyldig url → fall videre */ }
  if (host) {
    const { data } = await sb.from('tenants').select(COLS).eq('custom_domain', host).eq('is_active', true).maybeSingle()
    if (data) return data as TenantLite
    const sub = host.endsWith('.norditech.io') ? host.slice(0, -'.norditech.io'.length).split('.').pop() : null
    if (sub) {
      const { data: d2 } = await sb.from('tenants').select(COLS).eq('slug', sub).eq('is_active', true).maybeSingle()
      if (d2) return d2 as TenantLite
    }
  }
  if (slug) {
    const { data } = await sb.from('tenants').select(COLS).eq('slug', slug).eq('is_active', true).maybeSingle()
    if (data) return data as TenantLite
  }
  return ROOT
}

function tekst(action: string, en: boolean, produkt: string) {
  const er = (no: string, eng: string) => (en ? eng : no)
  switch (action) {
    case 'recovery':
      return {
        subject: er('Tilbakestill passordet ditt', 'Reset your password'),
        heading: er('Tilbakestill passordet ditt', 'Reset your password'),
        intro: er('Vi fikk en forespørsel om å tilbakestille passordet ditt. Trykk på knappen under for å velge et nytt.', 'We received a request to reset your password. Click the button below to choose a new one.'),
        button: er('Velg nytt passord', 'Choose new password'),
        foot: er('Hvis du ikke ba om dette, kan du trygt se bort fra e-posten — passordet ditt forblir uendret.', "If you didn't request this, you can safely ignore this email — your password stays unchanged."),
      }
    case 'invite':
      return {
        subject: er(`Du er invitert til ${produkt}`, `You've been invited to ${produkt}`),
        heading: er('Du er invitert', "You've been invited"),
        intro: er('Trykk på knappen under for å opprette kontoen din og komme i gang.', 'Click the button below to set up your account and get started.'),
        button: er('Godta invitasjon', 'Accept invitation'),
        foot: er('Visste du ikke om denne invitasjonen? Da kan du se bort fra e-posten.', "Not expecting this invitation? You can ignore this email."),
      }
    case 'magiclink':
      return {
        subject: er('Innloggingslenken din', 'Your sign-in link'),
        heading: er('Logg inn', 'Sign in'),
        intro: er('Trykk på knappen under for å logge inn.', 'Click the button below to sign in.'),
        button: er('Logg inn', 'Sign in'),
        foot: er('Hvis du ikke ba om denne lenken, kan du se bort fra e-posten.', "If you didn't request this link, you can ignore this email."),
      }
    case 'email_change':
      return {
        subject: er('Bekreft den nye e-postadressen din', 'Confirm your new email address'),
        heading: er('Bekreft den nye e-postadressen din', 'Confirm your new email address'),
        intro: er('Trykk på knappen under for å bekrefte at du vil bytte til denne e-postadressen.', 'Click the button below to confirm you want to switch to this email address.'),
        button: er('Bekreft ny adresse', 'Confirm new address'),
        foot: er('Hvis du ikke ba om dette, kan du se bort fra e-posten.', "If you didn't request this, you can ignore this email."),
      }
    default: // signup
      return {
        subject: er('Bekreft e-postadressen din', 'Confirm your email address'),
        heading: er('Bekreft e-postadressen din', 'Confirm your email address'),
        intro: er('Takk for at du registrerte deg! Trykk på knappen under for å bekrefte adressen og fullføre registreringen.', 'Thanks for signing up! Click the button below to confirm your address and finish creating your account.'),
        button: er('Bekreft e-postadressen', 'Confirm email address'),
        foot: er('Hvis du ikke registrerte deg, kan du trygt se bort fra denne e-posten.', "If you didn't sign up, you can safely ignore this email."),
      }
  }
}

export async function POST(request: Request) {
  const secret = process.env.SEND_EMAIL_HOOK_SECRET
  if (!secret) {
    console.error('[auth/send-email-hook] SEND_EMAIL_HOOK_SECRET mangler')
    return NextResponse.json({ error: 'Not configured' }, { status: 500 })
  }
  const body = await request.text()
  if (!verifiser(secret, request.headers, body)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  let payload: any
  try { payload = JSON.parse(body) } catch { return NextResponse.json({ error: 'Bad JSON' }, { status: 400 }) }

  const epost: string = payload?.user?.email
  const ed = payload?.email_data || {}
  const rawAction: string = ed.email_action_type || 'signup'
  const action = rawAction.startsWith('email_change') ? 'email_change' : rawAction
  if (!epost || !ed.token_hash) {
    return NextResponse.json({ error: 'Missing email or token' }, { status: 400 })
  }

  const tenant = await finnTenant(ed.redirect_to, payload?.user?.user_metadata?.tenant_slug)
  const en = tenant.default_locale === 'en'
  const produkt = (produktnavn(tenant as any) || 'CenterForge').replace(/[<>"]/g, '')
  const aksent = (tenant.colors && tenant.colors['--ember']) || '#1C1A16'

  // Bekreftelseslenken bygges mot AUTH-serveren (prosjekt-URL), ikke tenantens
  // domene — verify ligger paa Supabase.
  const supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const lenke = `${supaUrl}/auth/v1/verify?token=${encodeURIComponent(ed.token_hash)}&type=${encodeURIComponent(action)}` +
    (ed.redirect_to ? `&redirect_to=${encodeURIComponent(ed.redirect_to)}` : '')

  const t = tekst(action, en, produkt)
  const logo = tenant.logo_url
    ? `<img src="${esc(tenant.logo_url)}" alt="${esc(produkt)}" height="38" style="height:38px;max-width:220px;object-fit:contain;display:block;" />`
    : `<span style="font-size:22px;font-weight:700;color:#1C1A16;">${esc(produkt)}</span>`

  const html = `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#F4EEE2;padding:40px 16px;">
  <div style="max-width:520px;margin:0 auto;">
    <div style="text-align:center;padding-bottom:26px;">${logo}</div>
    <div style="background:#FFFDF8;border:1px solid #E6DDCC;border-radius:16px;padding:36px 36px 30px;">
      <h1 style="margin:0 0 10px;font-size:22px;font-weight:700;color:#1C1A16;">${esc(t.heading)}</h1>
      <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#5E564A;">${esc(t.intro)}</p>
      <table cellpadding="0" cellspacing="0"><tr>
        <td style="border-radius:10px;background:${esc(aksent)};">
          <a href="${lenke}" style="display:inline-block;padding:13px 28px;font-size:15px;font-weight:600;color:${lesbarTekst(aksent)};text-decoration:none;border-radius:10px;">${esc(t.button)}</a>
        </td>
      </tr></table>
      <p style="margin:22px 0 0;font-size:12.5px;line-height:1.5;color:#978B79;">${en ? "Button not working? Paste this link into your browser:" : 'Funker ikke knappen? Lim denne lenken inn i nettleseren:'}<br><a href="${lenke}" style="color:#978B79;word-break:break-all;">${lenke}</a></p>
      <p style="margin:18px 0 0;font-size:12.5px;line-height:1.5;color:#978B79;">${esc(t.foot)}</p>
    </div>
    <p style="text-align:center;margin:18px 0 0;font-size:11.5px;color:#978B79;">${esc(produkt)} ${en ? 'is delivered by Norditech' : 'leveres av Norditech'}</p>
  </div>
</div>`

  try {
    const resend = new Resend(process.env.RESEND_API_KEY)
    const { error } = await resend.emails.send({
      from: `${produkt} <no-reply@send.norditech.io>`,
      to: epost,
      subject: t.subject,
      html,
    })
    if (error) {
      console.error('[auth/send-email-hook] Resend-feil:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
  } catch (err: any) {
    console.error('[auth/send-email-hook] exception:', err?.message || err)
    return NextResponse.json({ error: 'Send failed' }, { status: 500 })
  }
  return NextResponse.json({})
}
