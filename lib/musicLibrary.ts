// Musikkbibliotek-scoping (fase 3a, IndigoBoom-planen):
// - «Låtene dine»: produkt-scopet mappe `tracks-<productId>` — artistens egen
//   musikk, synlig KUN i eget produkt (samme mønster som jingles-<productId>).
// - Delt bibliotek: alt som hverken er jingles eller andres tracks-mapper.
// Uten dette lakk alle mapper (bildeal/reforhandle/…) inn i alles velgere,
// og en artists opplastede låt ville vært synlig på tvers av tenanter.

export interface MusicFile {
  filename: string
  name: string
  folder?: string
  // Dropleten leverer alltid url og stoerrelse; sidene brukte hver sin
  // lokale kopi av typen med begge som paakrevd (samlet her 4/9).
  url: string
  size: number
}

export const tracksFolder = (productId: string) => `tracks-${productId}`

// Full sang trenger mer enn de 4 MB bakgrunnsmusikk-opplastingen tillot
// (3–4 min MP3 @192 kbps ≈ 5–6 MB). Dropleten tar imot langt større filer.
// Samme tall som lib/uploadTrack (4/9: tre ulike grenser sto i UI-et —
// 4, 15 og 50 MB — mens 50 var den som faktisk ble haandhevet).
export const TRACK_MAX_BYTES = 50 * 1024 * 1024

// Henter biblioteket MED innloggingstoken naar det finnes. Serveren scoper
// tracks-/jingles-mapper til produkter brukeren eier (4/9: endepunktet var
// aapent og listet alle kunders laater for alle). Uten token: kun delt musikk.
export async function fetchMusicLibrary(): Promise<{ files: MusicFile[] }> {
  let headers: Record<string, string> | undefined
  try {
    const { getSupabase } = await import('@/lib/supabaseClient')
    const { data: sess } = await getSupabase().auth.getSession()
    const token = sess?.session?.access_token
    if (token) headers = { Authorization: `Bearer ${token}` }
  } catch { /* uten sesjon: delt bibliotek */ }
  const res = await fetch('/api/music', headers ? { headers } : undefined)
  const data = await res.json().catch(() => ({ files: [] }))
  return { files: Array.isArray(data?.files) ? data.files : [] }
}

export function ownTracks(files: MusicFile[], productId: string): MusicFile[] {
  return files.filter((m) => m.folder === tracksFolder(productId))
}

export function sharedMusic(files: MusicFile[]): MusicFile[] {
  return files.filter((m) => {
    const f = m.folder || ''
    return !f.startsWith('jingles') && !f.startsWith('tracks-')
  })
}

// Ferdige medleyer er RESULTATER, ikke råvarer — de skal ikke kunne velges
// inn i nye medleyer (Lars 30/7: medleyen la seg i sin egen kandidatliste).
export const isMedleyFile = (filename: string) =>
  ((filename.split('/').pop() || '').startsWith('medley-'))
