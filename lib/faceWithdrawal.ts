import { createClient } from '@supabase/supabase-js'

// Av-bryteren på ansiktet (migrasjon 088).
//
// 🔑 HVORFOR DENNE FILA FINNES. En proff-klone av STEMMEN ligger på
// skuespillerens egen ElevenLabs-konto og deles til oss. Slår hen delingen av,
// svarer ElevenLabs `403 voice_disabled` og bruken stopper — uten at vi gjør
// noe. ANSIKTET har ingen slik bryter: LoRA-en er en fil vi holder hos fal.
// «Du kan trekke ansiktet tilbake» var derfor et løfte vi holdt, ikke en
// mekanisme skuespilleren kunne betjene. For et produkt som selger klarering
// er det feil sted å ha et løfte.
//
// 🔑 ÉN PORT, IKKE TRE. Tre veier genererer ansikt — gatewayens /image,
// auditionfilmen og bildegenereringen i appen — og alle tre slo opp
// `user_characters` hver for seg. En bryter kopiert tre steder er en bryter
// som før eller siden bare virker to. Her er oppslaget felles, og en fjerde
// vei må gjennom den for i det hele tatt å få tak i LoRA-en.
//
// Speiler `lib/elevenlabsErrors.ts` med vilje: samme kategori hendelse, samme
// slags melding til kunden. En tilbaketrekking er en NORMAL forretnings-
// hendelse, ikke en driftsfeil, og skal aldri vises som «noe gikk galt».

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
  )
}

export const FACE_WITHDRAWN = 'FACE_WITHDRAWN' as const
export const FACE_AWAITING_APPROVAL = 'FACE_AWAITING_APPROVAL' as const

/**
 * Meldingen når modellen venter på personens eget ja (091).
 *
 * 🔑 EGEN KODE OG EGEN TEKST, IKKE «trukket tilbake». De to er ulike ting:
 * tilbaketrekking er noen som har ombestemt seg, dette er noen som ennå ikke
 * er spurt ferdig. Slår man dem sammen, får den som venter beskjed om at noen
 * har sagt nei — og det er feil om et menneske.
 */
export const FACE_AWAITING_MESSAGE =
  'Ansiktsmodellen venter på at rettighetshaveren skal godkjenne den. ' +
  'Den kan ikke brukes før hen har sett prøvebildene og sagt ja.'

export class AnsiktVenterPaaGodkjenning extends Error {
  readonly code = FACE_AWAITING_APPROVAL
  constructor() {
    super(FACE_AWAITING_MESSAGE)
    this.name = 'AnsiktVenterPaaGodkjenning'
  }
}

/** Meldingen kunden skal se. Ingen teknikk, ingen skyld på systemet. */
export const FACE_WITHDRAWN_MESSAGE =
  'Rettighetshaveren har trukket tilbake ansiktet sitt, og det kan ikke lenger brukes. ' +
  'Velg et annet ansikt, eller ta kontakt med oss for å finne en erstatning.'

export class AnsiktTrukketTilbake extends Error {
  readonly code = FACE_WITHDRAWN
  constructor() {
    super(FACE_WITHDRAWN_MESSAGE)
    this.name = 'AnsiktTrukketTilbake'
  }
}

export interface Ansiktsmodell {
  triggerWord: string
  loraUrl: string
  name: string | null
}

/**
 * Hent en ansiktsmodell som SKAL genereres med.
 *
 * Kaster `AnsiktTrukketTilbake` når retten er stengt, og vanlig Error når
 * modellen ikke er ferdig. De to er ulike ting: det første er et menneske som
 * har ombestemt seg, det andre er en jobb som ikke er kjørt.
 *
 * ⚠️ Kaster også ved oppslagsfeil. Motsatt av hjemmelsoppslaget i
 * `licenceMatch`, som med vilje slipper gjennom ved feil: der er et hull i
 * hovedboken bedre enn en tapt rad. Her er det omvendt — genererer vi et
 * ansikt vi ikke fikk bekreftet at vi har lov til, kan det ikke gjøres om.
 */
export async function hentAnsiktForGenerering(characterId: string): Promise<Ansiktsmodell> {
  const { data, error } = await admin()
    .from('user_characters')
    .select('name, trigger_word, lora_url, status, withdrawn_at, approval_status')
    .eq('id', characterId)
    .maybeSingle()

  if (error) throw new Error(`Ansiktsoppslaget feilet: ${error.message}`)
  if (!data) throw new Error('Ansiktet finnes ikke')
  if (data.withdrawn_at) throw new AnsiktTrukketTilbake()

  // 🔑 GODKJENNINGEN (091) SLÅR GJENNOM FØR «ER MODELLEN KLAR». En ferdig
  // trent LoRA av en annen person er nettopp den som IKKE skal kunne brukes
  // før hen har sett prøvebildene. Rekkefølgen her er hele porten.
  //
  // `rejected` behandles som en tilbaketrekking utad: hen har sagt nei, og
  // kunden trenger ikke vite om det var før eller etter at modellen ble laget.
  if (data.approval_status === 'pending') throw new AnsiktVenterPaaGodkjenning()
  if (data.approval_status === 'rejected') throw new AnsiktTrukketTilbake()

  if (data.status !== 'ready' || !data.lora_url) throw new Error('Ansiktet er ikke klart (LoRA mangler)')

  return {
    triggerWord: String(data.trigger_word || ''),
    loraUrl: String(data.lora_url),
    name: (data.name as string | null) ?? null,
  }
}

/**
 * Samme oppslag, men UTEN godkjenningssjekken.
 *
 * ⚠️ DEN ENE BEVISSTE OMVEIEN RUNDT PORTEN, og den finnes av en grunn som
 * ikke kan løses på annen måte: prøvebildene personen skal godkjenne, må
 * lages MED modellen hen ennå ikke har godkjent. Uten dette unntaket blir
 * godkjenningen umulig å innhente — hen skulle sett noe som ikke kan lages.
 *
 * 🔑 TILBAKETREKKING GJELDER FORTSATT. Har hen sagt nei én gang, lages det
 * ingen nye prøvebilder heller. Unntaket er for den som ikke har svart ennå,
 * aldri for den som har svart.
 *
 * Kalles KUN av ruta som lager godkjenningsprøver. Kommer det et annet
 * kallsted, er det nesten helt sikkert feil.
 */
export async function hentAnsiktForProeve(characterId: string): Promise<Ansiktsmodell> {
  const { data, error } = await admin()
    .from('user_characters')
    .select('name, trigger_word, lora_url, status, withdrawn_at, approval_status')
    .eq('id', characterId)
    .maybeSingle()

  if (error) throw new Error(`Ansiktsoppslaget feilet: ${error.message}`)
  if (!data) throw new Error('Ansiktet finnes ikke')
  if (data.withdrawn_at) throw new AnsiktTrukketTilbake()
  if (data.approval_status === 'rejected') throw new AnsiktTrukketTilbake()
  if (data.status !== 'ready' || !data.lora_url) throw new Error('Ansiktet er ikke klart (LoRA mangler)')

  return {
    triggerWord: String(data.trigger_word || ''),
    loraUrl: String(data.lora_url),
    name: (data.name as string | null) ?? null,
  }
}

/**
 * Hvilke av disse ansiktene er trukket tilbake?
 *
 * For LISTEVEIENE — bank, galleri, plukkere. Et tilbaketrukket ansikt skal
 * ikke stå og se valgbart ut: den som velger det får en feil hen ikke kunne
 * forutse, og rettighetshaveren står fortsatt i hylla som om hen var
 * tilgjengelig.
 *
 * Tolerant med vilje: feiler oppslaget, returneres et tomt sett. En liste som
 * ikke kommer opp er verre enn en liste som viser ett ansikt for mye — og
 * PORTEN står uansett i `hentAnsiktForGenerering`, som ikke er tolerant.
 */
export async function trukketTilbake(characterIds: Array<string | null | undefined>): Promise<Set<string>> {
  const ids = [...new Set(characterIds.filter((x): x is string => !!x && !!String(x).trim()))]
  if (ids.length === 0) return new Set()
  try {
    const { data } = await admin()
      .from('user_characters')
      .select('id')
      .in('id', ids)
      .not('withdrawn_at', 'is', null)
    return new Set((data || []).map((r) => String(r.id)))
  } catch {
    return new Set()
  }
}
