import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// TwinLedgers egne dører. Domenene peker på samme Netlify-site som CenterForge;
// uten denne omskrivingen ville rota vist CenterForge-forsiden. Kun «/» skrives
// om — alle andre stier (login, dashboard, api) oppfører seg som ellers.
//
// twinledger.ai er hoveddøra fra 20.09.2026 (Lars). norditech-verten blir
// stående: gamle lenker, delte auditionrunder og e-poster peker dit, og en
// destinasjon som svarer 404 på egne lenker er verre enn to dører.
//
// ⚠️ Tenant-oppslaget skjer et ANNET sted (lib/tenantServer, via
// tenants.custom_domain). Denne lista styrer bare hva «/» viser. Legger du til
// et domene her uten å sette custom_domain, får du TwinLedger-forsiden i
// CenterForge-drakt — og motsatt: setter du custom_domain uten å legge domenet
// her, får du riktig drakt men feil forside.
const TWINLEDGER_HOSTS = new Set([
  'twinledger.ai', 'www.twinledger.ai',
  'twinledger.norditech.io', 'www.twinledger.norditech.io',
])

function bareHost(request: NextRequest): string {
  const h = request.headers.get('x-forwarded-host') ?? request.headers.get('host') ?? ''
  return h.split(',')[0].trim().split(':')[0].toLowerCase()
}

export function proxy(request: NextRequest) {
  const vert = bareHost(request)

  // www -> apex, for ROTA. Undersidene tas av regelen i netlify.toml, men
  // den kan ikke ta rota:
  //
  // 🔑 REKKEFØLGEN. Denne omskrivingen kjører FØR Netlifys redirect-motor.
  // Uten dette ville «/» først blitt skrevet om til «/twinledger», og
  // toml-regelen ville sendt brukeren til «https://twinledger.ai/twinledger»
  // — en intern sti ingen skal se. Derfor må rota redirectes her, før
  // omskrivingen, og ikke i toml.
  if (vert.startsWith('www.')) {
    const apex = vert.slice(4)
    if (TWINLEDGER_HOSTS.has(apex)) {
      const url = new URL(request.url)
      url.host = apex
      url.protocol = 'https:'
      url.port = ''
      return NextResponse.redirect(url, 301)
    }
  }

  if (TWINLEDGER_HOSTS.has(vert)) {
    return NextResponse.rewrite(new URL('/twinledger', request.url))
  }
  return NextResponse.next()
}

export const config = {
  matcher: '/',
}
