import { NextResponse } from 'next/server'
import { cronVakt } from '@/lib/cronVakt'
import { admin } from '@/lib/velkomst'

// Vakt for Netlifys cron-publish (Lars 4.11.2026). Dropleten spør hvert 10.
// min; rader i scheduled_publications som er mer enn 10 min forsinket betyr
// at den planlagte funksjonen har stoppet. Ruten bare LESER — dropleten
// varsler (én gang per rad, via /api/varsel/produksjon) og publiserer aldri.

export const runtime = 'nodejs'

const GRENSE_MIN = 10

export async function GET(request: Request) {
  const stopp = cronVakt(request, 'RENDER_VARSEL_SECRET')
  if (stopp) return stopp

  const grense = new Date(Date.now() - GRENSE_MIN * 60 * 1000).toISOString()
  const { data, error } = await admin()
    .from('scheduled_publications')
    .select('id, platform, content_type, scheduled_at, production_id')
    .lte('scheduled_at', grense)
    .order('scheduled_at', { ascending: true })
    .limit(50)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const forfalte = (data || []).map((r) => ({
    id: r.id,
    platform: r.platform,
    contentType: r.content_type,
    productId: r.production_id,
    planlagt: new Date(r.scheduled_at).toLocaleString('nb-NO', { timeZone: 'Europe/Oslo', dateStyle: 'short', timeStyle: 'short' }),
    minutterForsinket: Math.round((Date.now() - new Date(r.scheduled_at).getTime()) / 60000),
  }))
  return NextResponse.json({ forfalte })
}
