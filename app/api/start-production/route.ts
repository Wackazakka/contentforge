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

    if (billingOn) {
      const { data: draft } = await supabase
        .from('production_drafts')
        .select('payment_status')
        .eq('id', draftId)
        .single()
      if (draft?.payment_status !== 'paid') {
        return NextResponse.json(
          { error: 'Betaling kreves før produksjon. Bruk /api/production-checkout.', code: 'PAYMENT_REQUIRED' },
          { status: 402 }
        )
      }
    } else if (userId) {
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

    if (billingOn) {
      // Konsumer betalingen — én betaling = én produksjon
      await supabase.from('production_drafts').update({ payment_status: 'consumed' }).eq('id', draftId)
    }

    return NextResponse.json({ jobId, status: 'queued' })
  } catch (err: any) {
    console.error('[start-production] Error:', err.message || String(err))
    const msg = err.message || 'Internal server error'
    const status = /godkjent|ikke funnet/i.test(msg) ? 400 : 500
    return NextResponse.json({ error: msg }, { status })
  }
}
