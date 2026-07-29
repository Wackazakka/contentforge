import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const FAL_KEY = process.env.CONTENTFORGE_FAL_KEY

// Start trening av egen karakter: zip med bilder (R2-URL) → fal flux-lora-portrait-trainer
// (samme trener som Lawrence — bevist god ansiktslikhet). Steps/lr fra den beviste kjøringen.
export async function POST(request: Request) {
  try {
    const { name, zipUrl } = await request.json()
    if (!name?.trim() || !zipUrl) {
      return NextResponse.json({ error: 'Mangler navn eller zipUrl' }, { status: 400 })
    }
    // Sikring (2026-07-29): kun innloggede kan trene, og karakteren eies av host-tenanten
    const { getTenant } = await import('@/lib/tenantServer')
    const tenant = await getTenant()
    const auth = request.headers.get('authorization')
    if (!auth?.startsWith('Bearer ')) return NextResponse.json({ error: 'Ikke innlogget' }, { status: 401 })
    const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '')
    const { data: u } = await anon.auth.getUser(auth.slice(7))
    if (!u?.user?.id) return NextResponse.json({ error: 'Ikke innlogget' }, { status: 401 })
    if (!FAL_KEY) return NextResponse.json({ error: 'CONTENTFORGE_FAL_KEY mangler' }, { status: 500 })

    // Unikt trigger-ord, f.eks. CHRXKQZW
    const trigger = 'CHR' + Array.from({ length: 5 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ'[Math.floor(Math.random() * 24)]).join('')

    const submitRes = await fetch('https://queue.fal.run/fal-ai/flux-lora-portrait-trainer', {
      method: 'POST',
      headers: { Authorization: `Key ${FAL_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        images_data_url: zipUrl,
        trigger_phrase: trigger,
        steps: 1500,
        learning_rate: 0.0002,
      }),
    })
    const submit = await submitRes.json().catch(() => ({}))
    if (!submitRes.ok || !submit.request_id) {
      return NextResponse.json({ error: 'fal-trening feilet: ' + JSON.stringify(submit).slice(0, 200) }, { status: 502 })
    }

    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
    const { data, error } = await supabase
      .from('user_characters')
      .insert({
        name: name.trim(),
        trigger_word: trigger,
        status: 'training',
        fal_request_id: submit.request_id,
        // Eierskap: host-tenanten (uuid-guard — dev-fallback har id 'root').
        // Pre-migrasjon feiler insert på ukjente kolonner; bedre enn eierløse rader.
        ...(/^[0-9a-f-]{36}$/i.test(tenant.id) ? { owner_tenant_id: tenant.id } : {}),
        created_by: u.user.id,
      })
      .select()
      .single()
    if (error) return NextResponse.json({ error: 'DB-feil: ' + error.message }, { status: 500 })

    return NextResponse.json({ ok: true, character: data })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
