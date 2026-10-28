// Lenken til «Be om lisens» (090/124) — én kilde for alle stedene den står.
//
// 🔑 PÅ TWINLEDGER ER LISENSEN KLARERINGEN. Kunden skal kunne be om den der hen
// møter skuespilleren: på profilen, i Stemmer-fanen og etter en audition — ikke
// bare via en liten TLID-lenke. Andre tenanter klarerer gjennom pris per bruk
// og royalty (se components/LisensertStemme), og der vises ikke knappen.

export type LisensType = 'campaign' | 'work'
export type LisensAsset = 'voice' | 'face' | 'both'

/** Gjelder lisensporten her? Samme regel som studioet (LisensertStemme). */
export const lisensErKlareringen = (tenantSlug: string | null | undefined) => tenantSlug === 'twinledger'

/** Hva lisensen naturlig gjelder, ut fra hva skuespilleren tilbyr. */
export function assetFor(o: { hasVoice?: boolean; hasFace?: boolean }): LisensAsset {
  if (o.hasVoice && o.hasFace) return 'both'
  return o.hasFace ? 'face' : 'voice'
}

/**
 * /dashboard/be-om-lisens/<id>, med det vi alt vet fylt inn: produksjonens
 * navn (fra en audition), type og hva lisensen gjelder. Skjemaet kan endres.
 */
export function lisensLenke(actorId: string, opts: { tittel?: string | null; type?: LisensType; asset?: LisensAsset } = {}): string {
  const q = new URLSearchParams()
  const tittel = (opts.tittel || '').trim()
  if (tittel) q.set('tittel', tittel.slice(0, 200))
  if (opts.type) q.set('type', opts.type)
  if (opts.asset) q.set('asset', opts.asset)
  const s = q.toString()
  return `/dashboard/be-om-lisens/${encodeURIComponent(actorId)}${s ? `?${s}` : ''}`
}
