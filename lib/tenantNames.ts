/**
 * Navnereglene for en tenant, ett sted.
 *
 * En tenant har to navn som ikke alltid er det samme:
 *   app_name     — SELSKAPET (IndigoBoom). Avsenderen: bunntekst, stemmesøknader.
 *   product_name — TJENESTEN (PromoMaker). Fanetittel, innlogging, merkekort.
 *
 * Er product_name tomt, er de samme navnet — som for alle tenants unntatt
 * IndigoBoom i dag. Derfor endrer dette ingenting for de andre.
 */

type Navn = { app_name?: string | null; product_name?: string | null }

/** Tjenestens navn. Faller tilbake til selskapsnavnet når de er like. */
export function produktnavn(t: Navn): string {
  return (t.product_name || '').trim() || (t.app_name || '').trim()
}

/**
 * Teksten på merkekortet — det 2-sekunders kortet etter artistens sluttplakat.
 *
 * Formelen er «<selskap> <produkt>»: «IndigoBoom PromoMaker».
 *
 * Ordet «VideoMaker» sto tidligere HARDKODET her, likt for alle seks
 * white-labels, så IndigoBoom kunne ikke bytte det uten å ødelegge de andre.
 * Standardverdien holder dem uendret.
 *
 * Dublett-vernet (Lars 3/8) står ved lag: heter selskapet allerede
 * «Isabel's VideoMaker», skal produktnavnet ikke legges på en gang til.
 */
export function merkekortTekst(t: Navn): string {
  const selskap = (t.app_name || '').trim()
  const produkt = (t.product_name || '').trim() || 'VideoMaker'
  if (!selskap) return produkt
  return selskap.toLowerCase().includes(produkt.toLowerCase()) ? selskap : `${selskap} ${produkt}`
}
