import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const FAL_KEY = process.env.CONTENTFORGE_FAL_KEY

// Liste over egne karakterer. «Lazy» status-oppdatering: for rader under trening
// sjekkes fal-køen, og lora_url lagres når treningen er ferdig (~6 min).
export async function GET() {
  try {
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
    const { data: rows, error } = await supabase
      .from('user_characters')
      .select('*')
      .order('created_at', { ascending: false })
    if (error) return NextResponse.json({ error: error.message, characters: [] }, { status: 500 })

    const auth = { Authorization: `Key ${FAL_KEY}` }
    for (const row of rows || []) {
      if (row.status !== 'training' || !row.fal_request_id) continue
      try {
        const st = await fetch(
          `https://queue.fal.run/fal-ai/flux-lora-portrait-trainer/requests/${row.fal_request_id}/status`,
          { headers: auth }
        ).then((r) => r.json())
        if (st.status === 'COMPLETED') {
          const result = await fetch(
            `https://queue.fal.run/fal-ai/flux-lora-portrait-trainer/requests/${row.fal_request_id}`,
            { headers: auth }
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
