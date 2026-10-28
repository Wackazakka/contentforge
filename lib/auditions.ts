import { createClient } from '@supabase/supabase-js'
import { kr } from '@/lib/rateCard'

// Audition i TO FASER (Lars 20.09.2026).
//
// 🔑 DESIGNREGELEN: alt unntatt skuespilleren er identisk. Scene-prompten ligger
// på AUDITIONEN, ikke på taket. Varierer rammen, sammenlikner regissøren
// bilder; er rammen lik, sammenlikner hen skuespillere.
//
// 🔑 FASE 1 ER LESNINGER, FASE 2 ER FILM. Den første versjonen gjorde ett kast
// — bilde, stemme og film i én kjede — og kunden betalte for filmen enten
// lesningen duget eller ikke. Det er motsatt av hvordan en stemmeøkt foregår:
// man regisserer lesningen, og forplikter seg til bilde etterpå.
//
// At en lesning kan gjentas er en ekte REGIHANDLING her, ikke et
// parameterspørsmål: modellen er ikke deterministisk, så samme regi gir ulike
// lesninger. Det er nøyaktig slik en studioøkt fungerer.
//
// Lesninger lages SYNKRONT (TTS tar et par sekunder). Bare filmen trenger
// stegmaskinen, fordi et stillbilde tar ~15 s og en render godt over et minutt
// — og ingen serverless-funksjon rekker det.

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
  )
}

/** Justerbare, som takstkortet. Råkost per film ligger rundt 8 kr. */
export const AUDITION_FILM_NOK = 39
/**
 * Skuespillerens andel som PROSENT, ikke kroner. Et fast beløp betyr at en
 * prisøkning i stillhet kutter andelen hans — samme feil lisensmodellen unngår
 * ved å skrive begge beløp eksplisitt.
 */
export const AUDITION_ACTOR_PCT = 30
/** Lesninger går på prøvelytt-nivå: utforskning skal være billig. */
export const AUDITION_READ_NOK = 2

export const honorarFor = (kundepris: number) => kr((kundepris * AUDITION_ACTOR_PCT) / 100)

/**
 * Regi → stemmeinnstillinger, og for de sterke regiene en LYDTAGG.
 *
 * 🔑 TALLENE ALENE ER IKKE REGI (Lars 21.09). `stability` lav gir mer
 * VARIASJON mellom lesninger, ikke mer intensitet — og `style` honoreres
 * dårlig eller ikke i det hele tatt av turbo-modellen, som er en
 * lavlatensmodell. Resultatet var at «Dramatisk» og «Nøytral» låt like: to
 * tall som ikke kan be om et rop.
 *
 * Taggen er v3-modellens mekanisme for nettopp dette — den står i TEKSTEN,
 * ikke i innstillingene.
 *
 * ⚠️ TAGGEN MÅ ALDRI NÅ TURBO. Sendes «[shouting]» til en modell som ikke
 * kjenner tagger, LESER den ordet høyt. Derfor legges taggen på kun i
 * v3-forsøket, og faller vi tilbake, faller teksten tilbake med.
 */
export const REGI: Record<string, { stability: number; style: number; tag?: string }> = {
  noytral: { stability: 0.5, style: 0.0 },
  varm: { stability: 0.45, style: 0.4 },
  entusiastisk: { stability: 0.3, style: 0.75, tag: 'excited' },
  rolig: { stability: 0.8, style: 0.0 },
  trist: { stability: 0.7, style: 0.2, tag: 'sad' },
  dramatisk: { stability: 0.25, style: 0.85, tag: 'shouting, desperate' },
}

const MODELL_V3 = 'eleven_v3'
const MODELL_TURBO = 'eleven_turbo_v2_5'

/**
 * Forsøkene, i rekkefølge, for én lesning.
 *
 * Vi VET ikke hva kontoen støtter — nøkkelen ligger bare i Netlify, så det lot
 * seg ikke slå opp da dette ble skrevet. I stedet for å gjette, prøver vi det
 * beste først og faller nedover. Hvilket ledd som lyktes lagres på raden, så
 * første ekte audition SVARER på spørsmålet i stedet for at vi antar.
 *
 * Leddene:
 *   1. v3 med tagg og språkkode — det vi håper på.
 *   2. v3 med tagg uten språkkode — `language_code` er dokumentert for
 *      turbo/flash; avviser v3 den, skal ikke hele regien ryke med.
 *   3. turbo uten tagg — dagens oppførsel. Flat, men den virker, og en
 *      regissør midt i en audition skal få lyd og ikke en feilmelding.
 */
function forsoek(st: { stability: number; style: number; tag?: string }) {
  const v3 = st.tag
    ? [
        { model: MODELL_V3, tag: st.tag, lang: true },
        { model: MODELL_V3, tag: st.tag, lang: false },
      ]
    : []
  return [...v3, { model: MODELL_TURBO, tag: null as string | null, lang: true }]
}

const falAuth = () => ({ Authorization: 'Key ' + (process.env.CONTENTFORGE_FAL_KEY || '') })

async function jsonEllerNull(r: Response) {
  const t = await r.text()
  if (!t.trim()) return null
  try { return JSON.parse(t) } catch { return null }
}

/** fal legger status under APP-prefikset (to første ledd), ikke hele stien. */
const appAv = (model: string) => model.split('/').slice(0, 2).join('/')

async function falSubmit(model: string, body: unknown) {
  const r = await fetch(`https://queue.fal.run/${model}`, {
    method: 'POST', headers: { ...falAuth(), 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  })
  const s = await jsonEllerNull(r)
  if (!r.ok || !s?.request_id) throw new Error(`${model} submit ${r.status}: ${JSON.stringify(s).slice(0, 200)}`)
  return s.request_id as string
}

async function falSjekk(model: string, requestId: string) {
  const st = await jsonEllerNull(await fetch(`https://queue.fal.run/${appAv(model)}/requests/${requestId}/status`, { headers: falAuth() }))
  if (!st) return { ferdig: false as const }
  if (st.status === 'FAILED' || st.status === 'ERROR') throw new Error(`${model} ${st.status}`)
  if (st.status !== 'COMPLETED') return { ferdig: false as const }
  const res = await jsonEllerNull(await fetch(`https://queue.fal.run/${appAv(model)}/requests/${requestId}`, { headers: falAuth() }))
  if (!res) return { ferdig: false as const }
  return { ferdig: true as const, res }
}

const FLUX = 'fal-ai/flux-lora'
const FABRIC = 'veed/fabric-1.0'

// 🔑 OPPTAKENE ER EKTE MENNESKERS ANSIKT OG STEMME, og ligger derfor PRIVAT
// (Lars 25.10.2026). Fram til da gikk lyd, stillbilde og film til R2-bøtta,
// som er eksponert i sin helhet gjennom `pub-…r2.dev` — en lenke som virket
// for alle, for alltid. Samme hull som treningsbildene hadde, og samme
// løsning: den private bøtta, STIEN på raden, og en signert lenke med kort
// levetid hver gang noen åpner opptaket.
//
// Stiene er de samme som nøklene i R2 var (`auditions/<audition>/…`), så de
// gamle opptakene kunne flyttes uten å bytte navn
// (scripts/flytt-audition-opptak.mjs).
export const AUDITION_BOETTE = 'training-sets'
/** Lenkene siden får. Siden bytter dem selv før de går ut (app/audition). */
const VIS_SEK = 600
/** Lenkene fal får til lyd og stillbilde. En jobb kan stå i kø en stund før den henter dem. */
const FAL_SEK = 3600

async function lagrePrivat(buf: Buffer, sti: string, type: string): Promise<string> {
  // upsert: en film som startes på nytt etter en feil skriver samme still-sti igjen.
  const { error } = await admin().storage.from(AUDITION_BOETTE).upload(sti, buf, { contentType: type, upsert: true })
  if (error) throw new Error(`Lagring feilet (${sti}): ${error.message}`)
  return sti
}

/**
 * Stier → signerte lenker, i én runde. Eldre http-adresser slippes gjennom som
 * de er, som i signerProever. En sti som ikke lar seg signere blir null —
 * pollingen skal ikke stoppe fordi én fil mangler.
 */
async function signer(stier: Array<string | null | undefined>, sek: number): Promise<Map<string, string | null>> {
  const ut = new Map<string, string | null>()
  const privat = new Set<string>()
  for (const s of stier) {
    if (!s) continue
    if (/^https?:\/\//.test(s)) ut.set(s, s)
    else privat.add(s)
  }
  if (privat.size) {
    const { data, error } = await admin().storage.from(AUDITION_BOETTE).createSignedUrls([...privat], sek)
    if (error) console.warn('[audition] signering feilet:', error.message)
    for (const d of data || []) if (d.path) ut.set(d.path, d.signedUrl || null)
  }
  return ut
}

async function signerEn(sti: string, sek: number): Promise<string> {
  const url = (await signer([sti], sek)).get(sti)
  if (!url) throw new Error(`Kunne ikke signere ${sti}`)
  return url
}

export interface AuditionInput {
  tenantId: string
  organizationId?: string | null
  title?: string | null
  line: string
  direction?: string | null
  scenePrompt: string
  actorIds: string[]
  createdBy?: string | null
  /** Alder i scenen (114). Gir aldersmodellen som dekker den, der den finnes. */
  targetAge?: number | null
}

export async function opprettAudition(i: AuditionInput) {
  const { data, error } = await admin().from('auditions').insert({
    tenant_id: i.tenantId,
    organization_id: i.organizationId ?? null,
    title: i.title ?? null,
    line: i.line,
    direction: i.direction ?? 'noytral',
    scene_prompt: i.scenePrompt,
    created_by: i.createdBy ?? null,
    ...(i.targetAge != null ? { target_age: i.targetAge } : {}),
  }).select('id').single()
  if (error) throw new Error(error.message)
  const auditionId = (data as { id: string }).id

  // 🔑 ALDERSMODELLEN VELGES NÅR RUNDEN LAGES (114), og står på opptaket.
  // Plukkeren fant henne på alderen; filmen skal vise henne på alderen. Har
  // hun ingen modell som dekker den, brukes standardansiktet — og opptaket
  // sier det (tom etikett), så castern ser at det er dagens ansikt.
  const modellFor = new Map<string, { ref: string; label: string }>()
  if (i.targetAge != null) {
    const { brukbareAldersmodeller } = await import('@/lib/ageModels')
    const { velgForAlder } = await import('@/lib/aldersvalg')
    const alle = await brukbareAldersmodeller(i.actorIds)
    for (const actorId of i.actorIds) {
      const treff = velgForAlder(alle.filter((m) => m.actorId === actorId), i.targetAge)
      if (treff) modellFor.set(actorId, { ref: treff.characterId, label: treff.label })
    }
  }

  await admin().from('audition_takes').insert(
    i.actorIds.map((actorId) => ({
      audition_id: auditionId, actor_id: actorId, stage: 'queued',
      cost_nok: AUDITION_FILM_NOK, actor_nok: honorarFor(AUDITION_FILM_NOK),
      ...(modellFor.has(actorId) ? { face_model_ref: modellFor.get(actorId)!.ref, face_model_label: modellFor.get(actorId)!.label } : {}),
    }))
  )
  return { id: auditionId, takes: i.actorIds.length, ageModels: modellFor.size }
}

/**
 * FASE 1 — lag én lesning. Synkront: TTS tar et par sekunder.
 * Kan kalles mange ganger på samme plass; hver gang er en ny take.
 */
export async function lagLesning(takeId: string, regi?: string | null) {
  const supabase = admin()
  const { data: t } = await supabase.from('audition_takes').select('*').eq('id', takeId).maybeSingle()
  if (!t) throw new Error('Finnes ikke')
  const { data: a } = await supabase.from('auditions').select('*').eq('id', t.audition_id).single()
  const { data: actor } = await supabase.from('voice_actors')
    .select('id, name, elevenlabs_voice_id, twin_version').eq('id', t.actor_id).single()
  if (!actor?.elevenlabs_voice_id) throw new Error(`${actor?.name ?? 'Skuespilleren'} har ingen stemme`)

  const valgt = regi || a!.direction || 'noytral'
  const st = REGI[valgt] || REGI.noytral

  let lyd: Buffer | null = null
  let brukt: { model: string; tag: string | null } | null = null
  const feil: string[] = []

  for (const f of forsoek(st)) {
    // Taggen står i teksten, foran replikken — det er v3-modellens form.
    const tekst = f.tag ? `[${f.tag}] ${a!.line}` : a!.line
    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${actor.elevenlabs_voice_id}`, {
      method: 'POST',
      headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY || '', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: tekst,
        model_id: f.model,
        ...(f.lang ? { language_code: 'no' } : {}),
        apply_text_normalization: 'off',
        voice_settings: { stability: st.stability, style: st.style, similarity_boost: 0.75 },
      }),
    })
    if (res.ok) {
      lyd = Buffer.from(await res.arrayBuffer())
      brukt = { model: f.model, tag: f.tag }
      break
    }
    // Grunnen tas vare på: feiler ALLE ledd, er det denne teksten som forteller
    // hvorfor — og «Stemmen feilet (422)» alene har aldri hjulpet noen.
    feil.push(`${f.model}${f.lang ? '' : ' uten språkkode'}: ${res.status} ${(await res.text()).slice(0, 160)}`)
  }

  if (!lyd || !brukt) throw new Error(`Stemmen feilet — ${feil.join(' | ')}`)
  if (brukt.model !== MODELL_TURBO || st.tag) {
    // Logges alltid når regien VILLE hatt en tagg, også når den lyktes: det er
    // slik vi får vite hva kontoen faktisk støtter.
    console.log(`[audition] regi=${valgt} modell=${brukt.model} tagg=${brukt.tag ?? '—'}${feil.length ? ` (falt fra: ${feil.join(' | ')})` : ''}`)
  }

  const sti = await lagrePrivat(lyd, `auditions/${t.audition_id}/${takeId}-${Date.now()}.mp3`, 'audio/mpeg')

  const { data: read } = await supabase.from('audition_reads').insert({
    take_id: takeId, audio_url: sti, direction: valgt,
    stability: st.stability, style: st.style, chars: String(a!.line).length,
    // Hvilken modell som faktisk leste. Uten denne kan to lesninger av samme
    // regi låte helt ulikt uten at noen kan se hvorfor.
    model: brukt.model, tag: brukt.tag,
  }).select('id').single()

  // En lesning er utforskning FØR en avtale finnes — samme kategori som
  // prøvelytt. Skuespilleren får betalt, raden står uten hjemmel.
  const { tekstMeta, skrivDetaljer } = await import('@/lib/usageDetails')
  const replikk = { body: String(a!.line || ''), kind: 'line' as const }
  const { data: royaltyRad } = await supabase.from('voice_usage_events').insert({
    actor_id: actor.id,
    used_by_tenant_id: a!.tenant_id,
    organization_id: a!.organization_id ?? null,
    licence_id: null,
    actor_rate_nok: honorarFor(AUDITION_READ_NOK),
    customer_price_nok: AUDITION_READ_NOK,
    asset_type: 'voice',
    // Versjonen som leste (112) — gjeldende, siden lesningen bruker gjeldende stemme.
    twin_version: (actor as { twin_version?: number | null }).twin_version ?? null,
    meta: { kind: 'audition_read', audition_id: a!.id, chars: String(a!.line).length, licence_match: 'preview', ...tekstMeta(replikk) },
  }).select('id').single()
  // Replikken og lesningen ved siden av hovedboken (128). Lyden ligger privat.
  await skrivDetaljer((royaltyRad as { id: string } | null)?.id, { tekst: replikk, resultat: { url: sti, kind: 'audio', store: 'training-sets' } })

  await supabase.from('audition_takes').update({ stage: 'ready', updated_at: new Date().toISOString() }).eq('id', takeId)
  // Lesningen er lagret og ført; en signeringshikke her skal ikke se ut som at den feilet.
  return { id: (read as { id: string }).id, audioUrl: (await signer([sti], VIS_SEK)).get(sti) ?? null, direction: valgt }
}

/** Velg hvilken lesning filmen skal bygges på. Én per plass. */
export async function velgLesning(readId: string) {
  const supabase = admin()
  const { data: r } = await supabase.from('audition_reads').select('id, take_id').eq('id', readId).maybeSingle()
  if (!r) throw new Error('Lesningen finnes ikke')
  await supabase.from('audition_reads').update({ is_chosen: false }).eq('take_id', r.take_id)
  await supabase.from('audition_reads').update({ is_chosen: true }).eq('id', readId)
  return { takeId: r.take_id as string }
}

/** FASE 2 — start filmen. Krever en valgt lesning. */
export async function startFilm(takeId: string) {
  const supabase = admin()
  const { data: valgt } = await supabase.from('audition_reads')
    .select('id, audio_url').eq('take_id', takeId).eq('is_chosen', true).maybeSingle()
  if (!valgt?.audio_url) throw new Error('Velg en lesning først')
  await supabase.from('audition_takes')
    .update({ stage: 'still', request_id: null, audio_url: valgt.audio_url, feil: null, updated_at: new Date().toISOString() })
    .eq('id', takeId)
  await flyttTake(takeId)
}

/**
 * Stegmaskinen for FASE 2. Kalles av poll-ruten, aldri i en løkke som venter.
 * Request-id-en ligger på raden, så et påbegynt (og betalt) steg aldri er tapt.
 */
export async function flyttTake(takeId: string): Promise<void> {
  const supabase = admin()
  const { data: t } = await supabase.from('audition_takes').select('*').eq('id', takeId).maybeSingle()
  // Bare fase 2 skyves. 'queued' og 'ready' venter på en menneskelig handling.
  if (!t || (t.stage !== 'still' && t.stage !== 'video')) return

  const { data: a } = await supabase.from('auditions').select('*').eq('id', t.audition_id).single()
  const { data: actor } = await supabase.from('voice_actors')
    .select('id, name, elevenlabs_voice_id, face_character_id, twin_version').eq('id', t.actor_id).single()
  const sett = async (felt: Record<string, unknown>) =>
    supabase.from('audition_takes').update({ ...felt, updated_at: new Date().toISOString() }).eq('id', takeId)

  try {
    if (t.stage === 'still' && !t.request_id) {
      // Porten: kaster om rettighetshaveren har trukket ansiktet tilbake.
      // Se lib/faceWithdrawal — ett oppslag for alle genereringsveiene.
      const { hentAnsiktForGenerering } = await import('@/lib/faceWithdrawal')
      // Aldersmodellen opptaket ble satt opp med (114), ellers standardansiktet.
      // Samme port for begge: stengt eller ikke godkjent → kaster.
      const ref = (t.face_model_ref as string | null) || actor!.face_character_id
      if (!ref) throw new Error(`${actor!.name} har ingen ansiktsmodell`)
      const ch = await hentAnsiktForGenerering(ref)
      const trig = ch.triggerWord
      const id = await falSubmit(FLUX, {
        prompt: `${trig}. Use the trained ${trig} LoRA with maximum identity fidelity. ${trig}, natural appearance. Scene: ${a!.scene_prompt}. Photorealistic, cinematic. No text, letters or typography in the image.`,
        loras: [{ path: ch.loraUrl, scale: 1.0 }],
        image_size: { width: 1344, height: 768 }, num_images: 1, output_format: 'png',
      })
      await sett({ request_id: id })
      return
    }

    if (t.stage === 'still' && t.request_id) {
      const s = await falSjekk(FLUX, t.request_id)
      if (!s.ferdig) return
      const url = s.res?.images?.[0]?.url
      if (!url) throw new Error('ingen stillbilde-url')
      const bilde = Buffer.from(await (await fetch(url)).arrayBuffer())
      const stillSti = await lagrePrivat(bilde, `auditions/${t.audition_id}/${takeId}-still.png`, 'image/png')
      // fal henter lyd og bilde selv, og får en signert lenke — ikke en
      // offentlig adresse. Raden beholder stiene.
      const id = await falSubmit(FABRIC, {
        image_url: await signerEn(stillSti, FAL_SEK),
        audio_url: await signerEn(String(t.audio_url), FAL_SEK),
        resolution: '720p',
      })
      await sett({ stage: 'video', request_id: id, still_url: stillSti })
      return
    }

    if (t.stage === 'video') {
      const s = await falSjekk(FABRIC, t.request_id!)
      if (!s.ferdig) return
      const url = s.res?.video?.url || s.res?.output?.video?.url
      if (!url) throw new Error('ingen video-url')
      const vid = Buffer.from(await (await fetch(url)).arrayBuffer())
      const videoSti = await lagrePrivat(vid, `auditions/${t.audition_id}/${takeId}.mp4`, 'video/mp4')

      // Filmen er det kunden BESTILTE. Raden skrives først her, så en hengende
      // kø verken belaster kunden eller krediterer skuespilleren.
      const { tekstMeta, skrivDetaljer } = await import('@/lib/usageDetails')
      const replikk = { body: String(a!.line || ''), kind: 'line' as const }
      const { data: royaltyRad } = await supabase.from('voice_usage_events').insert({
        actor_id: actor!.id,
        used_by_tenant_id: a!.tenant_id,
        organization_id: a!.organization_id ?? null,
        licence_id: null,
        actor_rate_nok: Number(t.actor_nok ?? honorarFor(AUDITION_FILM_NOK)),
        customer_price_nok: Number(t.cost_nok ?? AUDITION_FILM_NOK),
        asset_type: 'face',
        // Versjonen modellen hørte til (112/113) — ved aldersmodell den som hadde den.
        twin_version: t.face_model_ref
          ? await (await import('@/lib/licenceMatch')).versjonForBruk(actor!.id, 'face', t.face_model_ref as string)
          : (actor as { twin_version?: number | null } | null)?.twin_version ?? null,
        meta: {
          kind: 'audition', audition_id: a!.id, includes_voice: true, licence_match: 'preview',
          ...(t.face_model_ref ? { model: t.face_model_ref, age_model: t.face_model_label } : {}),
          ...tekstMeta(replikk),
        },
      }).select('id').single()
      await skrivDetaljer((royaltyRad as { id: string } | null)?.id, { tekst: replikk, resultat: { url: videoSti, kind: 'video', store: 'training-sets' } })
      await sett({ stage: 'done', video_url: videoSti })
      return
    }
  } catch (err) {
    await sett({ stage: 'failed', feil: (err as Error).message })
  }
}

/** Skyv alle takes i fase 2 ett hakk og returner tilstanden med lesninger. */
export async function pollAudition(auditionId: string) {
  const supabase = admin()
  const { data: takes } = await supabase.from('audition_takes').select('id, stage').eq('audition_id', auditionId)
  await Promise.all((takes || [])
    .filter((t) => t.stage === 'still' || t.stage === 'video')
    .map((t) => flyttTake(t.id as string)))

  const { data: etter } = await supabase.from('audition_takes')
    .select('id, actor_id, stage, still_url, video_url, feil, cost_nok').eq('audition_id', auditionId).order('created_at')
  const ids = (etter || []).map((t) => t.id as string)
  const { data: reads } = ids.length
    ? await supabase.from('audition_reads')
        .select('id, take_id, audio_url, direction, is_chosen, created_at, model, tag')
        .in('take_id', ids).order('created_at')
    : { data: [] as Array<Record<string, unknown>> }

  // Raden har stier; siden får lenker som går ut.
  const lenke = await signer([
    ...(etter || []).flatMap((t) => [t.still_url as string | null, t.video_url as string | null]),
    ...(reads || []).map((r) => r.audio_url as string | null),
  ], VIS_SEK)
  const signert = (s: unknown) => (s ? lenke.get(String(s)) ?? null : null)

  return {
    takes: (etter || []).map((t) => ({
      ...t,
      still_url: signert(t.still_url),
      video_url: signert(t.video_url),
      reads: (reads || []).filter((r) => r.take_id === t.id).map((r) => ({ ...r, audio_url: signert(r.audio_url) })),
    })),
    // «Ferdig» er nå bare fase 2. Fase 1 venter på et menneske, og skal ikke
    // få pollingen til å gi seg.
    ferdig: (etter || []).every((t) => ['done', 'failed', 'queued', 'ready'].includes(String(t.stage))),
  }
}
