import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const DROPLET_URL = 'http://139.59.212.218:3002'

// Musikkbiblioteket, scopet per bruker (4/9): dropleten lister ALLE mapper,
// ogsaa `tracks-<productId>`/`jingles-<productId>` med kundenes egne laater.
// Foer slapp alt rett gjennom til hvem som helst uten innlogging — med
// private bursdagssanger paa tvers av tenanter er det et personvernbrudd.
// Naa: delte mapper til alle; produkt-mapper kun til den som eier produktet
// (avgjort av RLS paa products med brukerens eget token).
// Dropletens lokale filsti («path») har ingenting i nettleseren aa gjoere.

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

interface DropletFile { filename: string; name: string; folder?: string; url: string; size?: number; path?: string }

const productIdOfFolder = (folder: string): string | null => {
  const m = /^(?:tracks|jingles)-(.+)$/.exec(folder)
  return m ? m[1] : null
}

async function ownedProductIds(request: Request): Promise<Set<string>> {
  const auth = request.headers.get('authorization')
  if (!auth?.startsWith('Bearer ') || !SUPABASE_URL || !ANON_KEY) return new Set()
  try {
    const asUser = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: auth } },
    })
    const { data } = await asUser.from('products').select('id')
    return new Set((data || []).map((p: { id: string }) => p.id))
  } catch {
    return new Set()
  }
}

export async function GET(request: Request) {
  try {
    const [res, owned] = await Promise.all([
      fetch(`${DROPLET_URL}/music`, { signal: AbortSignal.timeout(10000) }),
      ownedProductIds(request),
    ])
    const data = await res.json()
    const files = (Array.isArray(data?.files) ? data.files : []) as DropletFile[]
    const visible = files
      .filter((f) => {
        const pid = productIdOfFolder(f.folder || '')
        return pid === null || owned.has(pid)
      })
      .map((f) => { const { path, ...rest } = f; void path; return rest })
    return NextResponse.json({ ...data, files: visible })
  } catch (err) {
    return NextResponse.json({ files: [], error: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}
