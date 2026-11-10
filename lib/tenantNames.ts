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

/**
 * Rettighetsbanken — TwinLedger-modusen (130, 10.11.2026).
 *
 * Fram til 130 var «er dette TwinLedger?» spurt som `slug === 'twinledger'`
 * femten steder: sidemenyen, lisensporten, hovedboken, prissiden, den
 * firkantede innloggingen. Artistbanken er en KOPI av TwinLedger for
 * sangere — samme hovedbok, samme lisensport, egen tenant — og skal svare ja
 * på det samme spørsmålet, uten at femten steder må kjenne enda en slug.
 *
 * 🔑 Én kilde: en tenant er rettighetsbank når den ER TwinLedger, eller når
 * den er en artistbank (`artists_only`). Et annet flagg senere legges til HER.
 */
export type Rettighetsbank = { slug?: string | null; artists_only?: boolean | null }

/** TwinLedger-modus: hovedbok, lisensport, sidemeny, firkantet drakt. */
export function erRettighetsbank(t: Rettighetsbank | null | undefined): boolean {
  return !!t && (t.slug === 'twinledger' || t.artists_only === true)
}

/** Artistbanken: bare sangere (ekte og virtuelle), ingen tale, utseende valgfritt. */
export function erArtistbank(t: Rettighetsbank | null | undefined): boolean {
  return !!t && t.artists_only === true
}

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
/**
 * Fullt navn: «<selskap> <produkt>» når tjenesten har eget navn
 * («IndigoBoom PromoMaker»), ellers bare selskapet («CenterForge»,
 * «Isabel's VideoMaker»). Som merkekortTekst, men UTEN «VideoMaker»-
 * reserven — brukes i tekst, f.eks. velkomsten på dashbordet (Lars 21.10).
 */
export function fulltNavn(t: Navn): string {
  const selskap = (t.app_name || '').trim()
  const produkt = (t.product_name || '').trim()
  if (!produkt) return selskap
  if (!selskap) return produkt
  return selskap.toLowerCase().includes(produkt.toLowerCase()) ? selskap : `${selskap} ${produkt}`
}

export function merkekortTekst(t: Navn): string {
  const selskap = (t.app_name || '').trim()
  const produkt = (t.product_name || '').trim() || 'VideoMaker'
  if (!selskap) return produkt
  return selskap.toLowerCase().includes(produkt.toLowerCase()) ? selskap : `${selskap} ${produkt}`
}
