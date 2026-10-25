// E-postoppslag uten jokertegn (sikkerhetsgjennomgangen 25.10.2026).
//
// 🔑 `ilike` TOLKER `_` OG `%` SOM JOKERTEGN. Ni steder slo vi opp
// rettighetshaveren med `.ilike('actor_email', epost)` for å få
// store/små bokstaver til å telle likt. Men da matcher kontoen
// «kari_hansen@outlook.com» også raden «kari.hansen@outlook.com» — og den
// som er logget inn som den første, kunne se, levere til og laste opp
// modell for den andre. Her slipper mønsteret gjennom med bokstavene som
// bokstaver; bare ulik skrivemåte av store og små teller fortsatt likt.

export function likeSafe(s: string | null | undefined): string {
  return String(s ?? '').replace(/[\\%_]/g, (c) => '\\' + c)
}
