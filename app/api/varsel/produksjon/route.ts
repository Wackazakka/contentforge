import { NextResponse } from 'next/server'
import { cronVakt } from '@/lib/cronVakt'
import { varsleProduksjon } from '@/lib/produksjonsvarsel'

// Feilvarsel fra dropleten (Lars 4.11.2026): «det skal ikke være tilfeldige
// sjekker som avslører at noe henger». Dropleten kaller hit med en gang en
// film feiler, går ut på tid eller blir hengende, og når en låtimport feiler.
// Selve logikken (merking av utkast + e-post) ligger i lib/produksjonsvarsel.
//
// Body: { type: 'film' | 'import' | 'publisering', steg, feil, jobId?, productId?, filnavn?, merk? }

export const runtime = 'nodejs'

export async function POST(request: Request) {
  const stopp = cronVakt(request, 'RENDER_VARSEL_SECRET')
  if (stopp) return stopp

  const b = await request.json().catch(() => ({}))
  const r = await varsleProduksjon(b)
  return NextResponse.json(r, { status: r.ok ? 200 : 502 })
}
