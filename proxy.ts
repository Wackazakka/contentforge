import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// twinledger.norditech.io er TwinLedgers egen dør (Lars 16/9). Domenet peker
// på samme Netlify-site som CenterForge; uten denne omskrivingen ville rota
// vist CenterForge-forsiden. Kun «/» skrives om — alle andre stier (login,
// dashboard, api) oppfører seg som på rot-domenet, der tenanten uansett blir
// root fordi «twinledger» ikke er en tenant-slug.
const TWINLEDGER_HOSTS = new Set(['twinledger.norditech.io', 'www.twinledger.norditech.io'])

function bareHost(request: NextRequest): string {
  const h = request.headers.get('x-forwarded-host') ?? request.headers.get('host') ?? ''
  return h.split(',')[0].trim().split(':')[0].toLowerCase()
}

export function proxy(request: NextRequest) {
  if (TWINLEDGER_HOSTS.has(bareHost(request))) {
    return NextResponse.rewrite(new URL('/twinledger', request.url))
  }
  return NextResponse.next()
}

export const config = {
  matcher: '/',
}
