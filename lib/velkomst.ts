import crypto from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { produktnavn, fulltNavn } from '@/lib/tenantNames'
import { COSTS_NOK, fmtCredits, TRENING_RAAKOST_NOK, treningListeprisNok } from '@/lib/costs'
import { chainFactorByTenantId } from '@/lib/tenantBilling'
import { wholesaleFactor } from '@/lib/platformMarkup'
import { UNDERSOKELSE } from '@/lib/tilbakemelding'

// Velkomstinvitasjoner (migrasjon 107, Lars 20.10.2026). Testere får en ferdig
// konto og en e-post med VÅR lenke til «Velg passord». Supabase sine
// e-postlenker varer bare 1 time; vår varer GYLDIG_TIMER og lager en fersk
// Supabase-lenke først når den klikkes (/api/velkommen).

// Én uke (Lars 24.10: ingen av testerne rakk å klikke innen et døgn)
export const GYLDIG_TIMER = 24 * 7
// «7 dager» / «24 timer» — til teksten i e-posten
const GYLDIG_TEKST = GYLDIG_TIMER % 24 === 0 ? `${GYLDIG_TIMER / 24} dager` : `${GYLDIG_TIMER} timer`

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
  id: string
  slug: string
  app_name: string
  product_name: string | null
  logo_url: string | null
  colors: Record<string, string> | null
  custom_domain: string | null
  wholesale_markup_pct: number | null
  vertical: string | null
}

export async function hentTenant(slug: string): Promise<VelkomstTenant | null> {
  const { data } = await admin()
    .from('tenants')
    .select('id, slug, app_name, product_name, logo_url, colors, custom_domain, wholesale_markup_pct, vertical')
    .eq('slug', slug)
    .eq('is_active', true)
    .maybeSingle()
  return (data as VelkomstTenant) || null
}

// Prisfaktoren brukerne SER i appen (tenantServer.chainPriceFactor): partnernes
// påslag i kjeden × vårt innkjøpspåslag. E-posten skal vise de samme tallene
// som knappene i editoren, ellers spriker det for testeren.
export async function visningsfaktor(t: VelkomstTenant): Promise<number> {
  return (await chainFactorByTenantId(t.id)) * wholesaleFactor(t.wholesale_markup_pct)
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

// «Slik kommer du i gang» og «Dette koster kreditter» (Lars 20.10: testerne
// skal få info sammen med kredittene, og instruksene de trenger). Ordene i
// stegene er de som står i appen (music-vertikalen). Prisene er COSTS_NOK ×
// visningsfaktoren — samme tall som knappene i editoren viser.
const p = (tekst: string) => `<p style="margin:0 0 10px;font-size:14.5px;line-height:1.6;color:#5E564A;">${tekst}</p>`
const h = (tekst: string) => `<h2 style="margin:26px 0 10px;font-size:16px;font-weight:700;color:#1C1A16;">${tekst}</h2>`

// «Slik kommer du i gang» — delt av velkomsten og påminnelsen (Lars 27.10)
function kommIGang(t: VelkomstTenant): string {
  if (t.vertical !== 'music') return ''
  const steg = (n: number, tekst: string) =>
    `<tr><td style="vertical-align:top;padding:0 10px 10px 0;font-size:14.5px;font-weight:700;color:#1C1A16;">${n}.</td><td style="padding:0 0 10px;font-size:14.5px;line-height:1.6;color:#5E564A;">${tekst}</td></tr>`
  let html = h('Slik kommer du i gang')
  html += `<table cellpadding="0" cellspacing="0">${[
    'Når du har valgt passord og er inne, trykker du «+ Legg til artisten min» og skriver inn artistnavnet.',
    'På artistsiden laster du opp låten under «Låtene dine» (MP3) og noen bilder under «Bildene dine». Stående bilder, som fra mobilen, fyller skjermen best på TikTok og Reels.',
    'Trykk «Lag video». Velg låten og hvilken del av den som skal brukes, og skriv kort hva videoen skal handle om. Trykk «Opprett draft», så lager PromoMaker et forslag med tekst til hver scene.',
    'Gå gjennom scenene: velg bilde, rett teksten, og velg stemme i panelet til høyre. Mangler du et bilde til en scene, trykker du «Lag AI-bilde», så lager programmet et stemningsbilde. Trykk «Lag stemmen» i hver scene, eller kryss av for «Uten tale». Vil du at bildene skal bevege seg, kryss av for «AI-bevegelse».',
    'Godkjenn scenene og trykk «Start produksjon». Videoen er klar etter noen minutter.',
  ].map((s, i) => steg(i + 1, s)).join('')}</table>`
  html += p('Tips: Trykker du «Rediger» på en ferdig video, kan du endre den uten å starte på nytt: bytte bilder, tekst, stemme eller musikk, eller lage den i et annet format (stående, kvadrat eller liggende). Det du ikke endrer, brukes om igjen uten ny kostnad.')
  return html
}

function veiledning(t: VelkomstTenant, pf: number, kreditter: number | null): string {
  const stemme = COSTS_NOK.voiceoverPreview * pf
  const bevegelse = COSTS_NOK.animate5s * pf
  const lipsync = COSTS_NOK.lipsyncTypical * pf
  // Samme regel som knappen på karaktersiden og trekket (lib/costs, Lars 21.10)
  const trening = treningListeprisNok(TRENING_RAAKOST_NOK.portrait) * pf
  // «Lag AI-bilde» i editoren og bilder med AI-versjonen av deg (generate-image)
  const aiBilde = COSTS_NOK.imageStandard * pf
  const personBilde = COSTS_NOK.imageCharacter * pf
  const eksempel = 8 * (stemme + bevegelse) // 8 scener med stemme og bevegelse
  const antall = kreditter ? Math.floor(kreditter / (eksempel * 10)) : 0

  let html = kommIGang(t)
  html += h('Dette koster kreditter')
  html += p('Implementeringen av det du har bidratt med selv, er gratis: egne bilder, egen musikk og din egen stemme. Du betaler bare for det programmet lager for deg:')
  html += `<table cellpadding="0" cellspacing="0" style="width:100%;margin:0 0 12px;font-size:14px;color:#5E564A;">
    <tr><td style="padding:5px 0;border-bottom:1px solid #EFE7D8;">AI-stemme som leser teksten</td><td style="padding:5px 0;border-bottom:1px solid #EFE7D8;text-align:right;white-space:nowrap;">${fmtCredits(stemme)} per scene</td></tr>
    <tr><td style="padding:5px 0;border-bottom:1px solid #EFE7D8;">Bevegelse – bildet blir levende (5 sek)</td><td style="padding:5px 0;border-bottom:1px solid #EFE7D8;text-align:right;white-space:nowrap;">${fmtCredits(bevegelse)} per scene</td></tr>
    <tr><td style="padding:5px 0;border-bottom:1px solid #EFE7D8;">Lip-sync – personen i bildet synger eller snakker</td><td style="padding:5px 0;border-bottom:1px solid #EFE7D8;text-align:right;white-space:nowrap;">ca. ${fmtCredits(lipsync)} per scene</td></tr>
    <tr><td style="padding:5px 0;border-bottom:1px solid #EFE7D8;">${t.vertical === 'music' ? 'AI-bilde – stemningsbilde uten personer' : 'AI-bilde'}</td><td style="padding:5px 0;border-bottom:1px solid #EFE7D8;text-align:right;white-space:nowrap;">${fmtCredits(aiBilde)} per bilde</td></tr>
    <tr><td style="padding:5px 0;border-bottom:1px solid #EFE7D8;">${t.vertical === 'music' ? 'Bilde med AI-versjonen av deg' : 'Bilde med egen AI-karakter'}</td><td style="padding:5px 0;border-bottom:1px solid #EFE7D8;text-align:right;white-space:nowrap;">${fmtCredits(personBilde)} per bilde</td></tr>
    <tr><td style="padding:5px 0;">${t.vertical === 'music' ? 'AI-versjon av deg selv (lages én gang)' : 'Egen AI-karakter (lages én gang)'}</td><td style="padding:5px 0;text-align:right;white-space:nowrap;">${fmtCredits(trening)}</td></tr>
  </table>`
  html += p(`En video på 8 scener med stemme og bevegelse i alle scenene koster rundt ${fmtCredits(eksempel)}.${antall >= 2 ? ` Med kredittene dine kan du lage omtrent ${antall} slike, og mange flere uten bevegelse.` : ''} Du ser alltid prisen før du trykker, og saldoen står øverst når du redigerer en video.`)
  return html
}

export function velkomstEpost(t: VelkomstTenant, lenke: string, navn: string | null, kreditter: number | null, pf = 1, notat: string | null = null, svarTil: string | null = null, hilsenFra: string | null = null) {
  const produkt = (produktnavn(t as any) || 'CenterForge').replace(/[<>"]/g, '')
  const aksent = (t.colors && t.colors['--ember']) || '#1C1A16'
  const fornavn = (navn || '').trim().split(/\s+/)[0]
  const origin = tenantOrigin(t)
  const logo = t.logo_url
    ? `<img src="${esc(t.logo_url)}" alt="${esc(produkt)}" height="38" style="height:38px;max-width:220px;object-fit:contain;display:block;margin:0 auto;" />`
    : `<span style="font-size:22px;font-weight:700;color:#1C1A16;">${esc(produkt)}</span>`
  // Fullt navn i overskrift og emne (Lars 21.10: «IndigoBoom PromoMaker»)
  const fullt = (fulltNavn(t as any) || produkt).replace(/[<>"]/g, '')
  const subject = `Velkommen til ${fullt}`
  const html = `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#F4EEE2;padding:40px 16px;">
  <div style="max-width:520px;margin:0 auto;">
    <div style="text-align:center;padding-bottom:26px;">${logo}</div>
    <div style="background:#FFFDF8;border:1px solid #E6DDCC;border-radius:16px;padding:36px 36px 30px;">
      <h1 style="margin:0 0 10px;font-size:22px;font-weight:700;color:#1C1A16;">${fornavn ? `Hei, ${esc(fornavn)}! ` : ''}Velkommen til ${esc(fullt)}</h1>
      <p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:#5E564A;">${kreditter ? `Du har fått en testkonto med <strong>${Math.round(kreditter).toLocaleString('nb-NO')} kreditter</strong>. Lenger ned ser du hva de rekker til.` : 'Kontoen din er klar.'}</p>
      <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#5E564A;">For å lage en video trenger du bare fotografier og musikk. Programmet gjør bildene levende.</p>
      <table cellpadding="0" cellspacing="0"><tr>
        <td style="border-radius:10px;background:${esc(aksent)};">
          <a href="${lenke}" style="display:inline-block;padding:13px 28px;font-size:15px;font-weight:600;color:${lesbarTekst(aksent)};text-decoration:none;border-radius:10px;">Velg passord og kom i gang</a>
        </td>
      </tr></table>
      <p style="margin:12px 0 0;font-size:14px;line-height:1.6;color:#5E564A;">Knappen åpner ${esc(produkt)} i nettleseren. Trykk på knappen der én gang til, så kommer du til siden der du velger passordet ditt. Skriv det to ganger (minst 8 tegn) og trykk «Lagre og kom i gang». Da er du inne.</p>
      ${t.vertical === 'music' ? `<p style="margin:22px 0 0;padding:14px 16px;border-radius:10px;background:#F4EEE2;font-size:14.5px;line-height:1.6;color:#1C1A16;">📋 <strong>Dette trenger du:</strong> én låt og 4–6 bilder av deg eller bandet. Låten kan være MP3, WAV, AIFF, M4A eller FLAC, og bildene kan du ta rett fra mobilen.</p>` : ''}
      ${notat ? `<div style="margin:22px 0 0;padding:14px 16px;border-radius:10px;background:#F4EEE2;border-left:4px solid ${esc(aksent)};font-size:14.5px;line-height:1.6;color:#1C1A16;">${esc(notat)}</div>` : ''}
      ${veiledning(t, pf, kreditter)}
      ${svarTil ? `<p style="margin:22px 0 0;padding:14px 16px;border-radius:10px;background:#F4EEE2;font-size:14.5px;line-height:1.6;color:#1C1A16;"><strong>Får du det ikke til?</strong> Svar på denne e-posten, så hjelper vi deg.</p>` : ''}
      ${hilsenFra ? (() => {
        // Første linje er navnet (uthevet), resten står under — f.eks. firma (Lars 21.10)
        const [navnLinje, ...resten] = hilsenFra.split('\n').map((l) => l.trim()).filter(Boolean)
        return `<p style="margin:24px 0 0;font-size:15px;line-height:1.6;color:#5E564A;">Hilsen<br><strong style="color:#1C1A16;">${esc(navnLinje || '')}</strong>${resten.map((l) => `<br>${esc(l)}`).join('')}</p>`
      })() : ''}
      <p style="margin:22px 0 0;font-size:12.5px;line-height:1.5;color:#978B79;">Lenken virker i ${GYLDIG_TEKST} og kan brukes én gang. Har den gått ut, går du til <a href="${origin}/login" style="color:#978B79;">${esc(origin.replace('https://', ''))}/login</a> og trykker «Glemt passord» med denne e-postadressen.</p>
      <p style="margin:12px 0 0;font-size:12.5px;line-height:1.5;color:#978B79;">Funker ikke knappen? Lim denne lenken inn i nettleseren:<br><a href="${lenke}" style="color:#978B79;word-break:break-all;">${lenke}</a></p>
    </div>
    <p style="text-align:center;margin:18px 0 0;font-size:11.5px;color:#978B79;">${esc(produkt)} leveres av Norditech</p>
  </div>
</div>`
  return { subject, html, fra: `${produkt} <no-reply@send.norditech.io>` }
}

// Påminnelse med utvidet frist (Lars 27.10: bare én av fire testere hadde
// startet). To varianter: har testeren ikke logget inn, får hun en ny
// passordlenke (lenke ≠ null) og stegene; er hun i gang, får hun en lenke til
// appen. Fristen og bonusen hentes fra UNDERSOKELSE, så teksten følger skjemaet.
export function paminnelseEpost(t: VelkomstTenant, lenke: string | null, navn: string | null, kreditter: number | null, svarTil: string | null = null, hilsenFra: string | null = null) {
  const produkt = (produktnavn(t as any) || 'CenterForge').replace(/[<>"]/g, '')
  const fullt = (fulltNavn(t as any) || produkt).replace(/[<>"]/g, '')
  const aksent = (t.colors && t.colors['--ember']) || '#1C1A16'
  const fornavn = (navn || '').trim().split(/\s+/)[0]
  const origin = tenantOrigin(t)
  const domene = origin.replace('https://', '')
  const frist = `${UNDERSOKELSE.bonusFristTekst} kl. 23:59`
  const logo = t.logo_url
    ? `<img src="${esc(t.logo_url)}" alt="${esc(produkt)}" height="38" style="height:38px;max-width:220px;object-fit:contain;display:block;margin:0 auto;" />`
    : `<span style="font-size:22px;font-weight:700;color:#1C1A16;">${esc(produkt)}</span>`
  const tekst = (s: string, mb = 14) => `<p style="margin:0 0 ${mb}px;font-size:15px;line-height:1.6;color:#5E564A;">${s}</p>`
  const knapp = (href: string, etikett: string) => `<table cellpadding="0" cellspacing="0"><tr>
        <td style="border-radius:10px;background:${esc(aksent)};">
          <a href="${href}" style="display:inline-block;padding:13px 28px;font-size:15px;font-weight:600;color:${lesbarTekst(aksent)};text-decoration:none;border-radius:10px;">${etikett}</a>
        </td>
      </tr></table>`
  const bonus = `<div style="margin:22px 0 0;padding:14px 16px;border-radius:10px;background:#F4EEE2;border-left:4px solid ${esc(aksent)};font-size:14.5px;line-height:1.6;color:#1C1A16;">🎁 Når du har under ${UNDERSOKELSE.grenseKreditter} kreditter igjen, kan du svare på 11 korte spørsmål om hvordan det gikk, og få ${UNDERSOKELSE.bonusKreditter.toLocaleString('nb-NO')} nye kreditter med en gang. Gjelder til og med ${esc(frist)}. Skjemaet finner du på <a href="${origin}/tilbakemelding" style="color:#1C1A16;">${esc(domene)}/tilbakemelding</a>.</div>`

  const subject = `Påminnelse: Fristen for å teste ${fullt} er utvidet til ${UNDERSOKELSE.bonusFristTekst}`
  let innhold = `<h1 style="margin:0 0 10px;font-size:22px;font-weight:700;color:#1C1A16;">${fornavn ? `Hei, ${esc(fornavn)}! ` : ''}Du rekker det fortsatt</h1>`
  if (lenke) {
    innhold += tekst(`Du har fått en testkonto i ${esc(fullt)}${kreditter ? ` med <strong>${Math.round(kreditter).toLocaleString('nb-NO')} kreditter</strong>` : ''}, men du har ikke logget inn ennå. Vi har utvidet fristen til <strong>${esc(frist)}</strong>.`)
    innhold += tekst('For å lage en video trenger du bare fotografier og musikk. Programmet gjør bildene levende.', 24)
    innhold += knapp(lenke, 'Velg passord og kom i gang')
    innhold += `<p style="margin:12px 0 0;font-size:14px;line-height:1.6;color:#5E564A;">Knappen åpner ${esc(produkt)} i nettleseren. Trykk på knappen der én gang til, så kommer du til siden der du velger passordet ditt. Skriv det to ganger (minst 8 tegn) og trykk «Lagre og kom i gang». Da er du inne.</p>`
    innhold += bonus
    innhold += kommIGang(t)
  } else {
    innhold += tekst(`Takk for at du tester ${esc(fullt)}! Vi har utvidet fristen til <strong>${esc(frist)}</strong>, så du har tid til å lage flere videoer.`, 24)
    innhold += knapp(`${origin}/dashboard`, `Gå til ${esc(produkt)}`)
    innhold += bonus
  }
  if (svarTil) innhold += `<p style="margin:22px 0 0;padding:14px 16px;border-radius:10px;background:#F4EEE2;font-size:14.5px;line-height:1.6;color:#1C1A16;"><strong>Får du det ikke til?</strong> Svar på denne e-posten, så hjelper vi deg.</p>`
  if (hilsenFra) {
    const [navnLinje, ...resten] = hilsenFra.split('\n').map((l) => l.trim()).filter(Boolean)
    innhold += `<p style="margin:24px 0 0;font-size:15px;line-height:1.6;color:#5E564A;">Hilsen<br><strong style="color:#1C1A16;">${esc(navnLinje || '')}</strong>${resten.map((l) => `<br>${esc(l)}`).join('')}</p>`
  }
  if (lenke) {
    innhold += `<p style="margin:22px 0 0;font-size:12.5px;line-height:1.5;color:#978B79;">Lenken virker til ${esc(frist)} og kan brukes én gang. Lenken i den første e-posten virker også. Har du allerede valgt passord, går du til <a href="${origin}/login" style="color:#978B79;">${esc(domene)}/login</a> og logger inn.</p>`
    innhold += `<p style="margin:12px 0 0;font-size:12.5px;line-height:1.5;color:#978B79;">Funker ikke knappen? Lim denne lenken inn i nettleseren:<br><a href="${lenke}" style="color:#978B79;word-break:break-all;">${lenke}</a></p>`
  }
  const html = `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#F4EEE2;padding:40px 16px;">
  <div style="max-width:520px;margin:0 auto;">
    <div style="text-align:center;padding-bottom:26px;">${logo}</div>
    <div style="background:#FFFDF8;border:1px solid #E6DDCC;border-radius:16px;padding:36px 36px 30px;">
      ${innhold}
    </div>
    <p style="text-align:center;margin:18px 0 0;font-size:11.5px;color:#978B79;">${esc(produkt)} leveres av Norditech</p>
  </div>
</div>`
  return { subject, html, fra: `${produkt} <no-reply@send.norditech.io>` }
}
