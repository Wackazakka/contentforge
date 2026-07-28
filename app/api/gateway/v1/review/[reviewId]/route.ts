import { NextResponse } from 'next/server'
import { authenticateKey, admin } from '@/lib/gateway'
import { decideApproval, logApprovedDelivery } from '@/lib/approvals'

// GET /api/gateway/v1/review/{reviewId} — kunden poller en ventende godkjenning.
// Frist-logikken er LAT: er fristen passert og skuespilleren taus, godkjennes
// bruken atomisk her (decided_via='timeout') — ingen cron nødvendig.
export async function GET(request: Request, { params }: { params: Promise<{ reviewId: string }> }) {
  const auth = await authenticateKey(request)
  if (!auth) return NextResponse.json({ error: 'Ugyldig eller manglende API-nøkkel' }, { status: 401 })
  const { reviewId } = await params

  const { data: row } = await admin()
    .from('usage_approvals')
    .select('*')
    .eq('id', reviewId)
    .eq('organization_id', auth.organizationId) // kun egne godkjenninger
    .single()
  if (!row) return NextResponse.json({ error: 'Ukjent godkjenning' }, { status: 404 })

  if (row.status === 'pending' && new Date(row.expires_at) <= new Date()) {
    // Fristen er ute uten svar → automatisk godkjent (avtalt med skuespilleren).
    // decideApproval er atomisk — bare ÉN poller/beslutning vinner overgangen.
    const won = await decideApproval({ id: row.id }, 'approved', 'timeout')
    if (won) await logApprovedDelivery(won)
    row.status = 'approved'
    row.decided_via = won ? 'timeout' : row.decided_via
  }

  if (row.status === 'approved') {
    return NextResponse.json({ status: 'approved', url: row.content_url, charged_nok: Number(row.customer_price_nok) })
  }
  if (row.status === 'rejected') {
    return NextResponse.json({ status: 'rejected', reason: 'Skuespilleren avviste denne bruken. Ingen belastning.' })
  }
  return NextResponse.json({ status: 'pending', expiresAt: row.expires_at })
}
