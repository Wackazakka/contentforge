import { createClient } from '@supabase/supabase-js'
import { getTenant } from '@/lib/tenantServer'
import { getAvailableVoiceActors } from '@/lib/voiceBank'
import { VOICES } from '@/lib/voices'

// Hvem får lage tale med en stemme? (sikkerhetsgjennomgangen 25.10.2026)
//
// 🔑 FØR DETTE VAR FORHÅNDSVISNINGEN ÅPEN FOR ALLE. /api/content/preview-voiceover
// og /api/avatar/preview-voice krevde verken innlogging eller at stemmen fantes
// i banken: hvem som helst kunne sende en hvilken som helst ElevenLabs-id og
// få tale laget med VÅR nøkkel — også i en ekte skuespillers klonede stemme,
// uten lisens, uten saldo og uten at hun fikk vite det.
//
// Regelen her er den samme for begge rutene:
//   1. Innlogget (Bearer fra Supabase-sesjonen).
//   2. Stemmen er enten en av husets innebygde stemmer (lib/voices), eller
//      tilhører en aktiv skuespiller i den banken denne døra har tilgang til
//      (egne + arvede, samme oppslag som /api/voice-actors).
//   3. Er et utkast oppgitt, må det tilhøre en organisasjon brukeren eier
//      eller er medlem av — ellers kunne kostnaden føres på andres utkast.
//
// Forhåndsvisning er med vilje uten lisens (prøvelytt, se statusdoken), men
// aldri uten identitet og aldri utenfor banken.

export type StemmeTilgang =
  | { ok: true; userId: string; tenantId: string; actorId: string | null }
  | { ok: false; status: number; error: string }

function anon() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || '', process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '')
}

function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || '', process.env.SUPABASE_SERVICE_ROLE_KEY || '')
}

export async function sjekkStemmeTilgang(request: Request, voiceId: unknown, draftId?: unknown): Promise<StemmeTilgang> {
  const auth = request.headers.get('authorization')
  if (!auth?.startsWith('Bearer ')) return { ok: false, status: 401, error: 'Logg inn for å lage forhåndsvisning' }
  const { data } = await anon().auth.getUser(auth.slice(7))
  const userId = data?.user?.id
  if (!userId) return { ok: false, status: 401, error: 'Logg inn for å lage forhåndsvisning' }

  const id = typeof voiceId === 'string' ? voiceId.trim() : ''
  if (!/^[A-Za-z0-9]{8,64}$/.test(id)) return { ok: false, status: 400, error: 'Ugyldig stemme' }

  const tenant = await getTenant()
  if (tenant.id === 'root') return { ok: false, status: 403, error: 'Ingen bank på denne adressen' }

  if (draftId != null && draftId !== '') {
    if (!(await eierUtkast(userId, String(draftId)))) {
      return { ok: false, status: 403, error: 'Utkastet tilhører ikke deg' }
    }
  }

  if (VOICES.some((v) => v.id === id)) return { ok: true, userId, tenantId: tenant.id, actorId: null }

  const aktoer = (await getAvailableVoiceActors(tenant.id))
    .find((a) => a.elevenlabs_voice_id === id && (a as { is_active?: boolean | null }).is_active !== false)
  if (!aktoer) return { ok: false, status: 403, error: 'Stemmen finnes ikke i denne banken' }
  return { ok: true, userId, tenantId: tenant.id, actorId: aktoer.id }
}

/** Eier brukeren organisasjonen bak utkastet, eller er medlem av den? */
async function eierUtkast(userId: string, draftId: string): Promise<boolean> {
  if (!/^[0-9a-f-]{36}$/i.test(draftId)) return false
  const db = admin()
  const { data: d } = await db.from('production_drafts').select('product_id').eq('id', draftId).maybeSingle()
  const productId = (d as { product_id?: string | null } | null)?.product_id
  if (!productId) return false
  const { data: p } = await db.from('products').select('organization_id').eq('id', productId).maybeSingle()
  const orgId = (p as { organization_id?: string | null } | null)?.organization_id
  if (!orgId) return false
  const { data: o } = await db.from('organizations').select('id').eq('id', orgId).eq('owner_id', userId).maybeSingle()
  if (o) return true
  const { data: m } = await db.from('organization_members').select('organization_id').eq('organization_id', orgId).eq('user_id', userId).maybeSingle()
  return !!m
}
