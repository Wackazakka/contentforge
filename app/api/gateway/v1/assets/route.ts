import { NextResponse } from 'next/server'
import { authenticateKey, customerPriceFor, kreverLisens, lisensOrigin } from '@/lib/gateway'
import { getAvailableVoiceActors } from '@/lib/voiceBank'

// GET /api/gateway/v1/assets
// Stemmer/ansikter kunden kan bruke — kun VÅRE asset-ID-er og navn, aldri de
// underliggende ElevenLabs-/LoRA-ID-ene.
export async function GET(request: Request) {
  const auth = await authenticateKey(request)
  if (!auth) return NextResponse.json({ error: 'Ugyldig eller manglende API-nøkkel' }, { status: 401 })

  const actors = await getAvailableVoiceActors(auth.tenantId)
  // Alderstrinnene (082) per ansikt, så kunden vet hvilke `age` som virker på
  // /image. Bare etikett og spenn — aldri modell-id-en bak.
  const { brukbareAldersmodeller } = await import('@/lib/ageModels')
  const alder = await brukbareAldersmodeller(actors.filter((a) => a.face_character_id).map((a) => a.id))
  const assets = await Promise.all(
    actors.map(async (a) => {
      // Capabilities per aktivum: en rad kan være stemme, ansikt eller begge
      const capabilities: string[] = []
      const pricePerUse: Record<string, number> = {}
      if (a.elevenlabs_voice_id) {
        capabilities.push('speech')
        pricePerUse.speech = await customerPriceFor(auth, a, 'speech')
      }
      if (a.face_character_id) {
        capabilities.push('image')
        pricePerUse.image = await customerPriceFor(auth, a, 'face')
      }
      const ageModels = alder.filter((m) => m.actorId === a.id).map((m) => ({ label: m.label, ageFrom: m.ageFrom, ageTo: m.ageTo }))
      // Lisensen (28.10): kunden skal se FØR kallet hva som er klarert, og
      // hvor man ber om resten. Samme dom som /speech og /image feller.
      const kreves = await kreverLisens(auth, a)
      const licence: Record<string, unknown> = { required: kreves }
      if (kreves) {
        const { finnLisensFor } = await import('@/lib/licenceMatch')
        const { lisensLenke, assetFor } = await import('@/lib/lisensLenke')
        for (const [cap, type] of [['speech', 'voice'], ['image', 'face']] as const) {
          if (!capabilities.includes(cap)) continue
          const h = await finnLisensFor({ actorId: a.id, organizationId: auth.organizationId, assetType: type })
          licence[cap] = { licensed: h.match === 'inferred', match: h.match }
        }
        const base = await lisensOrigin()
        licence.requestLicenceUrl = `${base}${lisensLenke(a.id, { asset: assetFor({ hasVoice: !!a.elevenlabs_voice_id, hasFace: !!a.face_character_id }) })}`
      }
      return { id: a.id, tlid: a.tlid ?? null, name: a.name, capabilities, pricePerUse, licence, ...(ageModels.length ? { ageModels } : {}) }
    })
  )
  return NextResponse.json({ assets })
}
