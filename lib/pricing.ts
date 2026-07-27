import { COSTS_NOK, TIER_MULTIPLIERS, MIN_PRICE_NOK, type PriceTier } from './costs'

// Server-side prisberegning for en produksjon — regnes ALLTID fra draft-raden
// ved checkout-tid (klientens taxameter er kun veiledende og kan manipuleres).

interface DraftRow {
  segments?: Array<{
    motion?: string
    animate?: boolean
    approved?: boolean
    voiceover_url?: string
  }> | null
  cost_accumulated?: number | string | null
  ai_motion?: boolean | null
  character_id?: string | null
}

export interface PriceBreakdown {
  nok: number
  ore: number
  tier: PriceTier
  lines: Array<{ label: string; nok: number }>
}

export function computeProductionPrice(draft: DraftRow, tier: PriceTier): PriceBreakdown {
  const segments = draft.segments || []
  const mult = TIER_MULTIPLIERS[tier]

  // Grunnkost: akkumulert (bilder/voiceover underveis) — med servergulv som
  // defanger klient-tukling: hvert godkjent segment har beviselig ≥1 bilde.
  const accumulated = Number(draft.cost_accumulated) || 0
  const imageCost = draft.character_id ? COSTS_NOK.imageCharacter : COSTS_NOK.imageStandard
  const voCount = segments.filter((s) => s.voiceover_url).length
  const floor = segments.length * imageCost + voCount * COSTS_NOK.voiceoverPreview
  const base = Math.max(accumulated, floor)

  // Bevegelses-/lipsync-kost fra segmentenes valg (påløper ved produksjon)
  let moveCount = 0
  let talkCount = 0
  if (draft.ai_motion) {
    for (const s of segments) {
      const m = s.motion || (s.animate === true ? 'move' : 'none')
      if (m === 'move') moveCount++
      else if (m === 'talk') talkCount++
    }
  }
  const motionCost = moveCount * COSTS_NOK.animate5s + talkCount * COSTS_NOK.lipsyncTypical

  const lines: PriceBreakdown['lines'] = []
  if (base > 0) lines.push({ label: 'Innhold (bilder/voiceover)', nok: round2(base * mult) })
  if (moveCount > 0) lines.push({ label: `Bevegelse × ${moveCount}`, nok: round2(moveCount * COSTS_NOK.animate5s * mult) })
  if (talkCount > 0) lines.push({ label: `Lip-sync × ${talkCount}`, nok: round2(talkCount * COSTS_NOK.lipsyncTypical * mult) })

  const raw = (base + motionCost) * mult
  const nok = Math.max(round2(raw), MIN_PRICE_NOK)
  return { nok, ore: Math.round(nok * 100), tier, lines }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}
