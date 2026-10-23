// TLID (migrasjon 111): tvillingens permanente, lesbare referanse.
// Formatet lages i databasen (generer_tlid); her bare gjenkjenning og
// normalisering, så en TLID kan brukes der en id ellers kreves — i API-et,
// i en kontrakt, lest opp i telefonen.

/** Alfabetet uten tegn som kan forveksles: ingen 0/O, 1/I/L, U. */
const ALFABET = '23456789ABCDEFGHJKMNPQRSTVWXYZ'
const MOENSTER = new RegExp(`^TL-[${ALFABET}]{4}-[${ALFABET}]{4}$`)

/**
 * «tl 7k4m q2xd», «TL7K4MQ2XD» og «TL-7K4M-Q2XD/ansikt» blir «TL-7K4M-Q2XD».
 * Null når det ikke er en TLID.
 */
export function normaliserTlid(raa: string | null | undefined): string | null {
  if (!raa) return null
  const ren = String(raa).toUpperCase().split('/')[0].replace(/[^A-Z0-9]/g, '')
  if (!ren.startsWith('TL') || ren.length !== 10) return null
  const kandidat = `TL-${ren.slice(2, 6)}-${ren.slice(6, 10)}`
  return MOENSTER.test(kandidat) ? kandidat : null
}

/** En komponent av tvillingen: «TL-7K4M-Q2XD/ansikt». */
export function komponentRef(tlid: string, komponent: 'stemme' | 'ansikt'): string {
  return `${tlid}/${komponent}`
}
