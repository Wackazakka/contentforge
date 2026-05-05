import { NextResponse } from 'next/server'

const DROPLET_URL = 'http://139.59.212.218:3002'

export async function GET() {
  try {
    const res = await fetch(`${DROPLET_URL}/music`)
    const data = await res.json()
    return NextResponse.json(data)
  } catch (err: any) {
    return NextResponse.json({ files: [], error: err.message }, { status: 500 })
  }
}
