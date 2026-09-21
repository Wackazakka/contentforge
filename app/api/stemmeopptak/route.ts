import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { fremdrift, nesteTekst, REGISTRE, type Register } from '@/lib/stemmeopptak'

// Opptaksøkta for en proffklone (migrasjon 095).
//
// 🔑 TOKENET ER AUTENTISERINGEN. Hun har ingen konto hos oss og skal ikke
// trenge en for å lese inn stemmen sin — samme mønster som ansikts-
// godkjenningen (091). Lenken kommer i e-post og er alt hun trenger.
//
// 🔑 FREMDRIFTEN REGNES UT, ALDRI LAGRES. Den er en sum over klippene, og et
// lagret tall ville kommet i utakt første gang et klipp forkastes. Se
// `fremdrift` i lib/stemmeopptak — ren funksjon, testet.

export const BOTTE = 'voice-recordings'

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  )
}

async function hentOekt(token: string) {
  const { data } = await admin()
    .from('voice_recording_sessions')
    .select('id, actor_id, status, device_id, subject_email')
    .eq('token', token)
    .maybeSingle()
  return data as { id: string; actor_id: string | null; status: string; device_id: string | null; subject_email: string | null } | null
}

async function dekning(sessionId: string) {
  const { data } = await admin()
    .from('voice_recording_clips')
    .select('register, seconds, text_index')
    .eq('session_id', sessionId)
    .eq('discarded', false)
  const rader = (data || []) as Array<{ register: string; seconds: number; text_index: number | null }>
  const per = new Map<string, number>()
  for (const r of rader) per.set(r.register, (per.get(r.register) || 0) + Number(r.seconds))
  return {
    dekning: [...per.entries()].map(([register, sek]) => ({ register: register as Register, sek })),
    leste: rader,
  }
}

/** GET ?token= — hva hun skal lese nå, og hvor langt hun er kommet. */
export async function GET(request: Request) {
  try {
    const token = new URL(request.url).searchParams.get('token') || ''
    if (!token) return NextResponse.json({ error: 'Mangler token' }, { status: 400 })
    const oekt = await hentOekt(token)
    if (!oekt) return NextResponse.json({ error: 'Ukjent eller utløpt lenke' }, { status: 404 })

    const { dekning: d, leste } = await dekning(oekt.id)
    const f = fremdrift(d)
    // Hun skal ikke måtte styre fordelingen selv — vi peker på det som mangler.
    const register = (f.nesteRegister ?? 'noytral') as Register
    const alleredeLest = leste.filter((r) => r.register === register).map((r) => r.text_index ?? -1)
    const tekst = nesteTekst(register, alleredeLest)

    return NextResponse.json({
      status: oekt.status,
      deviceId: oekt.device_id,
      fremdrift: f,
      registre: REGISTRE,
      oppgave: tekst ? { register, instruks: REGISTRE[register].instruks, ...tekst } : null,
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

/**
 * POST — lagre ett klipp.
 *
 * Lyden lastes opp separat med en signert lenke (se ?opplasting=1); her
 * registreres bare måleresultatene og stien. Netlify-funksjoner har ~6 MB
 * kroppsgrense, og et minutts lyd sprenger den fort.
 */
export async function POST(request: Request) {
  try {
    const b = await request.json()
    const token = String(b.token || '')
    if (!token) return NextResponse.json({ error: 'Mangler token' }, { status: 400 })
    const oekt = await hentOekt(token)
    if (!oekt) return NextResponse.json({ error: 'Ukjent eller utløpt lenke' }, { status: 404 })
    if (oekt.status !== 'open') return NextResponse.json({ error: 'Økta er avsluttet' }, { status: 409 })

    // Be om en opplastingslenke.
    if (b.handling === 'opplastingslenke') {
      const sti = `${oekt.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.webm`
      const { data, error } = await admin().storage.from(BOTTE).createSignedUploadUrl(sti)
      if (error) {
        return NextResponse.json({ error: `Kunne ikke lage opplastingslenke (${error.message}). Finnes bøtta «${BOTTE}»?` }, { status: 500 })
      }
      return NextResponse.json({ uploadUrl: data.signedUrl, path: sti })
    }

    // Registrer klippet.
    const register = String(b.register || '')
    if (!(register in REGISTRE)) return NextResponse.json({ error: 'Ukjent register' }, { status: 400 })
    const sek = Number(b.sekunder)
    if (!(sek > 0)) return NextResponse.json({ error: 'Klippet mangler lengde' }, { status: 400 })
    if (!b.path) return NextResponse.json({ error: 'Mangler sti til lyden' }, { status: 400 })

    // ⚠️ MIKROFONEN LÅSES VED FØRSTE KLIPP. Varierte mikrofoner ødelegger
    // klonen, og feilen kan ikke rettes i etterkant. Vi avviser framfor å
    // lagre noe som gjør hele settet ubrukelig.
    if (b.deviceId) {
      if (!oekt.device_id) {
        await admin().from('voice_recording_sessions').update({ device_id: String(b.deviceId) }).eq('id', oekt.id)
      } else if (oekt.device_id !== String(b.deviceId)) {
        return NextResponse.json({
          error: 'Dette er en annen mikrofon enn resten av opptakene. Bytt tilbake før du fortsetter.',
          code: 'MIKROFON_BYTTET',
        }, { status: 409 })
      }
    }

    const { error } = await admin().from('voice_recording_clips').insert({
      session_id: oekt.id,
      register,
      text_index: b.tekstIndeks ?? null,
      storage_path: String(b.path),
      seconds: Math.round(sek * 100) / 100,
      rms_db: b.rmsDb ?? null,
      peak_db: b.peakDb ?? null,
      noise_db: b.stoeygulvDb ?? null,
    })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const { dekning: d } = await dekning(oekt.id)
    const f = fremdrift(d)
    if (f.ferdig) {
      await admin().from('voice_recording_sessions')
        .update({ status: 'done', completed_at: new Date().toISOString() }).eq('id', oekt.id)
    }
    return NextResponse.json({ ok: true, fremdrift: f })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
