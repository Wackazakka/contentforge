// Hviletiden en scene skal ha — ÉN kilde, brukt både av produksjonen og av
// «Se animasjonen».
//
// Hvorfor det måtte flyttes hit (Lars 3/8): tallet inngår i klippets
// fingeravtrykk. Produksjonen ga stille scener 5 sekunder når artisten ikke
// hadde satt noe selv; forhåndsvisningen ga dem 0. Dermed fikk de to hver sitt
// fingeravtrykk, og filmen brukte ALDRI klippet artisten nettopp hadde sett på
// — den bestilte en ny take hos Kling, som er ikke-deterministisk og gjerne
// beveger kameraet annerledes. Artisten godkjente én animasjon og fikk en
// annen, og betalte for begge.
//
// Endres regelen, må den endres her — ikke to steder som kan gli fra hverandre.

export interface SceneTimingInput {
  hold_seconds?: number | string | null
  no_voice?: boolean | null
}

export function holdSecondsFor(seg: SceneTimingInput): number {
  const egen = Number(seg?.hold_seconds)
  if (egen > 0) return egen
  // Stille scene uten egen verdi: uten hviletid ville den vart 0,4 sekunder.
  return seg?.no_voice === true ? 5 : 0
}
