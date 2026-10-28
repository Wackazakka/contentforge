import { NextResponse } from 'next/server'
import { getTenant, getTenantCanonicalOrigin } from '@/lib/tenantServer'
import { getPublicActorByTlid, versjonSiden } from '@/lib/publicActors'
import { normaliserTlid } from '@/lib/tlid'

// Det åpne TLID-oppslaget, for maskiner: GET /api/tlid/TL-7K4M-Q2XD
//
// Svarer på det investordokumentet lover: «er denne tvillingen registrert, og
// kan den klareres?» — for en plattform, en distributør eller et
// produksjonsselskap som har fått en TLID i en kontrakt og vil sjekke den.
//
// 🔑 BARE DET GALLERIET ALLEREDE VISER (lib/publicActors). En TLID som ikke er
// publisert får samme svar som en som ikke finnes, og svaret sier «ikke i det
// åpne registeret», ikke «finnes ikke». Det er sant i begge tilfeller, og det
// lekker ingenting om hvem som er registrert hos oss.
//
// Ingen satser, ingen e-post, ingen modell-id-er — samme grense som galleriet.
// Åpent for andre domener (CORS): et offentlig oppslag skal kunne gjøres fra
// hvor som helst.

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Cache-Control': 'public, max-age=60',
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS })
}

export async function GET(_request: Request, { params }: { params: Promise<{ tlid: string }> }) {
  const { tlid: raa } = await params
  const tlid = normaliserTlid(decodeURIComponent(raa))
  if (!tlid) {
    return NextResponse.json({ error: 'Ikke en gyldig TLID. Formatet er TL-XXXX-XXXX.', registered: false }, { status: 400, headers: CORS })
  }
  const tenant = await getTenant()
  const actor = tenant.twinledger_enabled === false ? null : await getPublicActorByTlid(tenant, tlid)
  if (!actor) {
    return NextResponse.json({
      tlid, registered: false,
      message: 'Ikke i det åpne registeret. Enten finnes den ikke, eller så er profilen ikke publisert.',
    }, { status: 404, headers: CORS })
  }
  const origin = await getTenantCanonicalOrigin(tenant)
  return NextResponse.json({
    tlid,
    registered: true,
    // Eksempelprofiler er ikke ekte personer og kan ikke klareres.
    example: actor.isDemo,
    name: actor.name,
    managedBy: actor.managedBy,
    version: { current: actor.twinVersion, since: await versjonSiden(actor.id, actor.twinVersion) },
    components: { voice: actor.hasVoice, face: actor.hasFace, singing: actor.hasSinging },
    // Merking (127): en virtuell artist er ikke et menneske, og det skal stå.
    artistKind: actor.artistKind,
    clearable: !actor.isDemo && (actor.hasVoice || actor.hasFace || actor.hasSinging),
    profileUrl: `${origin}/stemme/${actor.id}`,
    requestLicenceUrl: `${origin}/dashboard/be-om-lisens/${actor.id}`,
  }, { headers: CORS })
}
