import { NextResponse, NextRequest } from 'next/server'

const DROPLET_URL = 'http://139.59.212.218:3002'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const { jobId } = await params
    const res = await fetch(`${DROPLET_URL}/videos/${jobId}/output.mp4`)
    const buffer = await res.arrayBuffer()
    return new NextResponse(buffer, {
      headers: {
        'Content-Type': 'video/mp4',
        'Content-Disposition': 'inline',
      },
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
