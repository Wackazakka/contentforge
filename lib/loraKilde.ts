import { createClient } from '@supabase/supabase-js'

// Hvor fal skal hente LoRA-vektene fra, i det øyeblikket det genereres.
//
// Modeller vi trener, ligger hos fal (en adresse vi fikk tilbake). En modell
// rettighetshaveren laster opp selv (23.10), ligger i den PRIVATE bøtta — og
// skal ikke ha en permanent adresse: user_characters.lora_url lagrer da
// «sb://<bøtte>/<sti>», og en signert lenke lages når fal trenger den.
//
// 🔑 SEKS TIMER, IKKE TI MINUTTER. fal henter fila når jobben starter, og
// jobben kan stå i kø. Utløper lenken før det, feiler genereringen.

export const LAGRET_PREFIKS = 'sb://'

export function erLagretIBoette(lora: string | null | undefined): boolean {
  return !!lora && lora.startsWith(LAGRET_PREFIKS)
}

export async function loraUrlForGenerering(lagret: string): Promise<string> {
  if (!erLagretIBoette(lagret)) return lagret
  const rest = lagret.slice(LAGRET_PREFIKS.length)
  const skille = rest.indexOf('/')
  const boette = rest.slice(0, skille), sti = rest.slice(skille + 1)
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || '', process.env.SUPABASE_SERVICE_ROLE_KEY || '')
  const { data, error } = await db.storage.from(boette).createSignedUrl(sti, 6 * 3600)
  if (error || !data?.signedUrl) throw new Error(`Fant ikke modellfila (${error?.message || 'ukjent'})`)
  return data.signedUrl
}
