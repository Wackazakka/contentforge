import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { checkAndDeductCredits } from '@/lib/credits'
import { startProductionForDraft } from '@/lib/production'

// Tynn wrapper rundt lib/production. Med BILLING_ENABLED=true kreves betalt
// draft (payment_status='paid') — betalingen konsumeres ved kø-start så den
// ikke kan gjenbrukes. Med flagget av: gratis som før.
export async function POST(request: Request) {
  try {
    const { draftId, userId, imageStyle, includeOutroCard, outroJingle, aiMotion, aiMotionEngine } = await request.json()
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
      const { data: d2 } = await supabase.from('production_drafts').select('segments, ai_motion').eq('id', draftId).single()
      let motionNok = 0
      if (d2?.ai_motion) {
        for (const s of (d2.segments || [])) {
          const m = s.motion || (s.animate === true ? 'move' : 'none')
          if (m === 'move') motionNok += COSTS_NOK.animate5s
          else if (m === 'talk') motionNok += COSTS_NOK.lipsyncTypical
        }
      }
      logUsageEvent({ productId: draftProductId, draftId, userId: userId || null, eventType: 'video_production', costNok: motionNok, meta: { jobId } })
      // Stemmebank: royalty-hendelse hvis produksjonens stemme er en registrert skuespiller
      if (draftProductId) {
        const { getProductTenant: gpt2 } = await import('@/lib/tenantBilling')
        const { logVoiceUsage } = await import('@/lib/voiceBank')
        const pt2 = await gpt2(draftProductId)
        const { data: d3 } = await supabase.from('production_drafts').select('voice_id').eq('id', draftId).single()
        if (pt2.tenantId && d3?.voice_id) {
          logVoiceUsage({ elevenlabsVoiceId: d3.voice_id, usedByTenantId: pt2.tenantId, productId: draftProductId, draftId, jobId, meta: { kind: 'video' } })
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
