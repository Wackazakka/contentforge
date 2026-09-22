import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getTenant } from '@/lib/tenantServer'
import { KJOENN, rensAttributter } from '@/lib/castingAttributes'

// Paamelding for en som ALLEREDE HAR KONTO (101, hullet Lars traff 22.09).
//
// /api/voice-bank/enroll lager kontoen og lar /me lage raden ved foerste
// innlogging. En kunde som alt er inne — eller Lars selv, som registrerte seg
// som kunde samme morgen — fikk 409 «logg inn» og fant ingenting inne. Denne
// ruta er «meld deg paa» for den innloggede: e-posten er alt verifisert (JWT),
// saa raden kan lages direkte, fra skjemaet i stedet for fra metadata.
//
// 🔑 SAMME RAD, SAMME REGLER som /me lager: is_active=false, is_public=false,
// identity_basis='self_declared'. Denne koden skriver aldri noe annet.
// Idempotent: finnes det alt en rad for adressen i denne banken, svarer vi
// 409 med peker til /min-stemme — ikke en rad til.

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  )
}

export async function POST(request: Request) {
  try {
    const tenant = await getTenant()
    if (tenant.id === 'root' || tenant.accept_actor_applications !== true) {
      return NextResponse.json({ error: 'Denne banken tar ikke imot påmeldinger nå' }, { status: 403 })
    }
    const auth = request.headers.get('authorization')
    if (!auth?.startsWith('Bearer ')) return NextResponse.json({ error: 'Ikke innlogget' }, { status: 401 })
    const { data: u } = await admin().auth.getUser(auth.slice(7))
    const email = u?.user?.email?.toLowerCase()
    if (!email) return NextResponse.json({ error: 'Ikke innlogget' }, { status: 401 })

    const b = await request.json()
    const name = String(b.name || (u.user!.user_metadata as any)?.full_name || '').trim()
    if (!name) return NextResponse.json({ error: 'Navn må fylles ut' }, { status: 400 })

    const offersVoice = b.offersVoice !== false
    const wantsFace = b.wantsFace === true
    if (!offersVoice && !wantsFace) return NextResponse.json({ error: 'Velg minst ett: stemme eller ansikt' }, { status: 400 })
    const hasOwnRecording: boolean | null = offersVoice
      ? (b.hasOwnRecording === true ? true : b.hasOwnRecording === false ? false : null)
      : null
    if (offersVoice && hasOwnRecording === null) {
      return NextResponse.json({ error: 'Si om du har et opptak fra før, eller vil ha hjelp til det' }, { status: 400 })
    }
    const consentText = String(b.consentText || '').slice(0, 2000)
    if (!consentText) return NextResponse.json({ error: 'Du må samtykke for å melde deg på' }, { status: 400 })

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

    const { data: finnes } = await admin()
      .from('voice_actors').select('id')
      .eq('owner_tenant_id', tenant.id).ilike('actor_email', email).limit(1)
    if (finnes && finnes.length > 0) {
      return NextResponse.json({ error: 'Du er allerede påmeldt her — siden din ligger på /min-stemme', code: 'ALREADY_ENROLLED' }, { status: 409 })
    }

    const naa = new Date().toISOString()
    const { data: ny, error } = await admin().from('voice_actors').insert({
      owner_tenant_id: tenant.id,
      name: name.slice(0, 120),
      actor_email: email,
      elevenlabs_voice_id: null,
      honorarium_nok: 0, actor_rate_nok: 0, customer_price_nok: 0, discount_tiers: [],
      is_active: false, is_public: false, is_exclusive: true,
      notes: [`Paameldt ${naa.slice(0, 10)} (innlogget)`, b.phone ? `Tlf: ${String(b.phone).trim().slice(0, 40)}` : ''].filter(Boolean).join(' · '),
      bio: String(b.bio || '').slice(0, 2000) || null,
      offers_voice: offersVoice, wants_face: wantsFace, has_own_recording: hasOwnRecording,
      gender: kjoenn || null, playing_age_from: aldFra, playing_age_to: aldTil, height_cm: hoyde,
      attributes: attributter,
      appearance_consent_at: harAppearanceSamtykke ? naa : null,
      consent_text: consentText, consent_at: naa, enrolled_at: naa,
      identity_basis: 'self_declared',
    }).select('id').single()
    if (error) return NextResponse.json({ error: `Kunne ikke melde deg på (${error.message})` }, { status: 500 })

    return NextResponse.json({ ok: true, actorId: ny.id })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
