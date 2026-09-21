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

async function tilR2(buf: Buffer, key: string, type: string): Promise<string> {
  const { S3Client, PutObjectCommand } = await import('@aws-sdk/client-s3')
  const r2 = new S3Client({
    region: 'auto', endpoint: process.env.R2_ENDPOINT!,
    credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID!, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY! },
  })
  await r2.send(new PutObjectCommand({ Bucket: process.env.R2_BUCKET_NAME || 'contentforge-assets', Key: key, Body: buf, ContentType: type }))
  return `${process.env.R2_PUBLIC_URL || 'https://pub-5dcdfe9305a740febc87568c9ccb40a6.r2.dev'}/${key}`
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
  }).select('id').single()
  if (error) throw new Error(error.message)
  const auditionId = (data as { id: string }).id

  await admin().from('audition_takes').insert(
    i.actorIds.map((actorId) => ({
      audition_id: auditionId, actor_id: actorId, stage: 'queued',
      cost_nok: AUDITION_FILM_NOK, actor_nok: honorarFor(AUDITION_FILM_NOK),
    }))
  )
  return { id: auditionId, takes: i.actorIds.length }
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
    .select('id, name, elevenlabs_voice_id').eq('id', t.actor_id).single()
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

  const url = await tilR2(lyd, `auditions/${t.audition_id}/${takeId}-${Date.now()}.mp3`, 'audio/mpeg')

  const { data: read } = await supabase.from('audition_reads').insert({
    take_id: takeId, audio_url: url, direction: valgt,
    stability: st.stability, style: st.style, chars: String(a!.line).length,
    // Hvilken modell som faktisk leste. Uten denne kan to lesninger av samme
    // regi låte helt ulikt uten at noen kan se hvorfor.
    model: brukt.model, tag: brukt.tag,
  }).select('id').single()

  // En lesning er utforskning FØR en avtale finnes — samme kategori som
  // prøvelytt. Skuespilleren får betalt, raden står uten hjemmel.
  await supabase.from('voice_usage_events').insert({
    actor_id: actor.id,
    used_by_tenant_id: a!.tenant_id,
    organization_id: a!.organization_id ?? null,
    licence_id: null,
    actor_rate_nok: honorarFor(AUDITION_READ_NOK),
    customer_price_nok: AUDITION_READ_NOK,
    asset_type: 'voice',
    meta: { kind: 'audition_read', audition_id: a!.id, chars: String(a!.line).length, licence_match: 'preview' },
  })

  await supabase.from('audition_takes').update({ stage: 'ready', updated_at: new Date().toISOString() }).eq('id', takeId)
  return { id: (read as { id: string }).id, audioUrl: url, direction: valgt }
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
    .select('id, name, elevenlabs_voice_id, face_character_id').eq('id', t.actor_id).single()
  const sett = async (felt: Record<string, unknown>) =>
    supabase.from('audition_takes').update({ ...felt, updated_at: new Date().toISOString() }).eq('id', takeId)

  try {
    if (t.stage === 'still' && !t.request_id) {
      const { data: ch } = await supabase.from('user_characters')
        .select('trigger_word, lora_url, status').eq('id', actor!.face_character_id).maybeSingle()
      if (!ch?.lora_url || ch.status !== 'ready') throw new Error(`${actor!.name} har ingen ferdig ansiktsmodell`)
      const trig = ch.trigger_word
      const id = await falSubmit(FLUX, {
        prompt: `${trig}. Use the trained ${trig} LoRA with maximum identity fidelity. ${trig}, natural appearance. Scene: ${a!.scene_prompt}. Photorealistic, cinematic. No text, letters or typography in the image.`,
        loras: [{ path: ch.lora_url, scale: 1.0 }],
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
      const stillUrl = await tilR2(bilde, `auditions/${t.audition_id}/${takeId}-still.png`, 'image/png')
      const id = await falSubmit(FABRIC, { image_url: stillUrl, audio_url: t.audio_url, resolution: '720p' })
      await sett({ stage: 'video', request_id: id, still_url: stillUrl })
      return
    }

    if (t.stage === 'video') {
      const s = await falSjekk(FABRIC, t.request_id!)
      if (!s.ferdig) return
      const url = s.res?.video?.url || s.res?.output?.video?.url
      if (!url) throw new Error('ingen video-url')
      const vid = Buffer.from(await (await fetch(url)).arrayBuffer())
      const videoUrl = await tilR2(vid, `auditions/${t.audition_id}/${takeId}.mp4`, 'video/mp4')

      // Filmen er det kunden BESTILTE. Raden skrives først her, så en hengende
      // kø verken belaster kunden eller krediterer skuespilleren.
      await supabase.from('voice_usage_events').insert({
        actor_id: actor!.id,
        used_by_tenant_id: a!.tenant_id,
        organization_id: a!.organization_id ?? null,
        licence_id: null,
        actor_rate_nok: Number(t.actor_nok ?? honorarFor(AUDITION_FILM_NOK)),
        customer_price_nok: Number(t.cost_nok ?? AUDITION_FILM_NOK),
        asset_type: 'face',
        meta: { kind: 'audition', audition_id: a!.id, includes_voice: true, licence_match: 'preview' },
      })
      await sett({ stage: 'done', video_url: videoUrl })
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

  return {
    takes: (etter || []).map((t) => ({
      ...t,
      reads: (reads || []).filter((r) => r.take_id === t.id),
    })),
    // «Ferdig» er nå bare fase 2. Fase 1 venter på et menneske, og skal ikke
    // få pollingen til å gi seg.
    ferdig: (etter || []).every((t) => ['done', 'failed', 'queued', 'ready'].includes(String(t.stage))),
  }
}
