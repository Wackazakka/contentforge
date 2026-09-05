import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// «Rediger plakatene» paa en ferdig film (Lars 5/9): kopier utkastet til et
// nytt, saa kunden kan rette tekstene og lage filmen paa nytt uten aa gaa
// gjennom sang/bilder/skjema igjen. Nytt utkast fordi et utkast med job_id
// er laast (film-checkout nekter, og produksjonen ville skrevet over jobben).
// Eierskap: produktet maa vaere synlig for brukeren (RLS).

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

export async function POST(request: Request) {
  try {
    const { draftId } = await request.json()
    if (!draftId) return NextResponse.json({ error: 'Mangler draftId' }, { status: 400 })
    const auth = request.headers.get('authorization')
    if (!auth?.startsWith('Bearer ')) return NextResponse.json({ error: 'Du må være innlogget.' }, { status: 401 })

    const admin = createClient(SUPABASE_URL, SERVICE_KEY)
    const { data: src } = await admin.from('production_drafts').select('*').eq('id', draftId).single()
    if (!src) return NextResponse.json({ error: 'Fant ikke utkastet.' }, { status: 404 })

    const asUser = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: auth } } })
    const { data: product } = await asUser.from('products').select('id').eq('id', src.product_id).maybeSingle()
    if (!product) return NextResponse.json({ error: 'Ingen tilgang til denne anledningen.' }, { status: 403 })

    const segments = (Array.isArray(src.segments) ? src.segments : []).map((s: Record<string, unknown>, i: number) => ({
      ...s, index: i, approved: true, simple_film: true,
    }))
    const { data: copy, error } = await admin
      .from('production_drafts')
      .insert({
        product_id: src.product_id,
        campaign_id: null,
        title: src.title,
        status: 'draft',
        segments,
        target_audience: src.target_audience || '',
        problem: src.problem || '',
        voice_id: src.voice_id || 'own',
        tone: src.tone || 'Vennlig',
        cta: src.cta || '',
        video_format: src.video_format || '9:16',
        music_style: src.music_style || 'Warm',
        music_file: src.music_file || null,
      })
      .select('id, title, segments, music_file')
      .single()
    if (error || !copy) throw new Error(error?.message || 'Kopien kunne ikke lagres')
    return NextResponse.json({ draftId: copy.id, title: copy.title, segments: copy.segments, musicFile: copy.music_file })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Noe gikk galt' }, { status: 500 })
  }
}
