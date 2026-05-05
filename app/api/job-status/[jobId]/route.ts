import { NextResponse } from 'next/server'

const DROPLET_URL = 'http://139.59.212.218:3002'

export async function GET(
  request: Request,
  { params }: { params: { jobId: string } }
) {
  try {
    const res = await fetch(`${DROPLET_URL}/jobs/${params.jobId}`)
    const data = await res.json()
    return NextResponse.json(data)
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
