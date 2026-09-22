import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import {
  BILDE_TYPER, LYD_TYPER, MAKS_BILDER, MAKS_FIL_MB,
  eierSti, leveringsSti, leveringsStatus,
} from '@/lib/levering'

// Leveringssiden for en soeker: bilder til ansiktsmodellen og et opptak hun
// alt hadde. Migrasjon 099.
//
// 🔑 TOKENET ER AUTENTISERINGEN. Hun har ingen konto — samme moenster som
// ansiktsgodkjenningen (091) og opptaksloeypa (095). Lenken kommer i e-post.
//
// 🔑 FILENE GAAR IKKE GJENNOM DENNE RUTA. Netlify kutter forespoersler over
// ~6 MB i porten (bevist 22.09 med 12 bilder). Ruta deler ut SIGNERTE
// opplastingslenker til de private boettene, nettleseren laster rett dit, og
// ruta faar bare stien tilbake. Ingen fil passerer en funksjon.
//
// 🔑 EIERSKAPET LIGGER I STIEN. Alt hun laster opp havner under
// applications/<hennes id>/, og ruta nekter aa registrere eller slette en sti
// utenfor den mappa — uansett hva klienten paastaar. Da kan et token aldri
// naa en annens filer.

const BILDE_BOETTE = 'training-sets'
const LYD_BOETTE = 'voice-recordings'

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  )
}

type Soeknad = {
  id: string; name: string; status: string
  wants_face: boolean; offers_voice: boolean | null; has_own_recording: boolean | null
  photo_paths: string[]; recording_paths: string[]; delivered_at: string | null
}

async function hentSoeknad(token: string): Promise<Soeknad | null> {
  if (!token || token.length < 16) return null
  const { data } = await admin()
    .from('voice_actor_applications')
    .select('id, name, status, wants_face, offers_voice, has_own_recording, photo_paths, recording_paths, delivered_at')
    .eq('delivery_token', token)
    .maybeSingle()
  return (data as Soeknad | null) ?? null
}

function krav(s: Soeknad) {
  return { wantsFace: !!s.wants_face, offersVoice: s.offers_voice !== false, hasOwnRecording: s.has_own_recording }
}

function svar(s: Soeknad) {
  const bilder = Array.isArray(s.photo_paths) ? s.photo_paths : []
  const opptak = Array.isArray(s.recording_paths) ? s.recording_paths : []
  return {
    fornavn: (s.name || '').split(' ')[0],
    avvist: s.status === 'rejected',
    bilder: bilder.map((p) => ({ path: p, navn: p.split('/').pop() })),
    opptak: opptak.map((p) => ({ path: p, navn: p.split('/').pop() })),
    status: leveringsStatus(krav(s), bilder.length, opptak.length),
    grenser: { minBilder: 10, maksBilder: MAKS_BILDER, maksFilMb: MAKS_FIL_MB },
  }
}

/** GET ?token= — hva som trengs, og hva som alt er levert. */
export async function GET(request: Request) {
  try {
    const token = new URL(request.url).searchParams.get('token') || ''
    const s = await hentSoeknad(token)
    if (!s) return NextResponse.json({ error: 'Lenken er ugyldig eller utgått' }, { status: 404 })
    return NextResponse.json(svar(s))
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const b = await request.json()
    const s = await hentSoeknad(String(b.token || ''))
    if (!s) return NextResponse.json({ error: 'Lenken er ugyldig eller utgått' }, { status: 404 })
    // En avvist soeknad tar ikke imot mer. Godkjent gjoer det — flere bilder
    // etter godkjenning er en forbedring, ikke en feil.
    if (s.status === 'rejected') return NextResponse.json({ error: 'Denne søknaden er avsluttet' }, { status: 410 })

    const kind = b.kind === 'photo' ? 'photo' : b.kind === 'recording' ? 'recording' : null
    if (!kind) return NextResponse.json({ error: 'Ukjent filtype' }, { status: 400 })
    const k = krav(s)
    if (kind === 'photo' && !k.wantsFace) return NextResponse.json({ error: 'Søknaden gjelder ikke ansikt' }, { status: 400 })
    if (kind === 'recording' && !(k.offersVoice && k.hasOwnRecording === true)) {
      return NextResponse.json({ error: 'Opptaket tas sammen med oss — det lastes ikke opp her' }, { status: 400 })
    }
    const boette = kind === 'photo' ? BILDE_BOETTE : LYD_BOETTE
    const felt = kind === 'photo' ? 'photo_paths' : 'recording_paths'
    const naa: string[] = Array.isArray(s[felt]) ? s[felt] : []

    // 1) Be om en opplastingslenke.
    if (b.handling === 'opplastingslenke') {
      const type = String(b.contentType || '')
      const ext = (kind === 'photo' ? BILDE_TYPER : LYD_TYPER)[type]
      if (!ext) {
        return NextResponse.json({
          error: kind === 'photo' ? 'Bilder må være JPG, PNG eller WebP' : 'Lydfila må være MP3, M4A, WAV, FLAC, AIFF, OGG eller WebM',
        }, { status: 415 })
      }
      const size = Number(b.size || 0)
      if (size > MAKS_FIL_MB * 1024 * 1024) {
        return NextResponse.json({ error: `Fila er for stor (maks ${MAKS_FIL_MB} MB). Del opptaket i flere filer, eller bruk MP3/M4A.` }, { status: 413 })
      }
      if (kind === 'photo' && naa.length >= MAKS_BILDER) {
        return NextResponse.json({ error: `Maks ${MAKS_BILDER} bilder` }, { status: 400 })
      }
      const sti = leveringsSti(s.id, kind, ext)
      const { data, error } = await admin().storage.from(boette).createSignedUploadUrl(sti)
      if (error) {
        return NextResponse.json({ error: `Kunne ikke lage opplastingslenke (${error.message}). Finnes bøtta «${boette}»?` }, { status: 500 })
      }
      return NextResponse.json({ uploadUrl: data.signedUrl, path: sti })
    }

    // 2) Registrer at fila ligger der.
    if (b.handling === 'registrer') {
      const sti = String(b.path || '')
      if (!eierSti(s.id, sti)) return NextResponse.json({ error: 'Ugyldig sti' }, { status: 400 })
      // Fins den faktisk? Et registrert navn uten fil bak er en loegn i koeen.
      const mappe = sti.slice(0, sti.lastIndexOf('/'))
      const navn = sti.slice(sti.lastIndexOf('/') + 1)
      const { data: liste } = await admin().storage.from(boette).list(mappe, { search: navn, limit: 1 })
      if (!liste?.some((f) => f.name === navn)) {
        return NextResponse.json({ error: 'Fila kom ikke fram. Prøv å laste den opp igjen.' }, { status: 409 })
      }
      const neste = naa.includes(sti) ? naa : [...naa, sti]
      const status = leveringsStatus(k,
        kind === 'photo' ? neste.length : (Array.isArray(s.photo_paths) ? s.photo_paths.length : 0),
        kind === 'recording' ? neste.length : (Array.isArray(s.recording_paths) ? s.recording_paths.length : 0))
      const { error } = await admin().from('voice_actor_applications').update({
        [felt]: neste,
        // Settes foerste gang alt er paa plass, og staar deretter — «naar ble
        // hun ferdig» skal ikke flytte seg fordi hun la til ett bilde til.
        ...(status.ferdig && !s.delivered_at ? { delivered_at: new Date().toISOString() } : {}),
      }).eq('id', s.id)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json(svar({ ...s, [felt]: neste, delivered_at: s.delivered_at || (status.ferdig ? new Date().toISOString() : null) }))
    }

    // 3) Fjern ei fil. Slett fra lagring FOER raden — motsatt rekkefoelge
    // etterlater en rad som peker paa noe som finnes, men som hun ikke ser.
    if (b.handling === 'fjern') {
      const sti = String(b.path || '')
      if (!eierSti(s.id, sti) || !naa.includes(sti)) return NextResponse.json({ error: 'Ugyldig sti' }, { status: 400 })
      const { error: slettFeil } = await admin().storage.from(boette).remove([sti])
      if (slettFeil) return NextResponse.json({ error: `Kunne ikke slette (${slettFeil.message})` }, { status: 500 })
      const neste = naa.filter((p) => p !== sti)
      const { error } = await admin().from('voice_actor_applications').update({ [felt]: neste }).eq('id', s.id)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json(svar({ ...s, [felt]: neste }))
    }

    return NextResponse.json({ error: 'Ukjent handling' }, { status: 400 })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
