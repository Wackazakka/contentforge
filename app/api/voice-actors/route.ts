import { NextResponse } from 'next/server'
import { getTenant } from '@/lib/tenantServer'
import { getAvailableVoiceActors } from '@/lib/voiceBank'

// Stemmebanken for gjeldende tenant (host-basert): egne + arvede skuespillerstemmer.
// Prisen som eksponeres er kundeprisen × tenantens kjede-faktor (utpris).
export async function GET() {
  try {
    const tenant = await getTenant()
    if (tenant.id === 'root') {
      // Fallback-tenant (tabell mangler) → tom bank
      return NextResponse.json({ voices: [] })
    }
    const actors = await getAvailableVoiceActors(tenant.id)
    const pf = Number(tenant.price_multiplier) || 1
    return NextResponse.json({
      voices: actors.map((a) => ({
        id: a.id,
        name: a.name,
        voiceId: a.elevenlabs_voice_id,
        pricePerUseNok: Math.round(a.customer_price_nok * pf * 100) / 100,
        previewUrl: a.preview_url,
      })),
    })
  } catch (err: any) {
    return NextResponse.json({ voices: [], error: err.message })
  }
}
