// Hvilken aldersmodell skal brukes for en ønsket alder? (082/113)
//
// Ren modul uten database og uten importer, så regelen kan prøves for hånd
// (scripts/test-aldersvalg.mjs).
//
// 🔑 BARE MODELLER SOM DEKKER ALDEREN. Spennet er [fra, til], begge med; en
// tom ende er åpen. Finnes ingen som dekker alderen, er svaret null — ikke
// «den nærmeste». En 30-åring generert med en 45-årsmodell er ikke det
// kunden ba om, og ikke det rettighetshaveren klarerte; da skal kunden få
// vite hvilke alderstrinn som finnes, ikke få noe annet i stillhet.
//
// Flere treff: det SMALESTE spennet vinner (mest presist), deretter den med
// lavest «fra», så valget er stabilt.

export interface AldersmodellValg {
  id: string
  actorId: string
  characterId: string
  label: string
  ageFrom: number | null
  ageTo: number | null
}

export function dekkerAlder(m: Pick<AldersmodellValg, 'ageFrom' | 'ageTo'>, alder: number): boolean {
  if (m.ageFrom == null && m.ageTo == null) return false // uten spenn kan den ikke velges på alder
  return (m.ageFrom == null || alder >= m.ageFrom) && (m.ageTo == null || alder <= m.ageTo)
}

export function velgForAlder<T extends AldersmodellValg>(modeller: T[], alder: number): T | null {
  const bredde = (m: T) => (m.ageTo ?? 150) - (m.ageFrom ?? 0)
  const treff = modeller.filter((m) => dekkerAlder(m, alder))
    .sort((a, b) => bredde(a) - bredde(b) || (a.ageFrom ?? 0) - (b.ageFrom ?? 0) || a.id.localeCompare(b.id))
  return treff[0] ?? null
}

/** «30–39», «60+», «–25». Null uten spenn. */
export function spennTekst(m: Pick<AldersmodellValg, 'ageFrom' | 'ageTo'>): string | null {
  if (m.ageFrom != null && m.ageTo != null) return m.ageFrom === m.ageTo ? String(m.ageFrom) : `${m.ageFrom}–${m.ageTo}`
  if (m.ageFrom != null) return `${m.ageFrom}+`
  if (m.ageTo != null) return `–${m.ageTo}`
  return null
}

/** En alder fra en forespørsel: helt tall 0–120, ellers null (ugyldig) / undefined (ikke oppgitt). */
export function lesAlder(v: unknown): number | null | undefined {
  if (v === undefined || v === null || String(v).trim() === '') return undefined
  const n = Number(v)
  return Number.isInteger(n) && n >= 0 && n <= 120 ? n : null
}
