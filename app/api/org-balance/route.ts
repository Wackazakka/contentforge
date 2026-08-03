import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getOrgBalance } from '@/lib/tenantBilling'

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
  )
}

// Innlogget brukers forskuddssaldo (organisasjonens konto). balance:null =
// ingen forskuddskonto opprettet — da vises ingen saldo i taxameteret.
export async function GET(request: Request) {
  try {
    const auth = request.headers.get('authorization')
    if (!auth?.startsWith('Bearer ')) return NextResponse.json({ balance: null })
    const supabase = admin()
    const { data } = await supabase.auth.getUser(auth.slice(7))
    const userId = data?.user?.id
    if (!userId) return NextResponse.json({ balance: null })
    // Saldoen skal gjelde organisasjonen paa DETTE domenet, ikke brukerens
    // eldste (3/8) - ellers viser Isabels side CenterForge-saldoen
    const { getTenant } = await import('@/lib/tenantServer')
    const vert = await getTenant()
    const { data: orgs } = await supabase
      .from('organizations')
      .select('id, tenant_id')
      .eq('owner_id', userId)
      .order('created_at', { ascending: true })
    const liste = orgs || []
    const org = (vert.id && vert.id !== 'root' ? liste.find((o: any) => o.tenant_id === vert.id) : null) ?? liste[0] ?? null
    if (!org) return NextResponse.json({ balance: null })
    const balance = await getOrgBalance(org.id)
    return NextResponse.json({ balance })
  } catch {
    return NextResponse.json({ balance: null })
  }
}
