import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { checkAndDeductCredits } from '@/lib/credits'
import { startProductionForDraft } from '@/lib/production'

// Tynn wrapper rundt lib/production. Med BILLING_ENABLED=true kreves betalt
// draft (payment_status='paid') — betalingen konsumeres ved kø-start så den
// ikke kan gjenbrukes. Med flagget av: gratis som før.
export async function POST(request: Request) {
  try {
    const { draftId, userId, imageStyle, includeOutroCard, outroJingle, aiMotion, aiMotionEngine, character } = await request.json()
    if (!draftId) return NextResponse.json({ error: 'Missing draftId' }, { status: 400 })

    const billingOn = process.env.BILLING_ENABLED === 'true'
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL || '',
      process.env.SUPABASE_SERVICE_ROLE_KEY || ''
    )

    // Invoice-tenants (white-label) betaler aldri per produksjon — bruken
    // logges i usage_events og faktureres partneren månedlig.
    let invoiceTenant = false
    let draftProductId: string | null = null
    {
      const { data: d } = await supabase
        .from('production_drafts')
        .select('product_id, payment_status, segments, ai_motion')
        .eq('id', draftId)
        .single()
      draftProductId = d?.product_id ?? null
      if (draftProductId) {
        const { getProductTenant, getPartnerBalance, getOrgBalance } = await import('@/lib/tenantBilling')
        const pt = await getProductTenant(draftProductId)
        invoiceTenant = pt.billingMode === 'invoice'
        // Forskuddsmodell: partner-tenants må ha positiv saldo (null = ingen
        // topups registrert ennå → ubegrenset i innkjøringsfasen)
        if (invoiceTenant && pt.tenantId) {
          const balance = await getPartnerBalance(pt.tenantId)
          if (balance !== null && balance <= 0) {
            return NextResponse.json(
              { error: 'Kontoen har ikke flere produksjonskreditter. Kontakt administratoren deres for påfyll.', code: 'PARTNER_BALANCE_EMPTY' },
              { status: 402 }
            )
          }
          // Sluttkundens egen forskuddskonto (org_topups) — sperres kun hvis
          // tenanten har opprettet en konto for organisasjonen (null = etterskudd)
          if (pt.organizationId) {
            const orgBalance = await getOrgBalance(pt.organizationId)
            if (orgBalance !== null && orgBalance <= 0) {
              return NextResponse.json(
                { error: 'Kontoen deres er tom. Kjøp mer kreditt for å fortsette å produsere.', code: 'ORG_BALANCE_EMPTY' },
                { status: 402 }
              )
            }
          }
        }
      }

      if (billingOn && !invoiceTenant) {
        if (d?.payment_status !== 'paid') {
          return NextResponse.json(
            { error: 'Betaling kreves før produksjon. Bruk /api/production-checkout.', code: 'PAYMENT_REQUIRED' },
            { status: 402 }
          )
        }
      }
    }

    if (billingOn && !invoiceTenant) {
      // gate håndtert over
    } else if (!invoiceTenant && userId) {
      // Legacy kreditt-sti (kun når billing er av)
      const credit = await checkAndDeductCredits(userId, 'video_generation', `Videoproduksjon — draft ${draftId}`)
      if (!credit.ok) {
        return NextResponse.json({ error: credit.error }, { status: 402 })
      }
    }

    const { jobId } = await startProductionForDraft(draftId, {
      imageStyle,
      includeOutroCard,
      outroJingle,
      aiMotion,
      aiMotionEngine,
    })

    if (billingOn && !invoiceTenant) {
      // Konsumer betalingen — én betaling = én produksjon
      await supabase.from('production_drafts').update({ payment_status: 'consumed' }).eq('id', draftId)
    }

    // Tenant-måling: bevegelses-/lipsync-kost påløper ved produksjonsstart
    try {
      const { logUsageEvent } = await import('@/lib/tenantBilling')
      const { COSTS_NOK } = await import('@/lib/costs')
      const { data: d2 } = await supabase.from('production_drafts').select('segments, ai_motion, ai_motion_engine, music_file').eq('id', draftId).single()
      let motionNok = 0
      if (d2?.ai_motion) {
        const segs = d2.segments || []
        // Gjenbruk (31/7): scener som ligger klare i dropletens klipp-cache
        // belastes IKKE — bare det som faktisk maa genereres koster.
        let reusable: boolean[] = []
        try {
          const rc = await fetch('http://139.59.212.218:3002/jobs/reuse-check', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              engine: d2.ai_motion_engine || 'kling',
              musicFile: d2.music_file || null,
              matchMusicLength: segs.some((s: any) => s.match_music === true),
              segments: segs.map((s: any) => ({
                imageUrl: s.image_url,
                motion: s.motion,
                animate: s.animate,
                voiceoverUrl: s.voiceover_url,
                noVoice: s.no_voice,
                holdSeconds: s.hold_seconds,
                clipNonce: s.clip_nonce || '',
                motionStyle: s.motion_style || 'push-in',
                motionPrompt: s.motion_prompt || '',
                allowMouth: s.allow_mouth === true,
              })),
            }),
            signal: AbortSignal.timeout(5000),
          })
          if (rc.ok) reusable = (await rc.json()).reusable || []
        } catch { /* uten svar belastes alt som foer */ }
        segs.forEach((s: any, i: number) => {
          if (reusable[i]) return
          const raw = s.motion || (s.animate === true ? 'move' : 'none')
          const m = (s.no_voice === true && raw === 'talk') ? 'move' : raw
          if (m === 'move') motionNok += COSTS_NOK.animate5s
          else if (m === 'talk') motionNok += COSTS_NOK.lipsyncTypical
        })
      }

      // Merkekort mot rabatt (Lars 1/8): tenanten gir fra seg HALVE paaslaget
      // sitt mot at filmen avsluttes med kortet deres. Rabatten tas altsaa av
      // white-labelens andel — ContentForge faar sitt uansett.
      //
      // ⚠️ ANTI-JUKS: rabattbeloepet huskes paa utkastet. Produseres samme
      // utkast SENERE uten kortet, legges beloepet til — ellers kunne man
      // valgt rabatt, produsert, og saa produsert en ren film nesten gratis
      // via klipp-gjenbruken (som gjoer runde to nesten kostnadsfri).
      try {
        const { data: d4 } = await supabase
          .from('production_drafts')
          .select('brand_card, brand_discount_nok')
          .eq('id', draftId)
          .single()
        const tidligereRabatt = Number(d4?.brand_discount_nok) || 0
        if (d4?.brand_card === true) {
          // Halve white-label-andelen: (kundepris − engros) / 2
          const { chainFactorByTenantId, getProductTenant: gpt3 } = await import('@/lib/tenantBilling')
          const pt3 = draftProductId ? await gpt3(draftProductId) : { tenantId: null as string | null }
          const faktor = pt3.tenantId ? await chainFactorByTenantId(pt3.tenantId) : 1
          const wlAndel = Math.max(0, motionNok * (faktor - 1))
          const rabatt = Math.round(wlAndel * 50) / 100 // halvparten, 2 desimaler
          if (rabatt > 0) {
            await supabase.from('production_drafts')
              .update({ brand_discount_nok: tidligereRabatt + rabatt })
              .eq('id', draftId)
            motionNok = Math.max(0, motionNok - rabatt)
          }
        } else if (tidligereRabatt > 0) {
          // Kortet er fjernet etter en rabattert produksjon → kreves inn
          motionNok += tidligereRabatt
          await supabase.from('production_drafts')
            .update({ brand_discount_nok: 0 })
            .eq('id', draftId)
          console.log(`[start-production] merkerabatt paa ${tidligereRabatt} kr kreves inn (kortet fjernet)`)
        }
      } catch (bErr) {
        console.warn('[start-production] merkerabatt hoppet over:', bErr)
      }
      logUsageEvent({ productId: draftProductId, draftId, userId: userId || null, eventType: 'video_production', costNok: motionNok, meta: { jobId } })
      // Stemmebank: royalty-hendelser hvis produksjonen bruker en registrert
      // skuespillers stemme og/eller ansikt (LoRA-karakter)
      if (draftProductId) {
        const { getProductTenant: gpt2 } = await import('@/lib/tenantBilling')
        const { logVoiceUsage, logFaceUsage } = await import('@/lib/voiceBank')
        const pt2 = await gpt2(draftProductId)
        const { data: d3 } = await supabase.from('production_drafts').select('voice_id, character_id').eq('id', draftId).single()
        // awaites: et uavventet lofte kan bli avlivet naar svaret returneres,
        // og royalty-raden forsvinner da uten feilmelding. Begge funksjonene
        // feiler stille internt, saa ventingen koster oss ingenting.
        if (pt2.tenantId && d3?.voice_id) {
          await logVoiceUsage({ elevenlabsVoiceId: d3.voice_id, usedByTenantId: pt2.tenantId, organizationId: pt2.organizationId, productId: draftProductId, draftId, jobId, meta: { kind: 'video' } })
        }
        // Karakteren kommer fra body i gratis-stien og fra draft-kolonnen i betalings-stien
        const charId = character || d3?.character_id
        if (pt2.tenantId && charId) {
          await logFaceUsage({ characterId: charId, usedByTenantId: pt2.tenantId, organizationId: pt2.organizationId, productId: draftProductId, draftId, jobId })
        }
      }
    } catch { /* måling velter aldri produksjon */ }

    return NextResponse.json({ jobId, status: 'queued' })
  } catch (err: any) {
    console.error('[start-production] Error:', err.message || String(err))
    const msg = err.message || 'Internal server error'
    const status = /godkjent|ikke funnet/i.test(msg) ? 400 : 500
    return NextResponse.json({ error: msg }, { status })
  }
}
