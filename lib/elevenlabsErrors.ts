/**
 * Tolkning av ElevenLabs-feil som betyr «stemmen er trukket tilbake».
 *
 * Bakgrunn (verifisert mot ekte kontoer 2026-07-30): en proff-klone ligger på
 * SKUESPILLERENS egen ElevenLabs-konto og deles til oss. Det er den eneste lovlige
 * modellen — ElevenLabs tillater kun kloning av din egen stemme. Følgen er at
 * skuespilleren kan slå delingen av når som helst, og da svarer ElevenLabs:
 *
 *   403 { detail: { status: 'voice_disabled', code: 'voice_access_denied',
 *                   message: "Voice '<id>' has been disabled by the owner." } }
 *
 * Dette er altså en NORMAL forretningshendelse, ikke en driftsfeil, og må aldri
 * vises som «noe gikk galt». Uten privat oppsigelsestid skjer det uten forvarsel.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

export const VOICE_WITHDRAWN = 'VOICE_WITHDRAWN' as const

/** Meldingen kunden skal se. Ingen teknikk, ingen skyld på systemet. */
export const VOICE_WITHDRAWN_MESSAGE =
  'Skuespilleren har trukket tilbake stemmen sin, og den kan ikke lenger brukes. ' +
  'Velg en annen stemme, eller ta kontakt med oss for å finne en erstatning.'

/**
 * Er denne ElevenLabs-responsen en tilbaketrekking?
 * Tar teksten på feilen fordi kallstedene allerede leser den for logging.
 */
export function isVoiceWithdrawn(status: number, body: string): boolean {
  if (status !== 401 && status !== 403) return false
  // Vi matcher på flere markører fordi bare status-strengen er kontraktfestet i
  // praksis; message-teksten kan endres uten forvarsel.
  return /voice_disabled|voice_access_denied|disabled by the owner/i.test(body)
}

/**
 * Merker skuespilleren inaktiv så stemmen forsvinner fra menyer og gateway
 * umiddelbart, i stedet for å feile på nytt for neste kunde.
 * Svelger egne feil: en mislykket deaktivering skal ikke skjule hovedårsaken.
 */
export async function deactivateWithdrawnActor(
  db: SupabaseClient,
  where: { actorId?: string; elevenlabsVoiceId?: string }
): Promise<void> {
  try {
    // Kun is_active — voice_actors har ingen årsakskolonne i dag. Årsaken logges
    // her i stedet; en `inactive_reason`-kolonne er en naturlig oppfølging.
    let q = db.from('voice_actors').update({ is_active: false })
    if (where.actorId) q = q.eq('id', where.actorId)
    else if (where.elevenlabsVoiceId) q = q.eq('elevenlabs_voice_id', where.elevenlabsVoiceId)
    else return
    const { error } = await q
    if (error) throw error
    console.warn('[voiceBank] deaktiverte tilbaketrukket stemme:', JSON.stringify(where))
  } catch (e) {
    console.error('[elevenlabsErrors] kunne ikke deaktivere tilbaketrukket stemme:', e)
  }
}
