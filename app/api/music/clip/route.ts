import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { tracksFolder } from '@/lib/musicLibrary'

// Utsnitt av kundens egen sang (Standard Ropert, 4/9): filmen skal vaere 30
// eller 60 sekunder selv om sangen er tre minutter. Dropleten lager
// tracks-<productId>/klipp-<sek>-<navn>.mp3 med uttoning; utkastet bruker
// den fila som music_file, saa «film = musikkens lengde» gir riktig lengde.
// Eierskap: kun laater i produktets egen mappe, og kun for eieren (RLS).

const DROPLET_URL = 'http://139.59.212.218:3002'
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

export async function POST(request: Request) {
  try {
    const { productId, filename, clipSec, startSec } = await request.json()
    if (!productId || !filename) return NextResponse.json({ error: 'Mangler produkt eller fil' }, { status: 400 })
    const folder = tracksFolder(productId)
    // Egen sang, eller et spor fra det delte biblioteket (5/9: lengdevalget
    // gjelder ogsaa biblioteksmusikk). Klippet lagres alltid i produktets mappe.
    const fn = String(filename)
    if (!fn.startsWith(folder + '/') && !fn.startsWith('celebration/')) {
      return NextResponse.json({ error: 'Bare egne sanger og biblioteksmusikk kan klippes' }, { status: 400 })
    }
    const auth = request.headers.get('authorization')
    if (!auth?.startsWith('Bearer ')) return NextResponse.json({ error: 'Du må være innlogget.' }, { status: 401 })
    const asUser = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: auth } } })
    const { data: product } = await asUser.from('products').select('id').eq('id', productId).maybeSingle()
    if (!product) return NextResponse.json({ error: 'Ingen tilgang til denne anledningen.' }, { status: 403 })

    const sek = Math.min(Math.max(5, Number(clipSec) || 60), 180)
    const res = await fetch(`${DROPLET_URL}/music/clip`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename, folder, clipSec: sek, startSec: Math.max(0, Number(startSec) || 0) }),
      signal: AbortSignal.timeout(90000),
    })
    const data = await res.json().catch(() => null)
    if (!res.ok || !data?.file) return NextResponse.json({ error: data?.error || 'Klippingen feilet' }, { status: 500 })
    return NextResponse.json({ file: data.file, clipSec: sek })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Noe gikk galt' }, { status: 500 })
  }
}
