// Merket på en ansiktsmodell i «Medvirkende» (25.10.2026).
//
// Før viste merket bare TRENINGEN: en modell Lars hadde avvist sto som
// «✓ Klar», fordi fila var ferdig trent. Men for et menneske er spørsmålet
// ikke om fila finnes — det er om den kan brukes. Når rettighetshaveren har
// svart, er det svaret som er status.
//
// Ren modul, så regelen kan prøves for hånd (scripts/test-modellmerke.mjs).

export type Merke = { tekst: string; tone: 'ok' | 'venter' | 'stopp' }

export interface MerkeRad {
  status: 'training' | 'ready' | 'failed' | string
  approval_status?: 'not_required' | 'pending' | 'approved' | 'rejected' | string | null
  approval_sent_at?: string | null
  withdrawn_at?: string | null
}

export function modellMerke(r: MerkeRad): Merke {
  if (r.status === 'training') return { tekst: '⏳ Trener…', tone: 'venter' }
  if (r.status === 'failed') return { tekst: '✗ Feilet', tone: 'stopp' }
  // Svaret hennes går foran alt annet når modellen er ferdig.
  if (r.approval_status === 'rejected') return { tekst: '✗ Avvist', tone: 'stopp' }
  // Trukket tilbake etter et ja (088/091): fila finnes, men kan ikke brukes.
  if (r.withdrawn_at) return { tekst: '⛔ Stengt', tone: 'stopp' }
  if (r.approval_status === 'approved') return { tekst: '✓ Godkjent', tone: 'ok' }
  if (r.approval_status === 'pending') {
    // Uten utsendt e-post er prøvebildene og kvalitetsporten fortsatt i gang.
    return r.approval_sent_at ? { tekst: '⏳ Venter på svar', tone: 'venter' } : { tekst: '⏳ Sjekkes', tone: 'venter' }
  }
  // not_required (demo, eller modell av en selv) og eldre rader uten feltet.
  return { tekst: '✓ Klar', tone: 'ok' }
}
