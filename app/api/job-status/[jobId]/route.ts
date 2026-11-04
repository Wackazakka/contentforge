import { NextResponse, NextRequest } from 'next/server'
import { admin } from '@/lib/velkomst'

const DROPLET_URL = 'http://139.59.212.218:3002'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const { jobId } = await params
    const res = await fetch(`${DROPLET_URL}/jobs/${jobId}`)
    const data = await res.json()
    // Dropleten husker jobber bare i minnet. Etter en omstart svarer den
    // 'not_found', og statussiden spant for alltid (4.11). Da avgjoer
    // databasen: levert film = done, utkast merket av feilvarselet = failed.
    if (data?.status === 'not_found') {
      const sb = admin()
      const { data: video } = await sb.from('asset_banks').select('asset_url').eq('job_id', jobId).eq('asset_type', 'video').limit(1).maybeSingle()
      if (video?.asset_url) return NextResponse.json({ jobId, status: 'done', videoUrl: video.asset_url })
      const { data: draft } = await sb.from('production_drafts').select('status').eq('job_id', jobId).maybeSingle()
      if (draft?.status === 'failed') {
        return NextResponse.json({ jobId, status: 'failed', error: 'Filmen kunne ikke lages. Vi har fått beskjed og ser på det.' })
      }
    }
    return NextResponse.json(data)
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
