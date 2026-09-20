import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getTenant } from '@/lib/tenantServer'
import { getAvailableVoiceActors, getDemoVoiceActors, ratesForKind, actorHasVoice, actorHasFace } from '@/lib/voiceBank'

// Kundens katalog (Lars 17/9): alle stemmer og ansikter den innloggede kunden
// FAKTISK kan bruke på dette domenet, med pris per bruk.
//
// Forskjellen fra det offentlige galleriet (/stemmer, lib/publicActors.ts):
//   galleriet — bare publiserte visittkort, ingen priser (hvem som spør er ukjent)
//   katalogen — alt kunden får velge mellom i verktøyet, med kundens egne priser
// Tilgangsregelen er getAvailableVoiceActors — den samme editoren bruker — så
// listen her er nøyaktig det som dukker opp i stemmemenyen.
//
// Krever innlogging. Sender kundepris (× kjedens påslag), aldri skuespillerens
// sats, e-post eller LoRA-id. voiceId sendes fordi editoren trenger den for å
// forhåndsvelge stemmen — samme felt /api/voice-actors allerede gir innloggede.

const KINDS = ['video', 'avatar', 'radio'] as const

export async function GET(request: Request) {
  try {
    const auth = request.headers.get('authorization')
    if (!auth?.startsWith('Bearer ')) return NextResponse.json({ error: 'Ikke innlogget' }, { status: 401 })
    const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || '', process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '')
    const { data: u } = await sb.auth.getUser(auth.slice(7))
    if (!u?.user) return NextResponse.json({ error: 'Ikke innlogget' }, { status: 401 })

    const tenant = await getTenant()
    if (tenant.id === 'root' || tenant.twinledger_enabled === false) {
      return NextResponse.json({ tenant: { name: tenant.app_name }, actors: [] })
    }

    const pf = Number(tenant.price_multiplier) || 1
    const pris = (n: number) => Math.round(n * pf * 100) / 100
    // Demorader kommer MED i katalogen, men merket og uten voiceId — de skal
    // kunne SES (en katalog med én oppføring viser ikke hvordan en katalog ser
    // ut) og ikke VELGES inn i en produksjon.
    const [ekte, demo] = await Promise.all([
      getAvailableVoiceActors(tenant.id),
      getDemoVoiceActors(tenant.id),
    ])
    const actors = [...ekte, ...demo]
    const erDemo = new Set(demo.map((a) => a.id))

    return NextResponse.json({
      tenant: { name: tenant.app_name },
      actors: actors.map((a) => {
        const x = a as typeof a & { bio?: string | null; photo_urls?: unknown; sample_urls?: unknown; is_public?: boolean }
        const hasVoice = actorHasVoice(a)
        const hasFace = actorHasFace(a)
        const egne = Array.isArray(x.sample_urls) ? (x.sample_urls as unknown[]).map(String) : []
        const prices: Record<string, number> = {}
        if (hasVoice) for (const k of KINDS) prices[k] = pris(ratesForKind(a, k).price)
        if (hasFace) prices.face = pris(ratesForKind(a, 'face').price)
        return {
          id: a.id,
          name: a.name,
          bio: x.bio ?? null,
          photo: Array.isArray(x.photo_urls) ? (String((x.photo_urls as unknown[])[0] ?? '') || null) : null,
          sample: egne[0] ?? a.preview_url ?? null,
          hasVoice,
          hasFace,
          isDemo: erDemo.has(a.id),
          // Uten voiceId kan editoren ikke forhåndsvelge stemmen — det er
          // sperren, ikke en deaktivert knapp som ser aktiv ut.
          voiceId: hasVoice && !erDemo.has(a.id) ? a.elevenlabs_voice_id : null,
          // Visittkortet finnes bare for publiserte — ellers ville lenken gi «finnes ikke».
          hasCard: x.is_public === true,
          prices,
        }
      }),
    })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Ukjent feil' }, { status: 500 })
  }
}
