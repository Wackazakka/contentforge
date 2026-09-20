import { createClient } from '@supabase/supabase-js'
import { kr } from '@/lib/rateCard'

// Audition: samme scene, samme replikk, ulike skuespillere.
//
// 🔑 DESIGNREGELEN: alt unntatt skuespilleren er identisk. Scene-prompten ligger
// på AUDITIONEN, ikke på taket, nettopp derfor. Varierer rammen, sammenlikner
// regissøren bilder; er rammen lik, sammenlikner hen skuespillere.
//
// ⚠️ STEGVIS, ikke synkront. Stillbilde ~15 s, Fabric ~60 s — ingen
// serverless-funksjon rekker det. Hver take bærer leverandørens `request_id`
// og en `stage`, og `flyttTake` skyver den ett hakk. Uten request_id på raden
// er et påbegynt (og betalt) steg tapt.

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
  )
}

/** Justerbare, som takstkortet. Råkost per take ligger rundt 8 kr. */
export const AUDITION_TAKE_NOK = 39
export const AUDITION_ACTOR_NOK = 12

/** Regi → stemmeinnstillinger. Husets EMOTION_PRESETS. */
const REGI: Record<string, { stability: number; style: number }> = {
  noytral: { stability: 0.5, style: 0.0 },
  varm: { stability: 0.45, style: 0.4 },
  entusiastisk: { stability: 0.3, style: 0.75 },
  rolig: { stability: 0.8, style: 0.0 },
  trist: { stability: 0.7, style: 0.2 },
  dramatisk: { stability: 0.25, style: 0.85 },
}

const FAL = () => process.env.CONTENTFORGE_FAL_KEY || ''
const falAuth = () => ({ Authorization: 'Key ' + FAL() })

async function jsonEllerNull(r: Response) {
  const t = await r.text()
  if (!t.trim()) return null
  try { return JSON.parse(t) } catch { return null }
}

/** Submit til fal-køen. Returnerer id-en OG url-ene fra svaret — aldri
 *  selvbygde stier, som er der fal-fella med app-prefikset bor. */
async function falSubmit(model: string, body: unknown) {
  const r = await fetch(`https://queue.fal.run/${model}`, {
    method: 'POST', headers: { ...falAuth(), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const s = await jsonEllerNull(r)
  if (!r.ok || !s?.request_id) throw new Error(`${model} submit ${r.status}: ${JSON.stringify(s).slice(0, 200)}`)
  return { id: s.request_id as string, statusUrl: s.status_url as string, resultUrl: s.response_url as string }
}

/** Sjekk ETT steg uten å vente: ferdig, feilet, eller fortsatt i arbeid. */
async function falSjekk(model: string, requestId: string) {
  const st = await jsonEllerNull(await fetch(`https://queue.fal.run/${appAv(model)}/requests/${requestId}/status`, { headers: falAuth() }))
  if (!st) return { ferdig: false as const }
  if (st.status === 'FAILED' || st.status === 'ERROR') throw new Error(`${model} ${st.status}`)
  if (st.status !== 'COMPLETED') return { ferdig: false as const }
  const res = await jsonEllerNull(await fetch(`https://queue.fal.run/${appAv(model)}/requests/${requestId}`, { headers: falAuth() }))
  if (!res) return { ferdig: false as const }
  return { ferdig: true as const, res }
}

/** fal legger status under APP-prefikset (to første ledd), ikke hele stien. */
const appAv = (model: string) => model.split('/').slice(0, 2).join('/')

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
      cost_nok: AUDITION_TAKE_NOK, actor_nok: AUDITION_ACTOR_NOK,
    }))
  )
  return { id: auditionId, takes: i.actorIds.length, prisNok: kr(i.actorIds.length * AUDITION_TAKE_NOK) }
}

/**
 * Skyv én take ett hakk videre. Kalles av poll-ruten, aldri i en løkke som
 * venter — hele poenget er at ingen forespørsel blir stående og henge.
 */
export async function flyttTake(takeId: string): Promise<void> {
  const supabase = admin()
  const { data: t } = await supabase.from('audition_takes').select('*').eq('id', takeId).maybeSingle()
  if (!t || t.stage === 'done' || t.stage === 'failed') return

  const { data: a } = await supabase.from('auditions').select('*').eq('id', t.audition_id).single()
  const { data: actor } = await supabase.from('voice_actors')
    .select('id, name, elevenlabs_voice_id, face_character_id, owner_tenant_id').eq('id', t.actor_id).single()

  const sett = async (felt: Record<string, unknown>) =>
    supabase.from('audition_takes').update({ ...felt, updated_at: new Date().toISOString() }).eq('id', takeId)

  try {
    // 1) Stillbildet — samme scene for alle, kun ansiktsmodellen varierer.
    if (t.stage === 'queued') {
      const { data: ch } = await supabase.from('user_characters')
        .select('trigger_word, lora_url, status').eq('id', actor!.face_character_id).maybeSingle()
      if (!ch?.lora_url || ch.status !== 'ready') throw new Error(`${actor!.name} har ingen ferdig ansiktsmodell`)
      const trig = ch.trigger_word
      const { id } = await falSubmit(FLUX, {
        prompt: `${trig}. Use the trained ${trig} LoRA with maximum identity fidelity. ${trig}, natural appearance. Scene: ${a!.scene_prompt}. Photorealistic, cinematic. No text, letters or typography in the image.`,
        loras: [{ path: ch.lora_url, scale: 1.0 }],
        image_size: { width: 1344, height: 768 }, num_images: 1, output_format: 'png',
      })
      await sett({ stage: 'still', request_id: id })
      return
    }

    // 2) Stillbildet ferdig → last opp, lag replikken, start leppesynken.
    if (t.stage === 'still') {
      const s = await falSjekk(FLUX, t.request_id!)
      if (!s.ferdig) return
      const url = s.res?.images?.[0]?.url
      if (!url) throw new Error('ingen stillbilde-url')
      const bilde = Buffer.from(await (await fetch(url)).arrayBuffer())
      const stillUrl = await tilR2(bilde, `auditions/${t.audition_id}/${takeId}-still.png`, 'image/png')

      const st = REGI[a!.direction || 'noytral'] || REGI.noytral
      const tts = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${actor!.elevenlabs_voice_id}`, {
        method: 'POST',
        headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY || '', 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: a!.line, model_id: 'eleven_turbo_v2_5', language_code: 'no',
          apply_text_normalization: 'off', voice_settings: { ...st, similarity_boost: 0.75 },
        }),
      })
      if (!tts.ok) throw new Error(`stemmen feilet (${tts.status})`)
      const lyd = Buffer.from(await tts.arrayBuffer())
      const audioUrl = await tilR2(lyd, `auditions/${t.audition_id}/${takeId}-audio.mp3`, 'audio/mpeg')

      const { id } = await falSubmit(FABRIC, { image_url: stillUrl, audio_url: audioUrl, resolution: '720p' })
      await sett({ stage: 'video', request_id: id, still_url: stillUrl, audio_url: audioUrl })
      return
    }

    // 3) Videoen ferdig → last opp og før raden i hovedboken.
    if (t.stage === 'video') {
      const s = await falSjekk(FABRIC, t.request_id!)
      if (!s.ferdig) return
      const url = s.res?.video?.url || s.res?.output?.video?.url
      if (!url) throw new Error('ingen video-url')
      const vid = Buffer.from(await (await fetch(url)).arrayBuffer())
      const videoUrl = await tilR2(vid, `auditions/${t.audition_id}/${takeId}.mp4`, 'video/mp4')

      // En audition er bruk FØR en lisens finnes — samme kategori som
      // prøvelytt. Derfor uten hjemmel, og merket slik at hullet er tilsiktet
      // og ikke ser ut som en klareringsbrist ved revisjon.
      await supabase.from('voice_usage_events').insert({
        actor_id: actor!.id,
        used_by_tenant_id: a!.tenant_id,
        organization_id: a!.organization_id ?? null,
        licence_id: null,
        actor_rate_nok: Number(t.actor_nok ?? AUDITION_ACTOR_NOK),
        customer_price_nok: Number(t.cost_nok ?? AUDITION_TAKE_NOK),
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

/** Skyv alle uferdige takes ett hakk og returner tilstanden. */
export async function pollAudition(auditionId: string) {
  const supabase = admin()
  const { data: takes } = await supabase.from('audition_takes').select('id, stage').eq('audition_id', auditionId)
  await Promise.all((takes || [])
    .filter((t) => t.stage !== 'done' && t.stage !== 'failed')
    .map((t) => flyttTake(t.id as string)))

  const { data: etter } = await supabase.from('audition_takes')
    .select('id, actor_id, stage, still_url, video_url, feil').eq('audition_id', auditionId).order('created_at')
  const ferdig = (etter || []).every((t) => t.stage === 'done' || t.stage === 'failed')
  if (ferdig) await supabase.from('auditions').update({ status: 'done' }).eq('id', auditionId)
  return { takes: etter || [], ferdig }
}
