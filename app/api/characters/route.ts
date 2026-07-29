import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const FAL_KEY = process.env.CONTENTFORGE_FAL_KEY

// Liste over egne karakterer. «Lazy» status-oppdatering: for rader under trening
// sjekkes fal-køen, og lora_url lagres når treningen er ferdig (~6 min).
export async function GET(request: Request) {
  try {
    // Sikring (2026-07-29): krever innlogging og viser KUN host-tenantens egne
    // karakterer — trente ansikter er rettighetsobjekter, ikke felleseie.
    const { getTenant } = await import('@/lib/tenantServer')
    const tenant = await getTenant()
    const auth = request.headers.get('authorization')
    if (!auth?.startsWith('Bearer ')) return NextResponse.json({ characters: [] }, { status: 401 })
    const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '')
    const { data: u } = await anon.auth.getUser(auth.slice(7))
    if (!u?.user?.id) return NextResponse.json({ characters: [] }, { status: 401 })

    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
    const { data: rows, error } = await supabase
      .from('user_characters')
      .select('*')
      .eq('owner_tenant_id', tenant.id)
      .order('created_at', { ascending: false })
    // Defensivt: owner-kolonnen mangler (migrasjon ikke kjørt) → TOM liste, aldri alle
    if (error) return NextResponse.json({ characters: [], migrated: false })

    const falAuth = { Authorization: `Key ${FAL_KEY}` }
    for (const row of rows || []) {
      if (row.status !== 'training' || !row.fal_request_id) continue
      try {
        const st = await fetch(
          `https://queue.fal.run/fal-ai/flux-lora-portrait-trainer/requests/${row.fal_request_id}/status`,
          { headers: falAuth }
        ).then((r) => r.json())
        if (st.status === 'COMPLETED') {
          const result = await fetch(
            `https://queue.fal.run/fal-ai/flux-lora-portrait-trainer/requests/${row.fal_request_id}`,
            { headers: falAuth }
          ).then((r) => r.json())
          const url = result?.diffusers_lora_file?.url
          if (url) {
            await supabase.from('user_characters').update({ lora_url: url, status: 'ready' }).eq('id', row.id)
            row.lora_url = url
            row.status = 'ready'
          }
        } else if (st.status === 'FAILED' || st.status === 'ERROR') {
          await supabase.from('user_characters').update({ status: 'failed' }).eq('id', row.id)
          row.status = 'failed'
        }
      } catch { /* behold 'training' til neste poll */ }
    }

    return NextResponse.json({ characters: rows || [] })
  } catch (err: any) {
    return NextResponse.json({ error: err.message, characters: [] }, { status: 500 })
  }
}
