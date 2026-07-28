import { NextResponse } from 'next/server'
import { authenticateKey, customerPriceFor } from '@/lib/gateway'
import { getAvailableVoiceActors } from '@/lib/voiceBank'

// GET /api/gateway/v1/assets
// Stemmer/ansikter kunden kan bruke — kun VÅRE asset-ID-er og navn, aldri de
// underliggende ElevenLabs-/LoRA-ID-ene.
export async function GET(request: Request) {
  const auth = await authenticateKey(request)
  if (!auth) return NextResponse.json({ error: 'Ugyldig eller manglende API-nøkkel' }, { status: 401 })

  const actors = await getAvailableVoiceActors(auth.tenantId)
  const assets = await Promise.all(
    actors.map(async (a) => {
      const capabilities: string[] = ['speech']
      if (a.face_character_id) capabilities.push('image')
      const pricePerUse: Record<string, number> = { speech: await customerPriceFor(auth, a, 'speech') }
      if (a.face_character_id) pricePerUse.image = await customerPriceFor(auth, a, 'face')
      return { id: a.id, name: a.name, capabilities, pricePerUse }
    })
  )
  return NextResponse.json({ assets })
}
