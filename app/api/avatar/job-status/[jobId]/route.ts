import { NextResponse } from 'next/server'

const DROPLET_URL = 'http://139.59.212.218:3002'

// Proxy for avatar-jobbstatus (dropletens /jobs/avatar-jobs/:jobId)
export async function GET(_req: Request, { params }: { params: Promise<{ jobId: string }> }) {
  try {
    const { jobId } = await params
    const res = await fetch(`${DROPLET_URL}/jobs/avatar-jobs/${jobId}`, { cache: 'no-store' })
    const data = await res.json()
    return NextResponse.json(data)
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
