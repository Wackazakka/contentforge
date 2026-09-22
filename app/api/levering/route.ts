import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getTenant } from '@/lib/tenantServer'
import {
  BILDE_TYPER, LYD_TYPER, MAKS_BILDER, MAKS_FIL_MB,
  eierSti, leveringsSti, leveringsStatus,
} from '@/lib/levering'

// Leveringen: bilder til ansiktsmodellen og et opptak hun alt hadde.
//
// 🔑 TO MAATER AA SI HVEM HUN ER PAA, SAMME REGLER ETTERPAA.
//   token   -> en SOEKNAD (099): hun har ingen konto, lenken er alt.
//   bearer  -> en INNLOGGET RETTIGHETSHAVER (101): JWT-ens e-post maa matche
//              actor_email paa raden hun ber om. Stier under actors/<id>/.
// Ruta velger raden ut fra hvilken av de to som kom, og resten er likt.
//
// 🔑 FILENE GAAR IKKE GJENNOM DENNE RUTA. Netlify kutter ved ~6 MB (bevist
// 22.09). Ruta deler ut SIGNERTE opplastingslenker til de private boettene,
// nettleseren laster rett dit, og ruta faar bare stien.
//
// 🔑 EIERSKAPET LIGGER I STIEN. Alt havner under <prefiks>/<hennes id>/, og
// ruta nekter aa registrere eller slette utenfor den mappa — uansett hva
// klienten paastaar.

const BILDE_BOETTE = 'training-sets'
const LYD_BOETTE = 'voice-recordings'

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  )
}

type Rad = {
  tabell: 'voice_actor_applications' | 'voice_actors'
  prefiks: 'applications' | 'actors'
  id: string; name: string; status: string
  wants_face: boolean; offers_voice: boolean | null; has_own_recording: boolean | null
  photo_paths: string[]; recording_paths: string[]; delivered_at: string | null
}

async function hentSoeknad(token: string): Promise<Rad | null> {
  if (!token || token.length < 16) return null
  const { data } = await admin()
    .from('voice_actor_applications')
    .select('id, name, status, wants_face, offers_voice, has_own_recording, photo_paths, recording_paths, delivered_at')
    .eq('delivery_token', token)
    .maybeSingle()
  return data ? { ...(data as any), tabell: 'voice_actor_applications', prefiks: 'applications' } : null
}

async function hentEgenRad(bearer: string, actorId: string): Promise<Rad | null | 'utlogget'> {
  const tenant = await getTenant()
  const { data: u } = await admin().auth.getUser(bearer)
  const epost = u?.user?.email
  if (!epost) return 'utlogget'
  const { data } = await admin()
    .from('voice_actors')
    .select('id, name, is_active, wants_face, offers_voice, has_own_recording, photo_paths, recording_paths, delivered_at')
    .eq('id', actorId)
    .ilike('actor_email', epost)
    .eq('owner_tenant_id', tenant.id)
    .maybeSingle()
  if (!data) return null
  return { ...(data as any), status: 'new', tabell: 'voice_actors', prefiks: 'actors' }
}

async function hentRad(request: Request, token: string, actorId: string): Promise<Rad | null | 'utlogget'> {
  const auth = request.headers.get('authorization')
  if (auth?.startsWith('Bearer ') && actorId) return hentEgenRad(auth.slice(7), actorId)
  return hentSoeknad(token)
}

function krav(s: Rad) {
  return { wantsFace: !!s.wants_face, offersVoice: s.offers_voice !== false, hasOwnRecording: s.has_own_recording }
}

function svar(s: Rad) {
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

const feilFor = (r: Rad | null | 'utlogget') =>
  r === 'utlogget'
    ? NextResponse.json({ error: 'Ikke innlogget' }, { status: 401 })
    : NextResponse.json({ error: 'Lenken er ugyldig eller utgått' }, { status: 404 })

export async function GET(request: Request) {
  try {
    const sp = new URL(request.url).searchParams
    const s = await hentRad(request, sp.get('token') || '', sp.get('actorId') || '')
    if (!s || s === 'utlogget') return feilFor(s)
    return NextResponse.json(svar(s))
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const b = await request.json()
    const s = await hentRad(request, String(b.token || ''), String(b.actorId || ''))
    if (!s || s === 'utlogget') return feilFor(s)
    if (s.status === 'rejected') return NextResponse.json({ error: 'Denne søknaden er avsluttet' }, { status: 410 })

    const kind = b.kind === 'photo' ? 'photo' : b.kind === 'recording' ? 'recording' : null
    if (!kind) return NextResponse.json({ error: 'Ukjent filtype' }, { status: 400 })
    const k = krav(s)
    if (kind === 'photo' && !k.wantsFace) return NextResponse.json({ error: 'Raden gjelder ikke ansikt' }, { status: 400 })
    if (kind === 'recording' && !(k.offersVoice && k.hasOwnRecording === true)) {
      return NextResponse.json({ error: 'Opptaket tas sammen med oss — det lastes ikke opp her' }, { status: 400 })
    }
    const boette = kind === 'photo' ? BILDE_BOETTE : LYD_BOETTE
    const felt = kind === 'photo' ? 'photo_paths' : 'recording_paths'
    const naa: string[] = Array.isArray(s[felt]) ? s[felt] : []
    const eier = (sti: string) => eierSti(s.id, sti, s.prefiks)

    if (b.handling === 'opplastingslenke') {
      const type = String(b.contentType || '')
      const ext = (kind === 'photo' ? BILDE_TYPER : LYD_TYPER)[type]
      if (!ext) {
        return NextResponse.json({ error: kind === 'photo' ? 'Bilder må være JPG, PNG eller WebP' : 'Lydfila må være MP3, M4A, WAV, FLAC, AIFF, OGG eller WebM' }, { status: 415 })
      }
      if (Number(b.size || 0) > MAKS_FIL_MB * 1024 * 1024) {
        return NextResponse.json({ error: `Fila er for stor (maks ${MAKS_FIL_MB} MB). Del opptaket i flere filer, eller bruk MP3/M4A.` }, { status: 413 })
      }
      if (kind === 'photo' && naa.length >= MAKS_BILDER) return NextResponse.json({ error: `Maks ${MAKS_BILDER} bilder` }, { status: 400 })
      const sti = leveringsSti(s.id, kind, ext, s.prefiks)
      const { data, error } = await admin().storage.from(boette).createSignedUploadUrl(sti)
      if (error) return NextResponse.json({ error: `Kunne ikke lage opplastingslenke (${error.message}). Finnes bøtta «${boette}»?` }, { status: 500 })
      return NextResponse.json({ uploadUrl: data.signedUrl, path: sti })
    }

    if (b.handling === 'registrer') {
      const sti = String(b.path || '')
      if (!eier(sti)) return NextResponse.json({ error: 'Ugyldig sti' }, { status: 400 })
      const mappe = sti.slice(0, sti.lastIndexOf('/'))
      const navn = sti.slice(sti.lastIndexOf('/') + 1)
      const { data: liste } = await admin().storage.from(boette).list(mappe, { search: navn, limit: 1 })
      if (!liste?.some((f) => f.name === navn)) return NextResponse.json({ error: 'Fila kom ikke fram. Prøv å laste den opp igjen.' }, { status: 409 })
      const neste = naa.includes(sti) ? naa : [...naa, sti]
      const nB = kind === 'photo' ? neste.length : (Array.isArray(s.photo_paths) ? s.photo_paths.length : 0)
      const nO = kind === 'recording' ? neste.length : (Array.isArray(s.recording_paths) ? s.recording_paths.length : 0)
      const status = leveringsStatus(k, nB, nO)
      const levert = s.delivered_at || (status.ferdig ? new Date().toISOString() : null)
      const { error } = await admin().from(s.tabell).update({
        [felt]: neste, ...(levert && !s.delivered_at ? { delivered_at: levert } : {}),
      }).eq('id', s.id)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json(svar({ ...s, [felt]: neste, delivered_at: levert }))
    }

    if (b.handling === 'fjern') {
      const sti = String(b.path || '')
      if (!eier(sti) || !naa.includes(sti)) return NextResponse.json({ error: 'Ugyldig sti' }, { status: 400 })
      const { error: slettFeil } = await admin().storage.from(boette).remove([sti])
      if (slettFeil) return NextResponse.json({ error: `Kunne ikke slette (${slettFeil.message})` }, { status: 500 })
      const neste = naa.filter((p) => p !== sti)
      const { error } = await admin().from(s.tabell).update({ [felt]: neste }).eq('id', s.id)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json(svar({ ...s, [felt]: neste }))
    }

    return NextResponse.json({ error: 'Ukjent handling' }, { status: 400 })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
