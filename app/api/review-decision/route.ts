import { NextResponse } from 'next/server'
import { decideApproval, logApprovedDelivery } from '@/lib/approvals'

// Skuespillerens beslutning fra godkjenningssiden. Tokenet ER autorisasjonen
// (magisk lenke sendt til skuespillerens e-post) — ingen innlogging nødvendig.
// Atomisk: bare første beslutning (skuespiller eller frist) vinner.
export async function POST(request: Request) {
  try {
    const { token, decision } = await request.json()
    if (!token || !['approved', 'rejected'].includes(decision)) {
      return NextResponse.json({ error: 'Ugyldig forespørsel' }, { status: 400 })
    }
    const row = await decideApproval({ token }, decision, 'actor')
    if (!row) {
      return NextResponse.json({ error: 'Denne godkjenningen er allerede avgjort eller finnes ikke.' }, { status: 409 })
    }
    if (decision === 'approved') await logApprovedDelivery(row)
    return NextResponse.json({ ok: true, decision })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
