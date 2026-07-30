import { getSupabase } from '@/lib/supabaseClient'
import type { MusicFile } from '@/lib/musicLibrary'

// Opplasting av egne låter UTENOM Netlify-proxyen (som kaster 413 over
// ~4,5 MB — målt): nettleser → Supabase Storage-innboksen → droplet henter.
// Returnerer droplet-filinfoen, eller kaster Error med klarspråksmelding.
export const TRACK_UPLOAD_MAX_BYTES = 50 * 1024 * 1024

export async function uploadTrack(file: File, folder: string): Promise<MusicFile> {
  if (file.size > TRACK_UPLOAD_MAX_BYTES) {
    throw new Error(`Fila er for stor (${(file.size / 1024 / 1024).toFixed(1)} MB — maks 50 MB).`)
  }
  const supabase = getSupabase()
  const { data: sess } = await supabase.auth.getSession()
  const token = sess?.session?.access_token
  if (!token) throw new Error('Du må være innlogget for å laste opp.')

  const path = `${crypto.randomUUID()}/${file.name.toLowerCase().replace(/[^a-z0-9.-]/g, '-')}`
  const { error: upErr } = await supabase.storage
    .from('music-inbox')
    .upload(path, file, { contentType: file.type || 'audio/mpeg' })
  if (upErr) throw new Error(`Opplastingen feilet: ${upErr.message}`)

  const res = await fetch('/api/music/import', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ path, folder, name: file.name }),
  })
  const data = await res.json().catch(() => null)
  if (!res.ok || !data?.file) throw new Error(data?.error || 'Importen feilet på serveren.')
  return data.file as MusicFile
}
