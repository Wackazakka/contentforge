import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import { getTenant, getTenantOrigin } from '@/lib/tenantServer'
import { produktnavn } from '@/lib/tenantNames'

// Velkomst-mailen etter registrering. Kalles fire-and-forget fra
// app/register/page.tsx paa tenantens eget domene, saa Host-headeren gir
// riktig tenant.
//
// Var hardkodet «Welcome to CenterForge» paa engelsk, med CenterForge-logo,
// lenker til contentforge-610.netlify.app (der brukeren ikke har sesjon --
// sesjoner er per domene) og avsender paa et domene som aldri var
// verifisert. En IndigoBoom-artist fikk altsaa en engelsk mail fra et
// selskap hun aldri hadde hoert om, med en lenke som ikke virket -- eller
// rettere: hun fikk ingenting, for noekkelen var ugyldig (18/9).

function getResend() {
  return new Resend(process.env.RESEND_API_KEY)
}

type Steg = [string, string]

function stegFor(vertical: string | null | undefined, publisering: boolean, en: boolean, produkt: string): Steg[] {
  if (vertical === 'music') {
    return en
      ? [
          ['Add your artist', 'Name, genre and who you are — two sentences will do.'],
          ['Get the promo made', 'Video with your own music, your photos and a voice. You approve everything before it costs anything.'],
          publisering
            ? ['Connect & publish', `Link Facebook and Instagram and publish straight from ${produkt}.`]
            : ['Download & share', 'Download the finished video and post it where your fans are: TikTok, Reels or YouTube.'],
        ]
      : [
          ['Legg inn artisten', 'Navn, sjanger og hvem dere er — to setninger holder.'],
          ['Få promoen laget', 'Video med din egen musikk, dine bilder og en stemme. Du godkjenner alt før det koster noe.'],
          publisering
            ? ['Koble til og publiser', `Koble til Facebook og Instagram og publiser rett fra ${produkt}.`]
            : ['Last ned og del', 'Last ned den ferdige filmen og legg den ut der fansen er: TikTok, Reels eller YouTube.'],
        ]
  }
  if (vertical === 'celebration') {
    return en
      ? [
          ['Pick the occasion', 'Birthday, wedding, party — tell us what you are celebrating.'],
          ['Make the film', 'Choose a song, add photos, watch it come together.'],
          ['Share it', 'Download the film and send it on Messenger, WhatsApp or email.'],
        ]
      : [
          ['Velg anledningen', 'Bursdag, bryllup, fest — fortell hva som skal feires.'],
          ['Lag filmen', 'Velg sang, legg til bilder, og se den bli til.'],
          ['Del den', 'Last ned filmen og send den på Messenger, WhatsApp eller e-post.'],
        ]
  }
  return en
    ? [
        ['Add a product', 'Describe what you sell — name, category and a short description.'],
        ['Generate content', 'Create videos and articles with one click. You approve everything first.'],
        publisering
          ? ['Connect & publish', `Link your social accounts and publish directly from ${produkt}.`]
          : ['Download & share', 'Download the finished video and post it wherever your audience is.'],
      ]
    : [
        ['Legg til et produkt', 'Beskriv det du selger — navn, kategori og en kort beskrivelse.'],
        ['Lag innhold', 'Video og artikler med ett klikk. Du godkjenner alt først.'],
        publisering
          ? ['Koble til og publiser', `Koble til sosiale medier og publiser rett fra ${produkt}.`]
          : ['Last ned og del', 'Last ned den ferdige videoen og legg den ut der kundene dine er.'],
      ]
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

export async function POST(request: NextRequest) {
  try {
    const { email, name } = await request.json()
    if (!email) return NextResponse.json({ error: 'Missing email' }, { status: 400 })

    const tenant = await getTenant()
    const origin = await getTenantOrigin()
    const en = tenant.default_locale === 'en'
    const produkt = produktnavn(tenant) || 'CenterForge'
    const publisering = tenant.publishing_enabled !== false
    // E-posten er alltid lys (mange klienter ignorerer moerke temaer), saa
    // bare aksentfargen hentes fra tenanten. Tekstfargene er faste og moerke.
    const aksent = (tenant.colors && tenant.colors['--ember']) || '#C5451B'
    const firstName = (name || '').split(' ')[0] || (en ? 'there' : 'du')
    const steg = stegFor(tenant.vertical, publisering, en, produkt)

    const logo = tenant.logo_url
      ? `<img src="${esc(tenant.logo_url)}" alt="${esc(produkt)}" height="40" style="height:40px;max-width:220px;object-fit:contain;display:block;" />`
      : `<span style="font-size:22px;font-weight:700;color:#1C1A16;">${esc(produkt)}</span>`

    const t = en
      ? {
          subject: `Welcome to ${produkt}!`,
          hei: `Welcome, ${esc(firstName)}!`,
          intro: `Your ${produkt} account is ready. Here is how to get going:`,
          cta: 'Go to dashboard →',
          foot: `${produkt} is delivered by Norditech`,
          privacy: 'Privacy policy',
        }
      : {
          subject: `Velkommen til ${produkt}!`,
          hei: `Velkommen, ${esc(firstName)}!`,
          intro: `Kontoen din i ${produkt} er klar. Slik kommer du i gang:`,
          cta: 'Gå til dashbordet →',
          foot: `${produkt} leveres av Norditech`,
          privacy: 'Personvern',
        }

    const html = `<!DOCTYPE html>
<html lang="${en ? 'en' : 'no'}">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${esc(t.subject)}</title>
</head>
<body style="margin:0;padding:0;background-color:#F4EEE2;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#F4EEE2;padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">
          <tr>
            <td align="center" style="padding-bottom:28px;">${logo}</td>
          </tr>
          <tr>
            <td style="background-color:#FFFDF8;border-radius:16px;border:1px solid #E6DDCC;padding:40px 40px 36px;">
              <h1 style="margin:0 0 8px;font-size:26px;font-weight:700;color:#1C1A16;line-height:1.2;">${t.hei}</h1>
              <p style="margin:0 0 28px;font-size:15px;color:#5E564A;line-height:1.6;">${esc(t.intro)}</p>
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:32px;">
                ${steg.map(([tittel, tekst], i) => `
                <tr>
                  <td style="padding-bottom:16px;">
                    <table cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="vertical-align:top;padding-right:14px;padding-top:1px;">
                          <div style="width:24px;height:24px;border-radius:50%;background-color:${aksent};text-align:center;line-height:24px;font-size:12px;font-weight:700;color:#FFFDF8;">${i + 1}</div>
                        </td>
                        <td>
                          <p style="margin:0 0 2px;font-size:14px;font-weight:600;color:#1C1A16;">${esc(tittel)}</p>
                          <p style="margin:0;font-size:13px;color:#5E564A;">${esc(tekst)}</p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>`).join('')}
              </table>
              <table cellpadding="0" cellspacing="0">
                <tr>
                  <td style="border-radius:10px;background-color:#1C1A16;">
                    <a href="${origin}/dashboard" style="display:inline-block;padding:13px 28px;font-size:15px;font-weight:600;color:#FFFDF8;text-decoration:none;border-radius:10px;">${esc(t.cta)}</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding-top:24px;">
              <p style="margin:0;font-size:12px;color:#978B79;">${esc(t.foot)} · <a href="${origin}/privacy" style="color:#978B79;">${esc(t.privacy)}</a></p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`

    const { error } = await getResend().emails.send({
      // send.norditech.io er det verifiserte Resend-domenet (18/9); visningsnavnet
      // er tenantens produkt, saa mailen ser ut til aa komme fra PromoMaker.
      from: `${produkt.replace(/[<>"]/g, '')} <no-reply@send.norditech.io>`,
      to: email,
      subject: t.subject,
      html,
    })

    if (error) {
      console.error('[email/welcome] Resend error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ success: true })
  } catch (err: any) {
    console.error('[email/welcome] error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
