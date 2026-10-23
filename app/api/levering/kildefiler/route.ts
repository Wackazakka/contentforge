import { NextRequest, NextResponse } from 'next/server'
import { fyllEtterslep } from '@/lib/kildefiler'

// Etterslepet for kildefiler (110): fingeravtrykk for filer levert før
// erklæringen og hashen fantes. Kjøres for hånd etter migrasjonen, gjentatt
// til `gjenstaar` er 0 — hver fil hentes fra lagringen, så det går i porsjoner.
// Filene får fingeravtrykk, men ingen erklæring: den kan ikke gis i ettertid
// på hennes vegne (declaration null = «levert før erklæringen fantes»).

export async function POST(request: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret || request.headers.get('x-cron-secret') !== secret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    return NextResponse.json({ ok: true, ...(await fyllEtterslep(15)) })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'ukjent feil' }, { status: 500 })
  }
}
