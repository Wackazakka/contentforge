import { NextResponse } from 'next/server'
import { varsle } from '@/lib/driftsvakt'

// Driftsvakten (lib/driftsvakt, migrasjon 110). Kalles hver time fra
// dropleten med x-cron-secret = DRIFTSVAKT_SECRET. Leser saldoen der
// leverandøren har API for det og varsler Lars under grensene.
// ?test=1 sender ett prøvevarsel uansett, for å bekrefte at e-posten kommer fram.

export const runtime = 'nodejs'

const GRENSER = {
  falAdvarsel: 50, // USD
  falKritisk: 15, // USD
  elevenLabsAdvarsel: 30000, // kreditter igjen i måneden
}

async function falSaldo(): Promise<number | null> {
  const key = process.env.FAL_BILLING_KEY
  if (!key) return null
  const r = await fetch('https://api.fal.ai/v1/account/billing?expand=credits', {
    headers: { Authorization: `Key ${key}` },
    signal: AbortSignal.timeout(20000),
  })
  if (!r.ok) throw new Error(`fal ${r.status}`)
  const d = await r.json()
  const n = Number(d?.credits?.current_balance)
  return Number.isFinite(n) ? n : null
}

async function elevenLabsIgjen(): Promise<{ igjen: number; grense: number; fornyes: string | null } | null> {
  const key = process.env.ELEVENLABS_READ_KEY
  if (!key) return null
  const r = await fetch('https://api.elevenlabs.io/v1/user/subscription', {
    headers: { 'xi-api-key': key },
    signal: AbortSignal.timeout(20000),
  })
  if (!r.ok) throw new Error(`ElevenLabs ${r.status}`)
  const d = await r.json()
  const grense = Number(d?.character_limit), brukt = Number(d?.character_count)
  if (!Number.isFinite(grense) || !Number.isFinite(brukt)) return null
  const unix = Number(d?.next_character_count_reset_unix)
  return { igjen: grense - brukt, grense, fornyes: unix ? new Date(unix * 1000).toISOString().slice(0, 10) : null }
}

export async function POST(request: Request) {
  const secret = process.env.DRIFTSVAKT_SECRET
  if (!secret || request.headers.get('x-cron-secret') !== secret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const test = new URL(request.url).searchParams.get('test') === '1'
  const status: Record<string, unknown> = {}
  const sendt: string[] = []

  // fal: forhåndsbetalt — den viktigste å følge med på
  try {
    const saldo = await falSaldo()
    status.fal = saldo === null ? 'ikke satt opp' : { saldoUsd: saldo }
    if (saldo !== null && saldo < GRENSER.falAdvarsel) {
      const kritisk = saldo < GRENSER.falKritisk
      const ok = await varsle({
        nokkel: kritisk ? 'fal:kritisk' : 'fal:lav',
        kilde: 'fal',
        emne: kritisk ? `fal er nesten tom: $${saldo.toFixed(2)} igjen` : `fal-saldoen er lav: $${saldo.toFixed(2)} igjen`,
        tekst: `fal har $${saldo.toFixed(2)} igjen. fal brukes til bevegelse, lip-sync og AI-versjoner, og forbruket har vært rundt $14 om dagen for alle produktene. ${kritisk ? 'Går den tom, feiler bevegelse og lip-sync for brukerne.' : `Grensen for varsel er $${GRENSER.falAdvarsel}.`}`,
      })
      if (ok) sendt.push(kritisk ? 'fal:kritisk' : 'fal:lav')
    }
  } catch (err) {
    status.fal = { feil: err instanceof Error ? err.message : String(err) }
  }

  // ElevenLabs: månedskvote (Creator), deles av ContentForge og ReelHome
  try {
    const el = await elevenLabsIgjen()
    status.elevenlabs = el === null ? 'ikke satt opp' : el
    if (el && el.igjen < GRENSER.elevenLabsAdvarsel) {
      const ok = await varsle({
        nokkel: 'ElevenLabs:lav',
        kilde: 'ElevenLabs',
        emne: `ElevenLabs-kvoten er lav: ${el.igjen.toLocaleString('nb-NO')} kreditter igjen`,
        tekst: `ElevenLabs har ${el.igjen.toLocaleString('nb-NO')} av ${el.grense.toLocaleString('nb-NO')} kreditter igjen denne måneden${el.fornyes ? ` (fornyes ${el.fornyes})` : ''}. Går den tom, feiler AI-stemmen i PromoMaker, Isabel og ReelHome.`,
      })
      if (ok) sendt.push('ElevenLabs:lav')
    }
  } catch (err) {
    status.elevenlabs = { feil: err instanceof Error ? err.message : String(err) }
  }

  if (test) {
    const ok = await varsle({
      nokkel: `test:${Date.now()}`,
      kilde: 'driftsvakt',
      emne: 'Driftsvakten virker (prøvevarsel)',
      tekst: `Dette er et prøvevarsel. Status nå: ${JSON.stringify(status)}`,
      tving: true,
    })
    if (ok) sendt.push('test')
  }

  return NextResponse.json({ ok: true, status, sendt })
}
