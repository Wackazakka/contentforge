import { NextRequest, NextResponse } from 'next/server'
import { innloggetBruker } from '@/lib/innlogget'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const { jobId } = await params
    // 🔑 Bare egne jobber (25.10). Før holdt det at headeren FANTES — hvem
    // som helst kunne slette en hvilken som helst jobb.
    const bruker = await innloggetBruker(request)
    if (!bruker) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    })

    const { error } = await supabase
      .from('production_jobs')
      .delete()
      .eq('id', jobId)
      .eq('created_by', bruker.id)

    if (error) throw error

    return NextResponse.json({ deleted: jobId })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Error' }, { status: 500 })
  }
}
