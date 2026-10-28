import { NextResponse } from 'next/server'
import { authenticateKey, resolveAsset } from '@/lib/gateway'
import { kjoepStandardLisens, kundensLisenser, lesValg, standardTilbud } from '@/lib/standardLisensServer'
import { STANDARD_VILKAAR_TEKST } from '@/lib/standardLisens'

// Lisenser gjennom API-et (128).
//
//   GET  /api/gateway/v1/licences                 kundens lisenser, og standardvilkårene
//   GET  /api/gateway/v1/licences?assetId=…&asset=…&mediaClass=…&territory=…&termMonths=…
//                                                 prisen på en standardlisens, uten å kjøpe
//   POST /api/gateway/v1/licences  { assetId, asset, mediaClass, territory, termMonths,
//                                    productionTitle?, acceptTerms: true, lang?: 'no'|'en' }
//        → standardlisens med en gang, trukket fra saldoen
//
// Bare det rettighetshaveren har forhåndsgodkjent (lib/standardLisens). Alt
// annet — verk, eksklusivitet, kjente navn — er en forespørsel på
// requestLicenceUrl, som før.
//
// 🔑 VILKÅRENE GODTAS EKSPLISITT. acceptTerms: true, og teksten for språket
// fryses på lisensen. Uten det kjøpes ingenting.

export async function GET(request: Request) {
  const auth = await authenticateKey(request)
  if (!auth) return NextResponse.json({ error: 'Ugyldig eller manglende API-nøkkel' }, { status: 401 })
  const p = new URL(request.url).searchParams
  const assetId = p.get('assetId')
  if (assetId) {
    const actor = await resolveAsset(auth, assetId)
    if (!actor) return NextResponse.json({ error: 'Ukjent asset, eller ikke tilgjengelig for denne kontoen' }, { status: 404 })
    const t = await standardTilbud(actor.id, lesValg(Object.fromEntries(p.entries())))
    return NextResponse.json({ assetId: actor.id, tlid: actor.tlid ?? null, available: t.available, reason: t.reason, priceNok: t.priceNok, standardTerms: t.terms, termsText: t.termsText })
  }
  return NextResponse.json({ licences: await kundensLisenser(auth.organizationId), termsText: STANDARD_VILKAAR_TEKST })
}

export async function POST(request: Request) {
  try {
    const auth = await authenticateKey(request)
    if (!auth) return NextResponse.json({ error: 'Ugyldig eller manglende API-nøkkel' }, { status: 401 })
    const b = await request.json().catch(() => ({}))
    if (b.acceptTerms !== true) {
      return NextResponse.json({
        error: 'Standardvilkårene må godtas: send acceptTerms: true. Teksten står i termsText.',
        code: 'TERMS_REQUIRED', termsText: STANDARD_VILKAAR_TEKST,
      }, { status: 400 })
    }
    const actor = await resolveAsset(auth, String(b.assetId || ''))
    if (!actor) return NextResponse.json({ error: 'Ukjent asset, eller ikke tilgjengelig for denne kontoen' }, { status: 404 })
    const svar = await kjoepStandardLisens({
      actorId: actor.id, organizationId: auth.organizationId, hvem: `api:${auth.keyId}`,
      valg: lesValg({ ...b, kind: 'campaign' }),
      productionTitle: b.productionTitle ? String(b.productionTitle) : null,
      termsText: STANDARD_VILKAAR_TEKST[b.lang === 'en' ? 'en' : 'no'], via: 'api',
    })
    if (!svar.ok) return NextResponse.json({ error: svar.error, code: svar.code }, { status: svar.status })
    return NextResponse.json(svar, { status: 201 })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Ukjent feil' }, { status: 500 })
  }
}
