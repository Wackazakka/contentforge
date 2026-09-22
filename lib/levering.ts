// Leveringssiden — det som er FELLES for soekersida og adminen, og som ikke
// skal kunne drifte fra hverandre: hva som kreves, og om det er levert.
//
// Ren funksjon uten database, av samme grunn som licenceMath: «er hun ferdig?»
// avgjoer om koeen viser henne som klar, og det skal kunne etterproeves uten aa
// roere prod.

export const MIN_BILDER = 10
export const ANBEFALT_BILDER = '15–25'
export const MAKS_BILDER = 30
/** Supabase Storage sin globale grense for prosjektet (verifisert 22.09). */
export const MAKS_FIL_MB = 50

export const BILDE_TYPER: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp',
}
/** Rausere enn skjemaet var: dette er «det hun har liggende», ikke en proeve. */
export const LYD_TYPER: Record<string, string> = {
  'audio/mpeg': 'mp3', 'audio/mp3': 'mp3',
  'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/wave': 'wav',
  'audio/x-m4a': 'm4a', 'audio/mp4': 'm4a', 'audio/aac': 'aac',
  'audio/flac': 'flac', 'audio/x-flac': 'flac',
  'audio/webm': 'webm', 'audio/ogg': 'ogg',
  'audio/aiff': 'aiff', 'audio/x-aiff': 'aiff',
}

export interface LeveringsKrav {
  wantsFace: boolean
  offersVoice: boolean
  hasOwnRecording: boolean | null
}

export interface LeveringsStatus {
  /** Om siden i det hele tatt har noe aa be om. */
  trengerBilder: boolean
  trengerOpptak: boolean
  /** Opptaket tas sammen senere — siden sier det, ber ikke om noe. */
  venterVeiledetOpptak: boolean
  bilderOk: boolean
  opptakOk: boolean
  /** Alt som kreves er paa plass. */
  ferdig: boolean
}

export function leveringsStatus(krav: LeveringsKrav, antallBilder: number, antallOpptak: number): LeveringsStatus {
  const trengerBilder = krav.wantsFace
  const trengerOpptak = krav.offersVoice && krav.hasOwnRecording === true
  const venterVeiledetOpptak = krav.offersVoice && krav.hasOwnRecording !== true
  const bilderOk = !trengerBilder || antallBilder >= MIN_BILDER
  const opptakOk = !trengerOpptak || antallOpptak >= 1
  return {
    trengerBilder, trengerOpptak, venterVeiledetOpptak, bilderOk, opptakOk,
    // Er det ingenting aa levere, er hun «ferdig» fra foerste sekund — og da
    // skal hun heller ikke faa noen lenke (se apply-ruta).
    ferdig: bilderOk && opptakOk,
  }
}

/** Stien en fil skal ligge paa. Prefikset er eierskapet: ruta godtar aldri en
 *  sti utenfor soeknadens egen mappe, uansett hva klienten sender. */
export function leveringsSti(applicationId: string, kind: 'photo' | 'recording', ext: string): string {
  const navn = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
  return `applications/${applicationId}/${kind}-${navn}`
}

export function eierSti(applicationId: string, sti: string): boolean {
  return typeof sti === 'string' && sti.startsWith(`applications/${applicationId}/`) && !sti.includes('..')
}
