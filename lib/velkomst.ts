import crypto from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { produktnavn } from '@/lib/tenantNames'

// Velkomstinvitasjoner (migrasjon 107, Lars 20.10.2026). Testere får en ferdig
// konto og en e-post med VÅR lenke til «Velg passord». Supabase sine
// e-postlenker varer bare 1 time; vår varer GYLDIG_TIMER og lager en fersk
// Supabase-lenke først når den klikkes (/api/velkommen).

export const GYLDIG_TIMER = 24

export function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

// Tokenet finnes bare i e-posten; databasen har kun hashen
export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex')
}
export function nyttToken(): string {
  return crypto.randomBytes(32).toString('base64url')
}

export type VelkomstTenant = {
  slug: string
  app_name: string
  product_name: string | null
  logo_url: string | null
  colors: Record<string, string> | null
  custom_domain: string | null
}

export async function hentTenant(slug: string): Promise<VelkomstTenant | null> {
  const { data } = await admin()
    .from('tenants')
    .select('slug, app_name, product_name, logo_url, colors, custom_domain')
    .eq('slug', slug)
    .eq('is_active', true)
    .maybeSingle()
  return (data as VelkomstTenant) || null
}

// Tenantens offentlige adresse: eget domene, ellers <slug>.norditech.io
export function tenantOrigin(t: VelkomstTenant): string {
  return `https://${t.custom_domain || `${t.slug}.norditech.io`}`
}

function esc(s: string): string {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

// Lesbar knappetekst ut fra aksentens luminans (samme regel som auth-hooken)
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

export function velkomstEpost(t: VelkomstTenant, lenke: string, navn: string | null, kreditter: number | null) {
  const produkt = (produktnavn(t as any) || 'CenterForge').replace(/[<>"]/g, '')
  const aksent = (t.colors && t.colors['--ember']) || '#1C1A16'
  const fornavn = (navn || '').trim().split(/\s+/)[0]
  const origin = tenantOrigin(t)
  const logo = t.logo_url
    ? `<img src="${esc(t.logo_url)}" alt="${esc(produkt)}" height="38" style="height:38px;max-width:220px;object-fit:contain;display:block;margin:0 auto;" />`
    : `<span style="font-size:22px;font-weight:700;color:#1C1A16;">${esc(produkt)}</span>`
  const subject = `Velkommen til ${produkt}`
  const html = `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#F4EEE2;padding:40px 16px;">
  <div style="max-width:520px;margin:0 auto;">
    <div style="text-align:center;padding-bottom:26px;">${logo}</div>
    <div style="background:#FFFDF8;border:1px solid #E6DDCC;border-radius:16px;padding:36px 36px 30px;">
      <h1 style="margin:0 0 10px;font-size:22px;font-weight:700;color:#1C1A16;">${fornavn ? `Hei, ${esc(fornavn)}! ` : ''}Velkommen til ${esc(produkt)}</h1>
      <p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:#5E564A;">${kreditter ? `Du har fått en testkonto med <strong>${Math.round(kreditter).toLocaleString('nb-NO')} kreditter</strong>. Det holder til mange videoer.` : 'Kontoen din er klar.'}</p>
      <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#5E564A;">For å lage en video trenger du bare fotografier og musikk. Programmet gjør bildene levende.</p>
      <table cellpadding="0" cellspacing="0"><tr>
        <td style="border-radius:10px;background:${esc(aksent)};">
          <a href="${lenke}" style="display:inline-block;padding:13px 28px;font-size:15px;font-weight:600;color:${lesbarTekst(aksent)};text-decoration:none;border-radius:10px;">Velg passord og kom i gang</a>
        </td>
      </tr></table>
      <p style="margin:22px 0 0;font-size:12.5px;line-height:1.5;color:#978B79;">Lenken virker i ${GYLDIG_TIMER} timer og kan brukes én gang. Har den gått ut, går du til <a href="${origin}/login" style="color:#978B79;">${esc(origin.replace('https://', ''))}/login</a> og trykker «Glemt passord» med denne e-postadressen.</p>
      <p style="margin:12px 0 0;font-size:12.5px;line-height:1.5;color:#978B79;">Funker ikke knappen? Lim denne lenken inn i nettleseren:<br><a href="${lenke}" style="color:#978B79;word-break:break-all;">${lenke}</a></p>
    </div>
    <p style="text-align:center;margin:18px 0 0;font-size:11.5px;color:#978B79;">${esc(produkt)} leveres av Norditech</p>
  </div>
</div>`
  return { subject, html, fra: `${produkt} <no-reply@send.norditech.io>` }
}
