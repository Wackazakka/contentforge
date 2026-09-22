import { NextResponse } from 'next/server'
import { leveringsStatus } from '@/lib/levering'
import { createClient } from '@supabase/supabase-js'
import { randomBytes, randomUUID } from 'crypto'
import { getTenant } from '@/lib/tenantServer'
import { KJOENN, rensAttributter } from '@/lib/castingAttributes'

// «Bli en stemme i banken» — offentlig paamelding. Gate: tenantens
// accept_actor_applications.
//
// 🔑 INGEN FILER GAAR GJENNOM DENNE RUTA (22.09, migrasjon 099). Netlify
// kutter forespoersler over ~6 MB i porten — bevist samme dag med 12 bilder.
// Skjemaet er tekst; bilder og opptak leveres paa /levering/<token>, rett fra
// nettleseren til de private boettene. Ruta lager tokenet og sender lenken.

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

function admin() {
  return createClient(SUPABASE_URL || '', SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '')
}

export async function POST(request: Request) {
  try {
    const form = await request.formData()

    // Honeypot — bots fyller alt
    if (String(form.get('website') || '')) return NextResponse.json({ ok: true })

    const tenant = await getTenant()
    if (tenant.id === 'root' || tenant.accept_actor_applications !== true) {
      return NextResponse.json({ error: 'Denne banken tar ikke imot åpne søknader' }, { status: 403 })
    }

    const name = String(form.get('name') || '').trim()
    const email = String(form.get('email') || '').trim()
    if (!name || !email.includes('@')) {
      return NextResponse.json({ error: 'Navn og gyldig e-post må fylles ut' }, { status: 400 })
    }

    const offersVoice = String(form.get('offersVoice') || '1') === '1'
    const wantsFace = String(form.get('wantsFace') || '') === '1'
    if (!offersVoice && !wantsFace) {
      return NextResponse.json({ error: 'Velg minst ett aktivum: stemme eller ansikt' }, { status: 400 })
    }
    // Bildene til ansiktstrening (091). Kommer fra soekeren selv, ikke fra en
    // innboks: et produkt som selger sporbarhet kan ikke ta imot bilder av et
    // virkelig menneske gjennom en kanal hovedboken ikke kjenner.
    // 🔑 BILDENE TAS HELLER IKKE IMOT HER (22.09, migrasjon 099). Bevist paa
    // prod: 12 bilder (23 MB) mot denne ruta ga HTTP 400 med tom kropp etter
    // 1 MB — Netlify kuttet forespoerselen i porten, koden kjoerte aldri.
    // Ansiktsdelen av soeknaden har derfor aldri kunnet virke for en ekte
    // soeker. Og soeknadens photo_urls ble aldri lest av noe. Bildene gaar naa
    // til leveringssiden, rett fra nettleseren til den private boetta.

    // 🔑 SKJEMAET TAR IKKE LENGER IMOT LYD (Lars 22.09). To grunner:
    // 1) Vi screener ikke paa stemmen — enten har hen et brukbart opptak fra
    //    foer, eller saa tar vi det sammen i opptaksloeypa (095). En «valgfri
    //    smakebit» var det verste mellomstedet: verken krevd eller forklart.
    // 2) Denne ruta KAN ikke ta imot filer av ekte stoerrelse. Bevist paa prod
    //    samme dag: 12 bilder (23 MB) ga HTTP 400 med tom kropp etter 1 MB —
    //    Netlify kuttet forespoerselen foer koden kjoerte. Et opptak paa
    //    30 minutter er ti ganger verre. Filer maa gaa rett til lagring fra
    //    nettleseren; skjemaet faar bare vite HVILKEN vei hen trenger.
    // `samples` leses ikke lenger. En klient som sender dem, ignoreres.
    const harOpptakRaa = String(form.get('hasOwnRecording') || '').trim()
    // null = ikke spurt (tilbyr bare ansikt). Bare '1'/'0' godtas naar hen
    // tilbyr stemme — et tomt svar der er et hull i skjemaet, ikke et valg.
    if (offersVoice && harOpptakRaa !== '1' && harOpptakRaa !== '0') {
      return NextResponse.json({ error: 'Si om du har et opptak fra foer, eller vil ha hjelp til det' }, { status: 400 })
    }
    const hasOwnRecording: boolean | null = offersVoice ? harOpptakRaa === '1' : null

    const applicationId = randomUUID()
    // Alltid tom fra 22.09 — kolonnen beholdes for eldre rader og for den
    // dagen opplastingslenken skriver hit.
    const sampleUrls: string[] = []

    // Tom for nye rader — se over. Kolonnen beholdes for eldre rader.
    const photoUrls: string[] = []

    // Castingfeltene. Soekeren fyller dem selv -- se 084 for hvorfor det er
    // det eneste riktige stedet for spilleomraade (art. 9).
    const tall = (felt: string, min: number, maks: number): number | null | undefined => {
      const raa = String(form.get(felt) || '').trim()
      if (!raa) return null
      const n = Number(raa)
      if (!Number.isFinite(n) || n < min || n > maks) return undefined // = ugyldig
      return Math.round(n)
    }
    const aldFra = tall('playingAgeFrom', 0, 120)
    const aldTil = tall('playingAgeTo', 0, 120)
    const hoyde = tall('heightCm', 50, 260)
    if (aldFra === undefined || aldTil === undefined || hoyde === undefined) {
      return NextResponse.json({ error: 'Ugyldig spillealder eller hoyde' }, { status: 400 })
    }
    if (aldFra != null && aldTil != null && aldFra > aldTil) {
      return NextResponse.json({ error: 'Spillealder fra kan ikke vaere hoyere enn til' }, { status: 400 })
    }
    const kjoennRaa = String(form.get('gender') || '').trim()
    if (kjoennRaa && !(KJOENN as readonly string[]).includes(kjoennRaa)) {
      return NextResponse.json({ error: 'Ukjent kjonnsverdi' }, { status: 400 })
    }
    // Art. 9-porten: uten kryss skrives spilleomraade ikke, uansett hva
    // klienten sendte. rensAttributter fjerner fasetten selv.
    const harAppearanceSamtykke = String(form.get('appearanceConsent') || '') === '1'
    let attributter: Record<string, string[]> = {}
    try {
      attributter = rensAttributter(JSON.parse(String(form.get('attributes') || '{}')),
        { harSamtykke: harAppearanceSamtykke })
    } catch { /* ugyldig JSON = ingen attributter, ikke en feilmelding i ansiktet */ }

    // Lenken til leveringssiden lages FOER insert, saa en feilet e-post kan
    // sendes paa nytt fra adminen uten aa lage et nytt token (samme grep som
    // 091). 24 tilfeldige byte — ikke gjettbart, ikke oppslagbart.
    const deliveryToken = randomBytes(24).toString('base64url')

    const { error } = await admin().from('voice_actor_applications').insert({
      id: applicationId,
      tenant_id: tenant.id,
      name,
      email,
      phone: String(form.get('phone') || '').trim() || null,
      bio: String(form.get('bio') || '').slice(0, 2000) || null,
      sample_urls: sampleUrls,
      photo_urls: photoUrls,
      wants_face: wantsFace,
      offers_voice: offersVoice,
      has_own_recording: hasOwnRecording,
      delivery_token: deliveryToken,
      consent_text: String(form.get('consentText') || '').slice(0, 2000) || null,
      gender: kjoennRaa || null,
      playing_age_from: aldFra,
      playing_age_to: aldTil,
      height_cm: hoyde,
      attributes: attributter,
      // Tidsstempelet ER hjemmelen. Basen haandhever det ogsaa (084).
      appearance_consent_at: harAppearanceSamtykke ? new Date().toISOString() : null,
      appearance_consent_text: harAppearanceSamtykke
        ? String(form.get('appearanceConsentText') || '').slice(0, 2000) || null
        : null,
    })
    if (error) {
      console.error('[voice-apply] Insert-feil:', error.message)
      return NextResponse.json({ error: 'Kunne ikke lagre søknaden — prøv igjen' }, { status: 500 })
    }

    // E-posten er det som baerer lenken. Feiler den, staar raden og lenken
    // vises i adminen — en mislykket e-post skal ikke velte soeknaden.
    const status = leveringsStatus(
      { wantsFace, offersVoice, hasOwnRecording }, 0, 0)
    const harNoeAaLevere = status.trengerBilder || status.trengerOpptak
    const vert = tenant.custom_domain ? `https://${tenant.custom_domain}` : `https://${tenant.slug}.norditech.io`
    const lenke = `${vert}/levering/${deliveryToken}`
    const merke = tenant.app_name || 'TwinLedger'
    const fornavn = name.split(' ')[0]
    // Tre e-poster, ikke én med forbehold: hva hun skal gjoere avhenger av
    // hva hun svarte, og en e-post som dekker alle tilfellene sier ingenting.
    const punkter: string[] = []
    if (status.trengerBilder) punkter.push('<li><strong>10–25 bilder</strong> av deg — ulike vinkler, uttrykk og lys. Tjue like passbilder gir en modell som bare kan det ene bildet.</li>')
    if (status.trengerOpptak) punkter.push('<li><strong>Opptaket ditt</strong> — rundt 30 minutter ren tale, samme mikrofon hele veien. MP3 eller M4A; er fila stor, del den i flere.</li>')
    const veiledet = status.venterVeiledetOpptak
      ? '<p>Opptaket tar vi <strong>sammen</strong>: når søknaden er gjennomgått, får du en egen lenke med tekster å lese, nivåmåling og veiledning. Rundt 30 minutter, i flere omganger om du vil.</p>'
      : ''
    let epostSendt = false
    try {
      if (process.env.RESEND_API_KEY) {
        const { Resend } = await import('resend')
        await new Resend(process.env.RESEND_API_KEY).emails.send({
          from: `${merke} <hello@centerforge.app>`,
          to: email,
          subject: harNoeAaLevere ? `Neste steg: det vi trenger fra deg` : `Vi har fått søknaden din`,
          html: `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#1C1A16">
            <h2 style="margin:0 0 12px">Hei ${fornavn},</h2>
            <p>Takk for søknaden til ${merke}.</p>
            ${harNoeAaLevere ? `<p>Her er det vi trenger fra deg:</p><ul>${punkter.join('')}</ul>
            <p style="margin:24px 0"><a href="${lenke}" style="background:#C5451B;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600">Lever her</a></p>
            <p style="color:#6B6358;font-size:14px">Lenken er din. Du kan komme tilbake til den så mange ganger du vil — det du har lastet opp, ligger der.</p>` : ''}
            ${veiledet}
            <p style="color:#6B6358;font-size:14px">Vi går gjennom søknaden og tar kontakt på denne adressen.</p>
          </div>`,
        })
        epostSendt = true
      }
    } catch (e) {
      console.error('[voice-apply] E-post feilet:', e instanceof Error ? e.message : e)
    }

    return NextResponse.json({ ok: true, epostSendt, harNoeAaLevere })
  } catch (err: any) {
    console.error('[voice-apply] Feil:', err.message)
    return NextResponse.json({ error: 'Noe gikk galt — prøv igjen' }, { status: 500 })
  }
}
