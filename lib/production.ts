import { createClient } from '@supabase/supabase-js'
import { fetchVerticalForOrganization } from '@/lib/senderContext.mjs'

const DROPLET_URL = 'http://139.59.212.218:3002'

// Strip emojis from text for compatibility with renderer
function stripEmojis(text: string): string {
  return text
    .replace(/[\u{1F000}-\u{1FFFF}|\u{2600}-\u{27FF}|\u{2300}-\u{23FF}|\u{2B00}-\u{2BFF}|\u{FE00}-\u{FEFF}|\u{1F900}-\u{1F9FF}|\u{1FA00}-\u{1FAFF}]/gu, '')
    .trim()
}

export interface ProductionOptions {
  imageStyle?: string
  includeOutroCard?: boolean
  outroJingle?: string | null
  aiMotion?: boolean
  aiMotionEngine?: string
}

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
  )
}


// Språket til en ElevenLabs-stemme: 'en' for engelske aksenter, ellers 'no'.
// Egen innspilling ('own') genererer ingen TTS — språket spiller ingen rolle.
const langCache = new Map<string, 'no' | 'en'>()
async function voiceLanguageFor(voiceId?: string | null): Promise<'no' | 'en'> {
  if (!voiceId || voiceId === 'own') return 'no'
  const cached = langCache.get(voiceId)
  if (cached) return cached
  try {
    const key = process.env.ELEVENLABS_API_KEY
    if (!key) return 'no'
    const res = await fetch(`https://api.elevenlabs.io/v1/voices/${voiceId}`, {
      headers: { 'xi-api-key': key },
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) return 'no'
    const v = await res.json()
    const t = `${v?.labels?.accent || ''} ${v?.labels?.language || ''}`.toLowerCase()
    const lang: 'no' | 'en' = /oslo|norweg|\bno\b|nb|swedish|danish/.test(t)
      ? 'no'
      : (/british|american|australian|canadian|irish|scottish|\ben\b|english/.test(t) ? 'en' : 'no')
    langCache.set(voiceId, lang)
    return lang
  } catch {
    return 'no'
  }
}

/**
 * Start produksjon for en draft. Kalles både fra /api/start-production (gratis-sti)
 * og fra Stripe-webhooken etter betaling (ingen HTTP-hopp).
 * Eksplisitte opts overstyrer; ellers leses valgene fra draft-raden (persistert ved checkout).
 * Kaster Error ved feil; returnerer { jobId }.
 */
export async function startProductionForDraft(
  draftId: string,
  opts: ProductionOptions = {}
): Promise<{ jobId: string }> {
  const supabase = admin()

  const { data: draft, error } = await supabase
    .from('production_drafts')
    .select('*')
    .eq('id', draftId)
    .single()
  if (error || !draft) throw new Error('Draft ikke funnet')

  // Valg: eksplisitt → draft-kolonne → default
  const imageStyle = opts.imageStyle ?? draft.image_style ?? 'editorial'
  const includeOutroCard = opts.includeOutroCard ?? draft.include_outro_card ?? true
  const outroJingle = opts.outroJingle !== undefined ? opts.outroJingle : (draft.outro_jingle ?? null)
  const aiMotion = opts.aiMotion ?? draft.ai_motion ?? false
  // Kling som standard (31/7): PixVerse ga munnbevegelse tross munnsperre
  const aiMotionEngine = opts.aiMotionEngine ?? draft.ai_motion_engine ?? 'kling'

  // Produktprofil for logo/farger (select * tåler at valgfrie kolonner mangler)
  const [{ data: productProfile }, { data: product }] = await Promise.all([
    supabase
      .from('product_profiles')
      .select('*')
      .eq('product_id', draft.product_id)
      .single(),
    supabase.from('products').select('logo_url, organization_id').eq('id', draft.product_id).single(),
  ])
  // Artistenes egne bilder er komposisjoner (Lars 31/7): music-vertikalen
  // viser HELE bildet med sort rundt i stedet for aa beskjaere til formatet.
  let vertical: string | null = null
  try {
    vertical = await fetchVerticalForOrganization(supabase, (product as any)?.organization_id)
  } catch { /* ukjent vertikal = trygge standarder */ }
  const imageFit: 'cover' | 'contain' = vertical === 'music' ? 'contain' : 'cover'
  const logoUrl = productProfile?.logo_url || product?.logo_url || null
  const websiteUrl = productProfile?.website_url || null

  // Sluttplakat-kontroll (Lars 31/7): artistens egne valg fra redigereren
  // (outro_config jsonb) vinner over automatikken. imageUrl === null betyr
  // eksplisitt «uten bilde»; undefined betyr «bruk standard (logo)».
  const oc = (draft.outro_config && typeof draft.outro_config === 'object') ? draft.outro_config : {}
  const outroUrl = oc.url || websiteUrl
  const outroCard = (includeOutroCard && outroUrl)
    ? {
        url: outroUrl,
        cta: (oc.message !== undefined && oc.message !== null) ? String(oc.message) : (draft.cta || ''),
        logoUrl: oc.imageUrl === null ? null : (oc.imageUrl || logoUrl || null),
        primaryColor: productProfile?.primary_color || '#1a1a2e',
        secondaryColor: productProfile?.secondary_color || '#ffffff',
        durationSeconds: 3,
        jingleFile: outroJingle || null,
        // Kontaktlinje på sluttplakaten («url · tlf») — rendres av droplet-python
        // når den er oppdatert; ukjente felter ignoreres trygt av eldre renderer.
        // Artister (music) skal IKKE ha telefonnummer på plakaten (Lars 31/7)
        // — fansen skal til lenken, ikke ringe booking.
        phone: vertical === 'music' ? null : ((productProfile as any)?.phone || null),
      }
    : null

  // Merkekort mot rabatt (Lars 1/8): valgfritt 2-sekunders kort ETTER
  // artistens sluttplakat — aldri i stedet for. Tenanten betaler for sin
  // egen synlighet ved å gi fra seg halve påslaget sitt.
  const { data: tenantRad } = (product as any)?.organization_id
    ? await supabase
        .from('organizations')
        .select('tenants(app_name, name, logo_url, colors, markup_percent)')
        .eq('id', (product as any).organization_id)
        .single()
    : { data: null }
  const tn: any = (tenantRad as any)?.tenants || null
  const brandCard = (draft.brand_card === true && tn)
    ? {
        text: `${tn.app_name || tn.name || ''} VideoMaker`.trim(),
        logoUrl: tn.logo_url || null,
        bgColor: (tn.colors && (tn.colors['--paper'] || tn.colors['--ink'])) || '#14161B',
        textColor: (tn.colors && tn.colors['--paper']) ? '#14161B' : '#FFFFFF',
        durationSeconds: 2,
      }
    : null

  const segments = draft.segments || []
  const allApproved = segments.every((s: any) => s.approved === true)
  if (!allApproved) {
    const approvedCount = segments.filter((s: any) => s.approved).length
    throw new Error(`Ikke alle segmenter er godkjent (${approvedCount}/${segments.length})`)
  }

  // «Egen stemme»: ingen AI-fallback finnes — alle segmenter MÅ ha lyd før
  // produksjon, ellers feiler vi her med klar beskjed (aldri stille TTS).
  // Unntak: segmenter merket «uten tale» (31/7) skal nettopp ikke ha lyd.
  if (draft.voice_id === 'own') {
    const missing = segments
      .map((s: any, i: number) => (!s.voiceover_url && s.no_voice !== true ? i + 1 : null))
      .filter((n: number | null) => n !== null)
    if (missing.length > 0) {
      throw new Error(
        `Du har valgt egen stemme — les inn eller last opp lyd på alle segmentene først (mangler: segment ${missing.join(', ')})`
      )
    }
  }

  // Kanonisk rekkefølge = array-rekkefølgen (se kommentar i original rute)
  const processedSegments = segments.map((s: any, i: number) => ({
    index: i,
    text: stripEmojis(s.text),
    voiceover: s.voiceover,
    imagePrompt: s.image_prompt || s.imagePrompt || '',
    imageUrl: s.image_url,
    // Et AI-opptak laget med en ANNEN stemme enn den som er valgt nå skal
    // ALDRI brukes (Lars 31/7: gammel «Adam»-lyd overlevde et stemmebytte og
    // dukket opp i filmen). Egne innspillinger (own_voice) er artistens egen
    // røst og gjelder uansett valgt AI-stemme. Opptak uten stempel (laget før
    // 31/7) godtas kun når stemmen ikke er byttet siden.
    voiceoverUrl: (() => {
      if (!s.voiceover_url) return null
      if (s.own_voice) return s.voiceover_url
      if (draft.voice_id === 'own') return null // AI-lyd har ingen plass her
      // Uten stempel vet vi ikke hvilken stemme som lagde opptaket — og et
      // opptak vi ikke kan gå god for skal ikke inn i filmen. Det koster en
      // ny TTS-generering (~0,50 kr per scene) den ene gangen; fra da av er
      // alle opptak stemplet.
      if (!s.voice_used) return null
      if (s.voice_used !== draft.voice_id) return null
      return s.voiceover_url
    })(),
    // «Uten tale» (31/7): bilde + musikk, ingen voiceover genereres
    noVoice: s.no_voice === true,
    // Artistens egen video som scenebakgrunn (1/8) — brukes i stedet for
    // AI-animasjon, gratis. Lyden strippes på dropleten.
    videoUrl: s.video_url || null,
    // «Lag animasjonen på nytt»: nonce omgår dropletens klipp-cache
    clipNonce: s.clip_nonce || '',
    // Bevegelsesstil per scene (Lars 1/8) — 'custom' bruker motionPrompt
    motionStyle: s.motion_style || 'push-in',
    motionPrompt: s.motion_prompt || '',
    allowMouth: s.allow_mouth === true,
    // Musikkdrevet tempo: hviletid etter stemmen per segment. Stille
    // segmenter uten film=musikk og uten egen verdi får 5 s standard —
    // ellers ville scenen vart 0,4 s.
    holdSeconds: Number(s.hold_seconds) > 0 ? Number(s.hold_seconds) : (s.no_voice === true ? 5 : 0),
    animate: s.animate === true,
    motion: s.motion || (s.animate === true ? 'move' : 'none'),
  }))

  const jobRes = await fetch(`${DROPLET_URL}/jobs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      campaignId: draft.campaign_id || draft.id,
      productId: draft.product_id,
      service: draft.service || 'storytelling',
      targetAudience: draft.target_audience || '',
      problem: draft.problem || '',
      // 'own' er ingen ekte ElevenLabs-stemme: alle segmenter har egen lyd
      // (validert over), men dropletens nedlastings-fallback trenger en
      // gyldig id som sikkerhetsnett hvis en nedlasting skulle feile.
      voiceId: (draft.voice_id && draft.voice_id !== 'own') ? draft.voice_id : 'nhvaqgRyAq6BmFs3WcdX',
      // «Film = musikkens lengde»: serveren regner musikklengde/antall
      // segmenter og setter hviletidene presist (maalt, ikke gjettet)
      matchMusicLength: segments.some((s: any) => s.match_music === true),
      tone: draft.tone || 'Energisk',
      cta: draft.cta || '',
      segments: processedSegments,
      video_format: draft.video_format || '9:16',
      musicStyle: draft.music_style || 'Upbeat',
      musicFile: draft.music_file || null,
      logoUrl,
      imageStyle,
      outroCard,
      aiMotion: !!aiMotion,
      aiMotionEngine,
      imageFit,
      // Engelsk stemme trenger 'en' — ellers leses teksten med norske
      // uttaleregler (Lars 1/8). Slaas opp direkte hos ElevenLabs, saa det
      // ikke krever en ny kolonne og aldri kan komme i utakt med stemmevalget.
      voiceLanguage: await voiceLanguageFor(draft.voice_id),
      brandCard,
    }),
  })
  const job = await jobRes.json()
  if (!jobRes.ok) throw new Error(job.error || 'Job queue error')

  const { error: updateError } = await supabase
    .from('production_drafts')
    .update({ status: 'processing', job_id: job.jobId })
    .eq('id', draftId)
  if (updateError) console.error('[production] draft-oppdatering feilet (jobben er i kø):', updateError)

  console.log('[production] Startet jobb', job.jobId, 'for draft', draftId)
  return { jobId: job.jobId }
}

/**
 * Oppfyll en betalt produksjon fra en Stripe checkout-session.
 * ATOMISK idempotens: UPDATE … WHERE stripe_session_id=$s AND status='pending'
 * RETURNING — 0 rader betyr at en annen kjøring (webhook-retry/confirm) alt har
 * håndtert den. Fikser BilDeal-mønsterets les-så-inkrementer-dobbeloppfyllelse.
 */
export async function fulfillProductionSession(
  session: { id: string; payment_intent?: string | null; metadata?: Record<string, string> | null },
  eventId?: string
): Promise<{ jobId?: string; alreadyHandled?: boolean }> {
  const supabase = admin()
  const draftId = session.metadata?.draft_id
  if (!draftId) throw new Error('Mangler draft_id i session-metadata')

  const { data: claimed, error: claimErr } = await supabase
    .from('production_payments')
    .update({
      status: 'paid',
      stripe_event_id: eventId ?? null,
      stripe_payment_intent_id: (session.payment_intent as string) || null,
      updated_at: new Date().toISOString(),
    })
    .eq('stripe_session_id', session.id)
    .eq('status', 'pending')
    .select('id')
  if (claimErr) throw new Error('Betalings-oppdatering feilet: ' + claimErr.message)
  if (!claimed || claimed.length === 0) {
    console.log('[production] Session', session.id, 'allerede håndtert — hopper over')
    return { alreadyHandled: true }
  }

  await supabase.from('production_drafts').update({ payment_status: 'paid' }).eq('id', draftId)

  try {
    const { jobId } = await startProductionForDraft(draftId)
    await supabase.from('production_payments').update({ status: 'fulfilled', updated_at: new Date().toISOString() }).eq('stripe_session_id', session.id)
    await supabase.from('production_drafts').update({ payment_status: 'consumed' }).eq('id', draftId)
    return { jobId }
  } catch (err: any) {
    // Betalt men produksjon feilet → HØYLYTT logg + failed-status (manuell refusjon i v1)
    console.error('[production] ‼️ BETALT MEN PRODUKSJON FEILET — session', session.id, 'draft', draftId, ':', err.message)
    await supabase.from('production_payments').update({ status: 'failed', updated_at: new Date().toISOString() }).eq('stripe_session_id', session.id)
    throw err
  }
}
