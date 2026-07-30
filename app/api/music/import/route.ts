import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Store låter tåler ikke Netlify-proxyen (~4,5 MB reell grense, målt 413).
// Flyten: nettleser → Supabase Storage-innboksen (music-inbox, direkte
// opplasting med brukerens sesjon) → denne ruta ber dropleten hente fila til
// produktets tracks-mappe → innboks-objektet slettes. Denne ruta bærer aldri
// selve fila — bare URL-en.

const DROPLET_URL = 'http://139.59.212.218:3002'
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

export const maxDuration = 60

export async function POST(request: Request) {
  try {
    const { path, folder, name } = await request.json()
    if (!path || typeof path !== 'string' || path.includes('..')) {
      return NextResponse.json({ error: 'Ugyldig sti' }, { status: 400 })
    }
    if (!folder || !name) return NextResponse.json({ error: 'folder og name kreves' }, { status: 400 })

    // Krever innlogging (innboksen er skrivbar for innloggede — importen skal også være det)
    const auth = request.headers.get('authorization')
    if (!auth?.startsWith('Bearer ')) return NextResponse.json({ error: 'Ikke innlogget' }, { status: 401 })
    const supabase = createClient(SUPABASE_URL || '', SUPABASE_SERVICE_ROLE_KEY || '')
    const { data: u } = await supabase.auth.getUser(auth.slice(7))
    if (!u?.user?.id) return NextResponse.json({ error: 'Ikke innlogget' }, { status: 401 })

    const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/music-inbox/${path}`
    const res = await fetch(`${DROPLET_URL}/music/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: publicUrl, folder, name }),
    })
    const data = await res.json()

    // Rydd innboksen uansett utfall — fila skal aldri bli liggende
    try {
      await supabase.storage.from('music-inbox').remove([path])
    } catch { /* opprydding er best effort */ }

    return NextResponse.json(data, { status: res.status })
  } catch (err: any) {
    console.error('[music/import] Error:', err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
