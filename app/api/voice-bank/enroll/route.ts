import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getTenant } from '@/lib/tenantServer'
import { KJOENN, rensAttributter } from '@/lib/castingAttributes'

// Paamelding som stemme/ansikt (migrasjon 101) — erstatter soeknaden.
//
// 🔑 KONTOEN LAGES HER, RADEN LAGES VED FOERSTE INNLOGGING. generateLink av
// typen 'signup' oppretter brukeren med metadata og gir oss bekreftelses-
// lenken uten aa sende noe. Vi sender den selv (Resend), i vaar drakt. Naar
// hun klikker, er e-posten verifisert, og /api/voice-bank/me lager
// skuespillerraden fra metadataene ved foerste kall. Ingen rad finnes for en
// adresse ingen har bevist at de eier.
//
// 🔑 INGEN FILER, INGEN GODKJENNING. Bilder og opptak leveres innlogget paa
// /min-stemme etterpaa. Det finnes ingen koe aa vente paa — bare «Publiser»,
// som er et menneskes avgjoerelse og alltid har vaert det.
//
// Porten er tenantens accept_actor_applications (naa: «tar imot paameldinger»).

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  )
}

export async function POST(request: Request) {
  try {
    const b = await request.json()
    if (String(b.website || '')) return NextResponse.json({ ok: true }) // honeypot

    const tenant = await getTenant()
    if (tenant.id === 'root' || tenant.accept_actor_applications !== true) {
      return NextResponse.json({ error: 'Denne banken tar ikke imot påmeldinger nå' }, { status: 403 })
    }

    const name = String(b.name || '').trim()
    const email = String(b.email || '').trim().toLowerCase()
    const password = String(b.password || '')
    if (!name || !email.includes('@')) return NextResponse.json({ error: 'Navn og gyldig e-post må fylles ut' }, { status: 400 })
    if (password.length < 8) return NextResponse.json({ error: 'Passordet må være minst 8 tegn' }, { status: 400 })

    const offersVoice = b.offersVoice !== false
    const wantsFace = b.wantsFace === true
    if (!offersVoice && !wantsFace) return NextResponse.json({ error: 'Velg minst ett: stemme eller ansikt' }, { status: 400 })
    // null = ikke spurt (tilbyr bare ansikt)
    const hasOwnRecording: boolean | null = offersVoice
      ? (b.hasOwnRecording === true ? true : b.hasOwnRecording === false ? false : null)
      : null
    if (offersVoice && hasOwnRecording === null) {
      return NextResponse.json({ error: 'Si om du har et opptak fra før, eller vil ha hjelp til det' }, { status: 400 })
    }
    const consentText = String(b.consentText || '').slice(0, 2000)
    if (!consentText) return NextResponse.json({ error: 'Du må samtykke for å melde deg på' }, { status: 400 })

    // Castingfeltene — samme regler som soeknaden hadde (084).
    const tall = (v: unknown, min: number, maks: number): number | null | undefined => {
      const raa = String(v ?? '').trim()
      if (!raa) return null
      const n = Number(raa)
      if (!Number.isFinite(n) || n < min || n > maks) return undefined
      return Math.round(n)
    }
    const aldFra = tall(b.playingAgeFrom, 0, 120)
    const aldTil = tall(b.playingAgeTo, 0, 120)
    const hoyde = tall(b.heightCm, 50, 260)
    if (aldFra === undefined || aldTil === undefined || hoyde === undefined) {
      return NextResponse.json({ error: 'Ugyldig spillealder eller høyde' }, { status: 400 })
    }
    if (aldFra != null && aldTil != null && aldFra > aldTil) {
      return NextResponse.json({ error: 'Spillealder fra kan ikke være høyere enn til' }, { status: 400 })
    }
    const kjoenn = String(b.gender || '').trim()
    if (kjoenn && !(KJOENN as readonly string[]).includes(kjoenn)) {
      return NextResponse.json({ error: 'Ukjent kjønnsverdi' }, { status: 400 })
    }
    const harAppearanceSamtykke = b.appearanceConsent === true
    const attributter = rensAttributter(b.attributes, { harSamtykke: harAppearanceSamtykke })

    const vert = tenant.custom_domain ? `https://${tenant.custom_domain}` : `https://${tenant.slug}.norditech.io`
    const merke = tenant.app_name || 'TwinLedger'

    // Alt raden trenger, baaret i metadata til foerste innlogging. Samtykke-
    // teksten fryses HER, med tidsstempelet fra da hun faktisk krysset av —
    // ikke fra da raden ble laget.
    const enroll = {
      tenant_id: tenant.id,
      name, offers_voice: offersVoice, wants_face: wantsFace, has_own_recording: hasOwnRecording,
      phone: String(b.phone || '').trim().slice(0, 40) || null,
      bio: String(b.bio || '').slice(0, 2000) || null,
      gender: kjoenn || null, playing_age_from: aldFra, playing_age_to: aldTil, height_cm: hoyde,
      attributes: attributter,
      appearance_consent_at: harAppearanceSamtykke ? new Date().toISOString() : null,
      consent_text: consentText, consent_at: new Date().toISOString(),
      enrolled_at: new Date().toISOString(),
    }

    const { data, error } = await admin().auth.admin.generateLink({
      type: 'signup',
      email,
      password,
      options: {
        data: { full_name: name, tenant_slug: tenant.slug, enroll },
        redirectTo: `${vert}/login?rolle=stemme`,
      },
    })
    if (error || !data?.properties?.action_link) {
      // Finnes adressen fra foer, sier vi det rett ut — men uten aa bekrefte
      // noe om KONTOEN: samme setning uansett om det er en kunde eller en
      // stemme. Hen faar logge inn og se.
      const finnes = /already|exists|registered/i.test(error?.message || '')
      return NextResponse.json({
        error: finnes
          ? 'Denne adressen har allerede en konto. Logg inn, så finner du påmeldingen der.'
          : `Kunne ikke opprette kontoen (${error?.message || 'ukjent feil'})`,
        code: finnes ? 'ALREADY_REGISTERED' : 'SIGNUP_FAILED',
      }, { status: finnes ? 409 : 500 })
    }

    // E-posten er det som baerer lenken. Feiler den, finnes kontoen likevel —
    // «glemt passord» paa /login sender en ny bekreftelse via Supabase.
    let epostSendt = false
    try {
      if (process.env.RESEND_API_KEY) {
        const { Resend } = await import('resend')
        const fornavn = name.split(' ')[0]
        const hva = [offersVoice ? 'stemmen' : '', wantsFace ? 'ansiktet' : ''].filter(Boolean).join(' og ')
        // Resend kaster ikke — avvist sending kommer som { error }. Kast selv,
        // saa epostSendt forblir false og feilen havner i loggen (22.09: alle
        // sendinger fra hello@centerforge.app var avvist, domenet er ikke
        // verifisert i Resend-kontoen — og ingen saa det).
        const { error: sendFeil } = await new Resend(process.env.RESEND_API_KEY).emails.send({
          from: `${merke} <no-reply@send.norditech.io>`,
          to: email,
          subject: `Bekreft påmeldingen din`,
          html: `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#1C1A16">
            <h2 style="margin:0 0 12px">Hei ${fornavn},</h2>
            <p>Du har meldt deg på ${merke} med ${hva}. Ett klikk, så er kontoen din åpen:</p>
            <p style="margin:24px 0"><a href="${data.properties.action_link}" style="background:#C5451B;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600">Bekreft og logg inn</a></p>
            <p>Inne finner du siden din. Der ${wantsFace ? 'laster du opp bildene til ansiktsmodellen' : ''}${wantsFace && offersVoice ? ', og ' : ''}${offersVoice ? (hasOwnRecording ? 'laster du opp opptaket ditt' : 'starter du opptaket — rundt 30 minutter med tekster og veiledning, i flere omganger om du vil') : ''}.</p>
            <p style="color:#6B6358;font-size:14px">Ingenting publiseres før du har levert og vi har sett gjennom det sammen. Du bestemmer selv hvem som får bruke ${hva}.</p>
          </div>`,
        })
        if (sendFeil) throw new Error(`${sendFeil.name}: ${sendFeil.message}`)
        epostSendt = true
      }
    } catch (e) {
      console.error('[enroll] E-post feilet:', e instanceof Error ? e.message : e)
    }

    return NextResponse.json({ ok: true, epostSendt })
  } catch (err: any) {
    console.error('[enroll] Feil:', err.message)
    return NextResponse.json({ error: 'Noe gikk galt — prøv igjen' }, { status: 500 })
  }
}
