import { NextResponse } from 'next/server'

const DROPLET_URL = 'http://139.59.212.218:3002'

// Miksing av 2-5 låter kan ta litt tid på lange filer
export const maxDuration = 60

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const res = await fetch(`${DROPLET_URL}/music/medley`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch (err) {
    console.error('[api/music/medley] Error:', err)
    return NextResponse.json({ error: 'Medley feilet' }, { status: 500 })
  }
}
