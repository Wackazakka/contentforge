import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getTenant } from '@/lib/tenantServer'
import { isTenantAdmin } from '@/lib/voiceBank'
import { eierSti } from '@/lib/levering'

// Adminens side av leveringen: signerte lenker til det hun har lastet opp.
//
// 🔑 EGEN RUTE FORDI AUTENTISERINGEN ER EN ANNEN — samme grunn som
// /api/stemmeopptak/admin. Soekersida kjenner henne paa tokenet; her er det
// en innlogget admin. De to maa ikke kunne forveksles.
//
// Lenkene lever i ti minutter, som i 094. Ingen permanent leseadresse finnes;
// det er hele poenget med at boettene er private.

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  )
}

const LEVETID_SEK = 600

export async function GET(request: Request) {
  try {
    const tenant = await getTenant()
    if (tenant.id === 'root') return NextResponse.json({ error: 'Tenant-oppsett mangler' }, { status: 404 })
    const auth = request.headers.get('authorization')
    if (!auth?.startsWith('Bearer ')) return NextResponse.json({ error: 'Ikke innlogget' }, { status: 401 })
    const { data: u } = await admin().auth.getUser(auth.slice(7))
    const epost = u?.user?.email ?? null
    if (!epost || !(await isTenantAdmin(epost, tenant.id))) {
      return NextResponse.json({ error: 'Ingen admin-tilgang' }, { status: 403 })
    }

    const applicationId = new URL(request.url).searchParams.get('applicationId') || ''
    const { data: s } = await admin()
      .from('voice_actor_applications')
      .select('id, tenant_id, delivery_token, photo_paths, recording_paths, delivered_at')
      .eq('id', applicationId)
      .eq('tenant_id', tenant.id)
      .maybeSingle()
    if (!s) return NextResponse.json({ error: 'Søknaden finnes ikke i denne banken' }, { status: 404 })

    const signer = async (boette: string, stier: unknown) => {
      const liste = (Array.isArray(stier) ? stier : []).filter((p): p is string => eierSti(s.id, String(p)))
      if (liste.length === 0) return []
      const { data } = await admin().storage.from(boette).createSignedUrls(liste, LEVETID_SEK)
      return (data || []).map((d, i) => ({ path: liste[i], navn: liste[i].split('/').pop(), url: d.signedUrl || null }))
    }
    const vert = tenant.custom_domain ? `https://${tenant.custom_domain}` : `https://${tenant.slug}.norditech.io`
    return NextResponse.json({
      lenke: s.delivery_token ? `${vert}/levering/${s.delivery_token}` : null,
      bilder: await signer('training-sets', s.photo_paths),
      opptak: await signer('voice-recordings', s.recording_paths),
      deliveredAt: s.delivered_at,
      levetidSek: LEVETID_SEK,
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
