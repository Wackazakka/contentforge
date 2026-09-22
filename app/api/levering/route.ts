import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getTenant } from '@/lib/tenantServer'
import {
  BILDE_TYPER, LYD_TYPER, MAKS_BILDER, MAKS_FIL_MB,
  eierSti, leveringsSti, leveringsStatus,
} from '@/lib/levering'
import { vurderIdentitet, tilVektorTekst, fraVektorTekst, DUBLETT_TERSKEL, type BildeVektor, type IdentitetsVurdering, type Dublett } from '@/lib/identity'
import { hentAnsikter, embedKonfigurert } from '@/lib/embedClient'

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
  identity_check?: unknown
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
    .select('id, name, is_active, wants_face, offers_voice, has_own_recording, photo_paths, recording_paths, delivered_at, identity_check')
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
    identitet: forSoekeren(s.identity_check),
  }
}

// Det hun faar se av identitetssjekken: sine egne bilder og hva som skiller
// seg ut. IKKE dublettene — «du likner paa X» er en opplysning om X, og den
// hoerer hjemme i adminen, ikke hos en fremmed.
function forSoekeren(ic: unknown) {
  if (!ic || typeof ic !== 'object') return null
  const v = ic as IdentitetsVurdering & { duplicates?: Dublett[] }
  const navn = (p: string) => p.split('/').pop()
  return {
    ok: !!v.ok, reason: v.reason ?? null, photos: v.photos, withFace: v.withFace, sameCount: v.sameCount,
    outliers: (v.outliers || []).map(navn), noFace: (v.noFace || []).map(navn), multiFace: (v.multiFace || []).map(navn),
    checkedAt: v.computedAt ?? null,
  }
}

// ── Identitetssjekken (102) ──────────────────────────────────────────────────
// Kjoeres etter at et bilde er registrert eller fjernet paa en SKUESPILLERRAD.
// Feiler aapent: leveringen er alt lagret naar dette kalles, og en nede
// tjeneste skal ikke gjoere et levert bilde til et ulevert. Feilen skrives
// paa bilderaden saa det er synlig at sjekken mangler.

async function beregnBildevektor(actorId: string, sti: string, boette: string): Promise<void> {
  if (!embedKonfigurert()) return
  const rad: Record<string, unknown> = { actor_id: actorId, path: sti, faces: 0, embedding: null, model: null, det_score: null, error: null }
  try {
    const { data: signert, error } = await admin().storage.from(boette).createSignedUrl(sti, 600)
    if (error || !signert?.signedUrl) throw new Error(error?.message || 'kunne ikke signere')
    const svar = await hentAnsikter(signert.signedUrl)
    rad.model = svar.model ?? null
    rad.faces = svar.faces.length
    if (svar.error) rad.error = svar.error
    if (svar.faces.length > 0) {
      const stoerst = svar.faces[0] // sortert etter areal av tjenesten
      rad.embedding = tilVektorTekst(stoerst.embedding)
      rad.det_score = stoerst.det_score
    }
  } catch (e) {
    rad.error = e instanceof Error ? e.message.slice(0, 300) : 'ukjent feil'
  }
  await admin().from('actor_photo_embeddings').upsert(rad, { onConflict: 'actor_id,path' })
}

async function oppdaterIdentitet(actorId: string): Promise<(IdentitetsVurdering & { duplicates: Dublett[] }) | null> {
  const { data: rader } = await admin()
    .from('actor_photo_embeddings').select('path, embedding, faces').eq('actor_id', actorId)
  const bilder: BildeVektor[] = (rader || []).map((r: any) => ({
    path: r.path, embedding: fraVektorTekst(r.embedding), faces: Number(r.faces) || 0,
  }))
  const v = vurderIdentitet(bilder)
  let duplicates: Dublett[] = []
  if (v.centroid) {
    const { data: naer } = await admin().rpc('naermeste_ansikter', { p_actor: actorId, p_emb: tilVektorTekst(v.centroid), p_k: 5 })
    duplicates = ((naer || []) as Array<{ actor_id: string; name: string; similarity: number }>)
      .filter((n) => Number(n.similarity) >= DUBLETT_TERSKEL)
      .map((n) => ({ actorId: n.actor_id, name: n.name, similarity: Math.round(Number(n.similarity) * 1000) / 1000 }))
  }
  const { centroid, ...lagres } = v
  const identity_check = { ...lagres, duplicates }
  await admin().from('voice_actors').update({
    face_embedding: centroid ? tilVektorTekst(centroid) : null,
    identity_check,
    identity_checked_at: v.computedAt,
  }).eq('id', actorId)
  return { ...v, duplicates }
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
      let identity_check = s.identity_check
      if (kind === 'photo' && s.tabell === 'voice_actors') {
        try {
          await beregnBildevektor(s.id, sti, boette)
          const v = await oppdaterIdentitet(s.id)
          if (v) identity_check = v
        } catch (e) { console.error('[levering] identitetssjekk feilet:', e instanceof Error ? e.message : e) }
      }
      return NextResponse.json(svar({ ...s, [felt]: neste, delivered_at: levert, identity_check }))
    }

    if (b.handling === 'fjern') {
      const sti = String(b.path || '')
      if (!eier(sti) || !naa.includes(sti)) return NextResponse.json({ error: 'Ugyldig sti' }, { status: 400 })
      const { error: slettFeil } = await admin().storage.from(boette).remove([sti])
      if (slettFeil) return NextResponse.json({ error: `Kunne ikke slette (${slettFeil.message})` }, { status: 500 })
      const neste = naa.filter((p) => p !== sti)
      const { error } = await admin().from(s.tabell).update({ [felt]: neste }).eq('id', s.id)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      let identity_check = s.identity_check
      if (kind === 'photo' && s.tabell === 'voice_actors') {
        try {
          await admin().from('actor_photo_embeddings').delete().eq('actor_id', s.id).eq('path', sti)
          const v = await oppdaterIdentitet(s.id)
          if (v) identity_check = v
        } catch (e) { console.error('[levering] identitetssjekk feilet:', e instanceof Error ? e.message : e) }
      }
      return NextResponse.json(svar({ ...s, [felt]: neste, identity_check }))
    }

    return NextResponse.json({ error: 'Ukjent handling' }, { status: 400 })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
