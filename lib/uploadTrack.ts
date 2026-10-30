import { getSupabase } from '@/lib/supabaseClient'
import { fetchMusicLibrary, TRACK_MAX_BYTES, type MusicFile } from '@/lib/musicLibrary'

// Opplasting av egne låter UTENOM Netlify-proxyen (som kaster 413 over
// ~4,5 MB — målt): nettleser → Supabase Storage-innboksen → droplet henter.
// Returnerer droplet-filinfoen, eller kaster Error med klarspråksmelding.
export const TRACK_UPLOAD_MAX_BYTES = TRACK_MAX_BYTES

// Filtypene låtopplastingene godtar (accept på <input type="file">). Bare MP3
// før 30.10 — musikere på Mac har ofte WAV/AIFF/M4A, og de ble grå i
// filvelgeren uten forklaring. Dropleten gjør alt som ikke er MP3 om til MP3.
export const LAAT_ACCEPT =
  '.mp3,.wav,.aif,.aiff,.m4a,.flac,audio/mpeg,audio/wav,audio/x-wav,audio/aiff,audio/x-aiff,audio/mp4,audio/x-m4a,audio/flac'
export const LAAT_FORMATER = 'MP3, WAV, AIFF, M4A eller FLAC'
export const erStottetLaat = (file: File) => /\.(mp3|wav|aiff?|m4a|flac)$/i.test(file.name || '')

const erMp3 = (file: File) => /\.mp3$/i.test(file.name) || file.type === 'audio/mpeg'

export async function uploadTrack(file: File, folder: string): Promise<MusicFile> {
  if (file.size > TRACK_UPLOAD_MAX_BYTES) {
    throw new Error(`Fila er for stor (${(file.size / 1024 / 1024).toFixed(1)} MB — maks ${TRACK_UPLOAD_MAX_BYTES / 1024 / 1024} MB).`)
  }
  const supabase = getSupabase()
  const { data: sess } = await supabase.auth.getSession()
  const token = sess?.session?.access_token
  if (!token) throw new Error('Du må være innlogget for å laste opp.')

  // Gjøres fila om til MP3, får den en annen størrelse — reservesjekken under
  // ser da etter en NY fil i mappa i stedet. Hent det som finnes fra før.
  const mp3 = erMp3(file)
  let fraFoer: Set<string> | null = null
  if (!mp3) {
    try {
      const lib = await fetchMusicLibrary()
      fraFoer = new Set((lib.files || []).filter((f) => f.folder === folder).map((f) => f.filename))
    } catch { /* reservesjekken faller da tilbake på størrelse */ }
  }

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
  if (res.ok && data?.file) return data.file as MusicFile

  // Kvitteringen kan gaa tapt selv om importen LYKTES (Netlify-tidsavbrudd,
  // sett 30/7: fila laa paa serveren mens brukeren fikk feilmelding).
  // Sjekk fasiten foer vi roper feil: finnes en fil i mappa med noeyaktig
  // samme stoerrelse (eller en ny fil, naar den ble gjort om til MP3), kom
  // den frem.
  await new Promise((r) => setTimeout(r, 2500))
  try {
    const lib = await fetchMusicLibrary()
    const hit = (lib.files || []).find((f: MusicFile) =>
      f.folder === folder && (fraFoer ? !fraFoer.has(f.filename) : f.size === file.size)
    )
    if (hit) return hit as MusicFile
  } catch { /* fall gjennom til feil */ }
  throw new Error(data?.error || 'Importen feilet på serveren.')
}
