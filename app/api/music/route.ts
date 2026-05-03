import { NextResponse } from 'next/server'

const DROPLET_URL = 'http://139.59.212.218:3002'

export async function GET() {
  try {
    const res = await fetch(`${DROPLET_URL}/music`)
    if (!res.ok) {
      return NextResponse.json({ error: 'Failed to fetch music library', files: [] }, { status: res.status })
    }
    const data = await res.json()
    return NextResponse.json(data)
  } catch (err) {
    console.error('[api/music] Error fetching music library:', err)
    return NextResponse.json({ error: 'Failed to fetch music library', files: [] }, { status: 500 })
  }
}
