import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getTenant } from '@/lib/tenantServer'
import { isTenantAdmin } from '@/lib/voiceBank'
import { rvcErKonfigurert, startTrening, startKonvertering, RvcIkkeKonfigurert } from '@/lib/rvc'
import { lesArtistType, lovligeKilder, erklaeringFor, sangHinder, kanAktiveres, erSangKilde } from '@/lib/sang'
import { boetteFor, sangSti, erSangSti } from '@/lib/sangTrening'
import { modellerFor, signerLagret, signerSti } from '@/lib/sangServer'

// Sangstemmen på skuespillerkortet (127) — der adminen forvalter den.
//
//   GET    ?actorId=                                   modellene, kildene, hindringene
//   POST   { action: 'upload-url', actorId, kind, ext } signert opplasting (datasett eller vokal til prøve)
//   POST   { action: 'train', actorId, path, sha256?, seconds?, source, sourceNote? }
//   POST   { action: 'sample', modelId, path, semitones? }  prøve: gjør om en vokal med modellen
//   PATCH  { action: 'activate', modelId }               ta i bruk (ferdig og godkjent av rettighetshaveren)
//   PATCH  { action: 'withdraw', modelId }               trekk tilbake; er den aktiv, slutter den å virke
//   PATCH  { actorId, offersSinging }                    sang av/på
//
// 🔑 DATASETTET GÅR ALDRI GJENNOM DENNE RUTA (Netlify-grensen, 099). Nettleseren
// pakker opptakene og laster zipen rett til den private bøtta; ruta får stien.
//
// 🔑 ERKLÆRINGEN FRYSES FRA KILDEN, ikke fra klienten (lib/sang).

function db() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || '', process.env.SUPABASE_SERVICE_ROLE_KEY || '')
}

async function vakt(request: Request) {
  const tenant = await getTenant()
  if (tenant.id === 'root') return { fail: NextResponse.json({ error: 'Tenant-oppsett mangler' }, { status: 404 }) }
  const auth = request.headers.get('authorization')
  const email = auth?.startsWith('Bearer ') ? (await db().auth.getUser(auth.slice(7))).data?.user?.email ?? null : null
  if (!email) return { fail: NextResponse.json({ error: 'Ikke innlogget' }, { status: 401 }) }
  if (!(await isTenantAdmin(email, tenant.id))) return { fail: NextResponse.json({ error: 'Ingen admin-tilgang' }, { status: 403 }) }
  return { tenant, email }
}

type Aktoer = {
  id: string; name: string; owner_tenant_id: string; intake_status: string | null; is_active: boolean
  artist_kind: string | null; offers_singing: boolean | null; singing_model_id: string | null
  virtual_declaration: string | null; virtual_declared_at: string | null
}

const ikkeKjoert = () => NextResponse.json({ error: 'Sang er ikke slått på ennå (migrasjon 127 mangler).', code: 'NOT_ENABLED' }, { status: 409 })

async function egenAktoer(tenantId: string, actorId: unknown): Promise<Aktoer | null | 'mangler'> {
  if (typeof actorId !== 'string' || !actorId) return null
  const { data, error } = await db().from('voice_actors')
    .select('id, name, owner_tenant_id, intake_status, is_active, artist_kind, offers_singing, singing_model_id, virtual_declaration, virtual_declared_at')
    .eq('id', actorId).eq('owner_tenant_id', tenantId).maybeSingle()
  if (error) return 'mangler'
  return (data as Aktoer | null) ?? null
}

async function modellMedEier(tenantId: string, modelId: unknown) {
  if (typeof modelId !== 'string' || !/^[0-9a-f-]{36}$/i.test(modelId)) return null
  const { data } = await db().from('singing_models')
    .select('id, actor_id, tenant_id, status, approval_status, model_path')
    .eq('id', modelId).eq('tenant_id', tenantId).maybeSingle()
  return data as { id: string; actor_id: string; tenant_id: string; status: string; approval_status: string; model_path: string | null } | null
}

async function kort(a: Aktoer) {
  const type = lesArtistType(a.artist_kind)
  const modeller = await modellerFor(a.id, a.singing_model_id)
  return {
    enabled: modeller !== null,
    configured: rvcErKonfigurert(),
    artistKind: type,
    offersSinging: a.offers_singing === true,
    virtualDeclaration: a.virtual_declaration,
    virtualDeclaredAt: a.virtual_declared_at,
    activeModelId: a.singing_model_id,
    sources: lovligeKilder(type).map((k) => ({ source: k, declaration: erklaeringFor(type, k) })),
    intakeAccepted: (a.intake_status ?? 'accepted') === 'accepted',
    models: modeller || [],
  }
}

export async function GET(request: Request) {
  const v = await vakt(request)
  if (v.fail) return v.fail
  const a = await egenAktoer(v.tenant!.id, new URL(request.url).searchParams.get('actorId'))
  if (a === 'mangler') return NextResponse.json({ enabled: false, configured: rvcErKonfigurert() })
  if (!a) return NextResponse.json({ error: 'Skuespilleren finnes ikke i denne banken' }, { status: 404 })
  return NextResponse.json(await kort(a))
}

export async function POST(request: Request) {
  try {
    const v = await vakt(request)
    if (v.fail) return v.fail
    const b = await request.json().catch(() => ({}))

    if (b.action === 'sample') {
      const m = await modellMedEier(v.tenant!.id, b.modelId)
      if (!m) return NextResponse.json({ error: 'Fant ikke modellen' }, { status: 404 })
      if (m.status !== 'ready' || !m.model_path) return NextResponse.json({ error: 'Modellen er ikke ferdig trent ennå.' }, { status: 409 })
      if (!erSangSti(b.path, m.actor_id)) return NextResponse.json({ error: 'Ugyldig sti' }, { status: 400 })
      const halvtoner = Math.max(-24, Math.min(24, Math.round(Number(b.semitones) || 0)))
      const [modellUrl, innUrl] = await Promise.all([signerLagret(m.model_path, 6 * 3600), signerSti(b.path, 3600)])
      const jobb = await startKonvertering(innUrl, modellUrl, { halvtoner })
      await db().from('singing_models').update({
        sample_input_path: b.path, sample_job_id: jobb.id, sample_path: null, last_error: null, updated_at: new Date().toISOString(),
      }).eq('id', m.id)
      const a = await egenAktoer(v.tenant!.id, m.actor_id)
      return NextResponse.json(a && a !== 'mangler' ? await kort(a) : { ok: true })
    }

    const a = await egenAktoer(v.tenant!.id, b.actorId)
    if (a === 'mangler') return ikkeKjoert()
    if (!a) return NextResponse.json({ error: 'Skuespilleren finnes ikke i denne banken' }, { status: 404 })

    if (b.action === 'upload-url') {
      const ext = String(b.ext || '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 5)
      const stempel = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      let sti: string
      if (b.kind === 'datasett') sti = sangSti.datasett(a.id, stempel)
      else if (b.kind === 'inn' && ['wav', 'mp3', 'flac', 'm4a', 'ogg'].includes(ext)) sti = sangSti.inn(a.id, stempel, ext)
      else return NextResponse.json({ error: 'Ukjent filtype' }, { status: 400 })
      const { data, error } = await db().storage.from(boetteFor(sti)).createSignedUploadUrl(sti)
      if (error || !data?.signedUrl) return NextResponse.json({ error: `Kunne ikke lage opplastingslenke (${error?.message || 'ukjent'})` }, { status: 500 })
      return NextResponse.json({ uploadUrl: data.signedUrl, path: sti })
    }

    if (b.action === 'train') {
      if (!rvcErKonfigurert()) return NextResponse.json({ error: new RvcIkkeKonfigurert().message, code: 'NOT_CONFIGURED' }, { status: 409 })
      if (!erSangSti(b.path, a.id) || !String(b.path).endsWith('.zip')) return NextResponse.json({ error: 'Ugyldig sti' }, { status: 400 })
      const type = lesArtistType(a.artist_kind)
      const kildeNotat = String(b.sourceNote || '').trim().slice(0, 200) || null
      const hinder = sangHinder({
        vurdering: a.intake_status ?? 'accepted', type, kilde: b.source, kildeNotat,
        virtueltErklaert: !!a.virtual_declared_at,
      })
      if (hinder) return NextResponse.json({ error: hinder }, { status: 409 })
      if (!erSangKilde(b.source)) return NextResponse.json({ error: 'Ukjent kilde' }, { status: 400 })

      // Fila må faktisk ligge der før vi betaler for en trening.
      const mappe = String(b.path).split('/').slice(0, -1).join('/')
      const navn = String(b.path).split('/').pop()
      const { data: liste } = await db().storage.from(boetteFor(String(b.path))).list(mappe, { search: navn })
      if (!liste?.some((f) => f.name === navn)) return NextResponse.json({ error: 'Opptakene kom ikke fram. Prøv å laste dem opp igjen.' }, { status: 409 })

      const sekunder = Number(b.seconds)
      const { data: rad, error } = await db().from('singing_models').insert({
        actor_id: a.id, tenant_id: a.owner_tenant_id, provider: 'rvc', status: 'training',
        source: b.source, source_note: kildeNotat,
        declaration: erklaeringFor(type, b.source), declared_by: v.email,
        training_set_path: b.path,
        training_set_sha256: /^[0-9a-f]{64}$/.test(String(b.sha256 || '')) ? b.sha256 : null,
        training_seconds: Number.isFinite(sekunder) && sekunder > 0 ? Math.round(sekunder) : null,
        created_by: v.email,
      }).select('id').single()
      if (error || !rad) return NextResponse.json({ error: `Kunne ikke registrere treningen (${error?.message})` }, { status: 500 })

      try {
        const jobb = await startTrening(await signerSti(b.path, 3600))
        await db().from('singing_models').update({ external_id: jobb.id, provider_version: jobb.versjon, epochs: 80 }).eq('id', rad.id)
      } catch (e) {
        const melding = e instanceof Error ? e.message : 'ukjent'
        await db().from('singing_models').update({ status: 'failed', last_error: `Kunne ikke starte treningen (${melding.slice(0, 200)})` }).eq('id', rad.id)
        return NextResponse.json({ error: `Kunne ikke starte treningen (${melding})` }, { status: 502 })
      }
      return NextResponse.json(await kort(a))
    }

    return NextResponse.json({ error: 'Ukjent handling' }, { status: 400 })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Ukjent feil' }, { status: 500 })
  }
}

export async function PATCH(request: Request) {
  try {
    const v = await vakt(request)
    if (v.fail) return v.fail
    const b = await request.json().catch(() => ({}))

    if (b.action === 'activate' || b.action === 'withdraw') {
      const m = await modellMedEier(v.tenant!.id, b.modelId)
      if (!m) return NextResponse.json({ error: 'Fant ikke modellen' }, { status: 404 })
      const a = await egenAktoer(v.tenant!.id, m.actor_id)
      if (!a || a === 'mangler') return NextResponse.json({ error: 'Fant ikke skuespilleren' }, { status: 404 })
      if (b.action === 'activate') {
        if (!kanAktiveres(m)) return NextResponse.json({ error: 'Modellen må være ferdig trent og godkjent av rettighetshaveren først.' }, { status: 409 })
        // Ny tvillingversjon lages av triggeren (127): en lisens utvides aldri stille.
        const { error } = await db().from('voice_actors').update({ singing_model_id: m.id }).eq('id', a.id)
        if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      } else {
        const { error } = await db().from('singing_models').update({ status: 'withdrawn', updated_at: new Date().toISOString() }).eq('id', m.id)
        if (error) return NextResponse.json({ error: error.message }, { status: 500 })
        if (a.singing_model_id === m.id) await db().from('voice_actors').update({ singing_model_id: null }).eq('id', a.id)
      }
      const ny = await egenAktoer(v.tenant!.id, a.id)
      return NextResponse.json(ny && ny !== 'mangler' ? await kort(ny) : { ok: true })
    }

    if (typeof b.offersSinging === 'boolean') {
      const a = await egenAktoer(v.tenant!.id, b.actorId)
      if (a === 'mangler') return ikkeKjoert()
      if (!a) return NextResponse.json({ error: 'Skuespilleren finnes ikke i denne banken' }, { status: 404 })
      if (!b.offersSinging && a.singing_model_id) {
        return NextResponse.json({ error: 'Sangstemmen er i bruk. Trekk modellen tilbake først.' }, { status: 409 })
      }
      const { error } = await db().from('voice_actors').update({ offers_singing: b.offersSinging }).eq('id', a.id)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json(await kort({ ...a, offers_singing: b.offersSinging }))
    }

    return NextResponse.json({ error: 'Ukjent handling' }, { status: 400 })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Ukjent feil' }, { status: 500 })
  }
}
