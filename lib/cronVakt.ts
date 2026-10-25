import { timingSafeEqual } from 'crypto'
import { NextResponse } from 'next/server'

// Vakt for ruter som bare våre egne jobber skal kalle (25.10.2026).
//
// Før: «mangler hemmeligheten i miljøet, slipp alle inn» — og hemmeligheten
// ble også godtatt som `?secret=` i adressen, der den havner i logger. Nå:
//   - mangler hemmeligheten, nektes ALT (503), aldri «alle inn»
//   - bare headeren `x-cron-secret`
//   - sammenlignet i konstant tid, så svartiden ikke lekker hvor mange tegn
//     som stemte
export function cronVakt(request: Request | undefined, envNavn = 'CRON_SECRET'): NextResponse | null {
  const hemmelighet = process.env[envNavn] || ''
  if (!hemmelighet) return NextResponse.json({ error: `${envNavn} er ikke satt` }, { status: 503 })
  const gitt = request?.headers.get('x-cron-secret') || ''
  const a = Buffer.from(gitt), b = Buffer.from(hemmelighet)
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return null
}
