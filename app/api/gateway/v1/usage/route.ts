import { NextResponse } from 'next/server'
import { authenticateKey, admin } from '@/lib/gateway'
import { getOrgBalance } from '@/lib/tenantBilling'

// GET /api/gateway/v1/usage — kundens eget forbruk via gatewayen + saldo.
export async function GET(request: Request) {
  const auth = await authenticateKey(request)
  if (!auth) return NextResponse.json({ error: 'Ugyldig eller manglende API-nøkkel' }, { status: 401 })

  const monthStart = new Date()
  monthStart.setUTCDate(1)
  monthStart.setUTCHours(0, 0, 0, 0)

  const { data: events } = await admin()
    .from('voice_usage_events')
    .select('actor_id, customer_price_nok, asset_type, meta, created_at')
    .eq('used_by_tenant_id', auth.tenantId)
    .gte('created_at', monthStart.toISOString())
    .order('created_at', { ascending: false })
    .limit(500)

  // Kun denne kundens gateway-bruk
  const mine = (events || []).filter(
    (e) => e.meta?.source === 'gateway' && e.meta?.organization_id === auth.organizationId
  )
  const spent = mine.reduce((s, e) => s + Number(e.customer_price_nok), 0)
  const balance = await getOrgBalance(auth.organizationId)

  return NextResponse.json({
    month: monthStart.toISOString().slice(0, 7),
    uses: mine.length,
    spent_nok: Math.round(spent * 100) / 100,
    balance_nok: balance,
  })
}
