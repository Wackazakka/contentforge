import { NextResponse } from 'next/server'
import { getTenant } from '@/lib/tenantServer'
import { admin, issueCode, partnerForTenant } from '@/lib/partnerSso'

// Innlogget bruker → engangskode → partnerens /sso-landing. Kun på tenanten som eier partneren.
export async function POST(request: Request) {
  const tenant = await getTenant()
  const partner = partnerForTenant(tenant.slug)
  if (!partner) return NextResponse.json({ error: 'Partner-innlogging er ikke aktivert her' }, { status: 404 })
  const auth = request.headers.get('authorization') || ''
  if (!auth.startsWith('Bearer ')) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data: u, error } = await admin().auth.getUser(auth.slice(7))
  if (error || !u?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const code = await issueCode(u.user, partner.id)
    const next = new URL(request.url).searchParams.get('next')
    const safeNext = next && next.startsWith('/') && !next.startsWith('//') ? `&next=${encodeURIComponent(next)}` : ''
    return NextResponse.json({ url: `${partner.url}/sso?code=${code}${safeNext}`, partner: partner.name })
  } catch (e) {
    console.error('[partner/sso/start]', e instanceof Error ? e.message : e)
    return NextResponse.json({ error: 'Kunne ikke starte overleveringen' }, { status: 500 })
  }
}
