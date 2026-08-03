import { NextResponse } from 'next/server'
import { COSTS_NOK } from '@/lib/costs'
import { holdSecondsFor } from '@/lib/sceneTiming'

// «Se animasjonen» (Lars 31/7): generer ÉN scenes bevegelsesklipp og vis det
// i redigereren FØR produksjon — i stedet for å oppdage en rar animasjon i
// den ferdige filmen. Klippet legges i dropletens klipp-cache, så produksjonen
// etterpå gjenbruker det gratis: forhåndsvisningen er ikke bortkastede penger.
//
// POST starter (eller finner i cache), GET poller. Generering tar minutter.
const DROPLET = 'http://139.59.212.218:3002'

function admin() {
  const { createClient } = require('@supabase/supabase-js')
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
  )
}

export async function POST(request: Request) {
  try {
    const { draftId, segmentIndex, viewOnly } = await request.json()
    if (!draftId || typeof segmentIndex !== 'number') {
      return NextResponse.json({ error: 'draftId og segmentIndex kreves' }, { status: 400 })
    }

    const supabase = admin()
    const { data: draft, error } = await supabase
      .from('production_drafts')
      .select('segments, ai_motion_engine, music_file, product_id')
      .eq('id', draftId)
      .single()
    if (error || !draft) return NextResponse.json({ error: 'Fant ikke utkastet' }, { status: 404 })

    const segments = draft.segments || []
    const seg = segments[segmentIndex]
    if (!seg) return NextResponse.json({ error: 'Fant ikke scenen' }, { status: 404 })
    if (!seg.image_url) return NextResponse.json({ error: 'Scenen mangler bilde' }, { status: 400 })

    const raw = seg.motion || (seg.animate === true ? 'move' : 'none')
    const motion = (seg.no_voice === true && raw === 'talk') ? 'move' : raw
    if (motion !== 'move') {
      return NextResponse.json(
        { error: 'Forhåndsvisning finnes foreløpig kun for scener med «Bevegelse». Lip-sync må lages i produksjonen.' },
        { status: 400 }
      )
    }

    const matchMusicLength = segments.some((s: any) => s.match_music === true)
    // Scenens lengde: klienten kjenner musikklengden, men serveren skal ikke
    // stole på den — send heller hold + antatt tale. Dropletens preview
    // klamrer til [3, 60] uansett.
    // MÅ være nøyaktig samme regel som produksjonen bruker — tallet inngår i
    // klippets fingeravtrykk (se lib/sceneTiming.ts)
    const holdSeconds = holdSecondsFor(seg)
    const targetSec = Math.max(5, holdSeconds + 3)

    const res = await fetch(`${DROPLET}/jobs/preview-clip`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        segment: {
          imageUrl: seg.image_url,
          motion,
          voiceoverUrl: seg.voiceover_url,
          noVoice: seg.no_voice,
          holdSeconds,
          clipNonce: seg.clip_nonce || '',
          motionStyle: seg.motion_style || 'push-in',
          motionPrompt: seg.motion_prompt || '',
          allowMouth: seg.allow_mouth === true,
        },
        engine: draft.ai_motion_engine || 'kling',
        musicFile: draft.music_file || null,
        matchMusicLength,
        segmentCount: segments.length,
        targetSec,
        viewOnly: viewOnly === true,
        // Klippet tilhoerer ARTISTEN (Lars 2/8) — lagres i produktets
        // egen mappe, ikke en anonym previews-mappe, saa det er
        // gjenfinnbart uansett hva som skjer med fingeravtrykkene
        productId: draft.product_id || null,
      }),
      signal: AbortSignal.timeout(20000),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) return NextResponse.json({ error: data.error || 'Kunne ikke starte forhåndsvisningen' }, { status: 502 })

    // Kost påløper KUN når klippet faktisk genereres — et gjenbrukt klipp
    // (reused) er gratis, som i produksjonen.
    if (!data.reused && data.status === 'generating') {
      try {
        await supabase.rpc('add_draft_cost', { p_draft_id: draftId, p_amount: COSTS_NOK.animate5s })
      } catch (costErr) {
        console.warn('[preview-motion] add_draft_cost feilet:', costErr)
      }
      // Maa ogsaa i usage_events, ellers faar white-labelen ingen andel av
      // animasjonene — det dyreste vi lager (Lars 1/8)
      try {
        const { logUsageEvent } = await import('@/lib/tenantBilling')
        logUsageEvent({ draftId, eventType: 'animation', costNok: COSTS_NOK.animate5s, meta: { kilde: 'forhaandsvisning' } })
      } catch (uErr) {
        console.warn('[preview-motion] usage-logging feilet:', uErr)
      }
    }

    return NextResponse.json({ ...data, chargedNok: data.reused ? 0 : COSTS_NOK.animate5s })
  } catch (err: any) {
    console.error('[preview-motion] POST feilet:', err?.message || err)
    return NextResponse.json({ error: 'Noe gikk galt' }, { status: 500 })
  }
}

export async function GET(request: Request) {
  const fp = new URL(request.url).searchParams.get('fp')
  if (!fp) return NextResponse.json({ error: 'fp mangler' }, { status: 400 })
  try {
    const res = await fetch(`${DROPLET}/jobs/preview-clip/${encodeURIComponent(fp)}`, {
      signal: AbortSignal.timeout(15000),
    })
    const data = await res.json().catch(() => ({}))
    return NextResponse.json(data, { status: res.ok ? 200 : res.status })
  } catch (err: any) {
    return NextResponse.json({ error: 'Kunne ikke hente status' }, { status: 502 })
  }
}
