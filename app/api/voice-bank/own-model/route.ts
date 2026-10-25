import { NextResponse } from 'next/server'
import { randomBytes } from 'crypto'
import { createClient } from '@supabase/supabase-js'
import { getTenant } from '@/lib/tenantServer'
import { MODELL_ERKLAERING } from '@/lib/levering'

// Rettighetshaverens EGEN ansiktsmodell (23.10.2026).
//
// Har hun alt en Flux-LoRA, skal hun slippe treningen — og det skal koste
// henne ingenting. Men modellen går gjennom de samme portene som våre egne:
//
//   1. Hun må ha levert bilder (102) — fingeravtrykket fra dem er det
//      modellen sjekkes mot. 🔑 Uten det kunne hvem som helst levere en modell
//      av en annen og si «dette er meg».
//   2. Fila må være en Flux-LoRA. Dropleten leser safetensors-hodet og regner
//      fingeravtrykket (sha256) i samme strøm — FØR vi betaler fal for noe.
//   3. Hun står inne for den (MODELL_ERKLAERING), også for kommersiell bruk.
//      Teksten fryses på modellfila som kildefil (110/115).
//   4. Tre prøvebilder lages og skåres mot bildene hennes (kvalitetsporten,
//      105). Likner de ikke nok, stoppes den — hun får grunnen.
//   5. Hun ser prøvebildene og svarer (091). Har hun ikke noe ansikt fra før,
//      blir modellen ansiktet hennes når hun sier ja.
//
// FILA GÅR IKKE GJENNOM DENNE RUTA (Netlify-grensen, 099): nettleseren laster
// rett til den private bøtta med en signert lenke. lora_url lagres som
// «sb://training-sets/<sti>» og signeres når fal trenger den (lib/loraKilde).

const BOETTE = 'training-sets'
const MAKS_MB = 1024

function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || '', process.env.SUPABASE_SERVICE_ROLE_KEY || '')
}

type Aktoer = {
  id: string; name: string; actor_email: string | null; owner_tenant_id: string
  wants_face: boolean | null; face_character_id: string | null; face_embedding: unknown
}

async function hentEgen(request: Request, actorId: string): Promise<{ a: Aktoer; userId: string } | NextResponse> {
  const auth = request.headers.get('authorization')
  if (!auth?.startsWith('Bearer ')) return NextResponse.json({ error: 'Ikke innlogget' }, { status: 401 })
  const { data: u } = await admin().auth.getUser(auth.slice(7))
  const epost = u?.user?.email
  if (!epost || !u?.user?.id) return NextResponse.json({ error: 'Ikke innlogget' }, { status: 401 })
  const tenant = await getTenant()
  const { data } = await admin().from('voice_actors')
    .select('id, name, actor_email, owner_tenant_id, wants_face, face_character_id, face_embedding')
    .eq('id', actorId).ilike('actor_email', epost).eq('owner_tenant_id', tenant.id).maybeSingle()
  if (!data) return NextResponse.json({ error: 'Fant ikke profilen din' }, { status: 404 })
  return { a: data as Aktoer, userId: u.user.id }
}

const kanLasteOpp = (a: Aktoer) => !!a.face_embedding

async function status(a: Aktoer) {
  const { data } = await admin().from('user_characters')
    .select('id, name, status, approval_status, approval_sent_at, last_error, created_at, trainer')
    .ilike('subject_email', a.actor_email || '').eq('owner_tenant_id', a.owner_tenant_id)
    .like('trainer', 'egen:%').order('created_at', { ascending: false }).limit(10)
  return {
    eligible: kanLasteOpp(a),
    reason: kanLasteOpp(a) ? null : 'Last opp bildene dine først — vi sjekker modellen mot dem.',
    maxMb: MAKS_MB,
    declaration: MODELL_ERKLAERING,
    hasFace: !!a.face_character_id,
    models: (data || []).map((m) => ({
      id: m.id, status: m.status, approval: m.approval_status, emailSent: !!m.approval_sent_at,
      error: m.last_error, createdAt: m.created_at, base: String(m.trainer || '').includes('flux-2') ? 'flux2' : 'flux1',
    })),
  }
}

export async function GET(request: Request) {
  const r = await hentEgen(request, new URL(request.url).searchParams.get('actorId') || '')
  if (r instanceof NextResponse) return r
  return NextResponse.json(await status(r.a))
}

export async function POST(request: Request) {
  try {
    const b = await request.json()
    const r = await hentEgen(request, String(b.actorId || ''))
    if (r instanceof NextResponse) return r
    const { a, userId } = r
    if (!kanLasteOpp(a)) return NextResponse.json({ error: 'Last opp bildene dine først — vi sjekker modellen mot dem.' }, { status: 409 })
    const mappe = `models/${a.id}`

    if (b.handling === 'lenke') {
      if (!String(b.filename || '').toLowerCase().endsWith('.safetensors')) {
        return NextResponse.json({ error: 'Last opp .safetensors-fila fra treningen.' }, { status: 415 })
      }
      if (Number(b.size || 0) > MAKS_MB * 1024 * 1024) return NextResponse.json({ error: `Fila er for stor (maks ${MAKS_MB} MB).` }, { status: 413 })
      const sti = `${mappe}/${Date.now()}.safetensors`
      const { data, error } = await admin().storage.from(BOETTE).createSignedUploadUrl(sti)
      if (error) return NextResponse.json({ error: `Kunne ikke lage opplastingslenke (${error.message})` }, { status: 500 })
      return NextResponse.json({ uploadUrl: data.signedUrl, path: sti })
    }

    if (b.handling === 'registrer') {
      if (b.erklaert !== true) return NextResponse.json({ error: 'Kryss av for erklæringen.' }, { status: 400 })
      const sti = String(b.path || '')
      if (!sti.startsWith(`${mappe}/`) || !sti.endsWith('.safetensors') || sti.includes('..')) {
        return NextResponse.json({ error: 'Ugyldig sti' }, { status: 400 })
      }
      const trigger = String(b.triggerWord || '').trim()
      if (!trigger || trigger.length > 40) return NextResponse.json({ error: 'Skriv utløserordet modellen ble trent med (maks 40 tegn).' }, { status: 400 })
      const base = b.base === 'flux2' ? 'flux2' : 'flux1'

      // Kom fila fram?
      const navn = sti.slice(sti.lastIndexOf('/') + 1)
      const { data: liste } = await admin().storage.from(BOETTE).list(mappe, { search: navn, limit: 1 })
      if (!liste?.some((f) => f.name === navn)) return NextResponse.json({ error: 'Fila kom ikke fram. Prøv å laste den opp igjen.' }, { status: 409 })

      // Port 2: er det en Flux-LoRA? Fingeravtrykket regnes i samme strøm.
      const { data: lese } = await admin().storage.from(BOETTE).createSignedUrl(sti, 600)
      if (!lese?.signedUrl) return NextResponse.json({ error: 'Fant ikke fila' }, { status: 500 })
      const { hentHash } = await import('@/lib/embedClient')
      const { hindringForModell } = await import('@/lib/loraHode')
      let hash
      try { hash = await hentHash(lese.signedUrl) } catch (e) {
        return NextResponse.json({ error: `Kunne ikke lese modellfila akkurat nå (${e instanceof Error ? e.message.slice(0, 120) : 'ukjent'}). Prøv igjen om litt.` }, { status: 503 })
      }
      const hinder = hindringForModell(hash)
      if (hinder) {
        // En fil som aldri kan brukes, skal ikke ligge igjen med et menneskes navn på.
        await admin().storage.from(BOETTE).remove([sti])
        return NextResponse.json({ error: hinder }, { status: 400 })
      }

      const { data: kar, error: kFeil } = await admin().from('user_characters').insert({
        name: `${a.name} (egen modell)`,
        trigger_word: trigger,
        status: 'ready',
        lora_url: `sb://${BOETTE}/${sti}`,
        owner_tenant_id: a.owner_tenant_id,
        created_by: userId,
        trainer: base === 'flux2' ? 'egen:flux-2' : 'egen:flux-1',
        consent_subject: 'other_consented',
        consent_declared_at: new Date().toISOString(),
        consent_declared_by: userId,
        subject_email: a.actor_email,
        approval_status: 'pending',
        approval_token: randomBytes(24).toString('base64url'),
        source_files: [{ path: sti, sha256: hash.sha256, declared_at: new Date().toISOString() }],
      }).select('id').single()
      if (kFeil || !kar) return NextResponse.json({ error: `Kunne ikke registrere modellen (${kFeil?.message})` }, { status: 500 })
      const karakterId = (kar as { id: string }).id

      // Port 3: erklæringen og fingeravtrykket, frosset på modellfila.
      const { registrerKildefil } = await import('@/lib/kildefiler')
      await registrerKildefil({
        eierTabell: 'voice_actors', eierId: a.id, kind: 'model', path: sti, erklaering: MODELL_ERKLAERING,
        forhaand: { sha256: hash.sha256, bytes: hash.bytes, contentType: 'application/octet-stream' },
      })

      // Port 4: prøvebildene lages nå; kvalitetsporten og e-posten tar resten (cron).
      try {
        const { hentAnsiktForProeve } = await import('@/lib/faceWithdrawal')
        const { startProever } = await import('@/lib/faceSamples')
        await startProever(await hentAnsiktForProeve(karakterId), karakterId, 0)
      } catch (e) {
        await admin().from('user_characters').update({ status: 'failed', last_error: `Kunne ikke starte prøvebildene (${e instanceof Error ? e.message.slice(0, 160) : 'ukjent'})` }).eq('id', karakterId)
      }
      return NextResponse.json(await status(a))
    }

    return NextResponse.json({ error: 'Ukjent handling' }, { status: 400 })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Ukjent feil' }, { status: 500 })
  }
}
