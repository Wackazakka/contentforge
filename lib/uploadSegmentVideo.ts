import { getSupabase } from '@/lib/supabaseClient'

// Egen video som scenebakgrunn (Lars 1/8: «kanskje de har noe live footage
// som de ønsker skal være ett av segmentene»). Gratis — ingen generering.
//
// Går UTENOM Netlify-proxyen, som kaster 413 over ~4,5 MB (målt 30/7):
// nettleser → Supabase Storage → offentlig URL brukes direkte som scenens
// klipp. Lyden strippes på dropleten, så musikken bærer filmen som ellers.
export const VIDEO_MAX_BYTES = 50 * 1024 * 1024

export interface OpplastetVideo {
  url: string
  name: string
  size: number
}

export async function uploadSegmentVideo(file: File, productId: string): Promise<OpplastetVideo> {
  if (file.size > VIDEO_MAX_BYTES) {
    throw new Error(
      `Klippet er for stort (${(file.size / 1024 / 1024).toFixed(1)} MB — maks 50 MB). ` +
      'Klipp det ned til 15–30 sekunder, så holder det med god margin.'
    )
  }
  if (!/^video\//.test(file.type || '')) {
    throw new Error('Fila må være en video (MP4, MOV eller WebM).')
  }

  const supabase = getSupabase()
  const { data: sess } = await supabase.auth.getSession()
  if (!sess?.session?.access_token) throw new Error('Du må være innlogget for å laste opp.')

  // Sjekk lagringsgrensen FØR opplasting — bedre enn å laste opp 50 MB
  // og få nei etterpå
  try {
    const res = await fetch(`/api/storage-usage?productId=${productId}`, {
      headers: { Authorization: `Bearer ${sess.session.access_token}` },
    })
    const bruk = await res.json()
    if (res.ok && bruk.grenseBytes && bruk.brukteBytes + file.size > bruk.grenseBytes) {
      throw new Error(
        `Da sprenger du lagringsgrensen (${bruk.brukteMB} MB av ${bruk.grenseMB} MB brukt). ` +
        'Slett noen bilder, låter eller klipp du ikke trenger først.'
      )
    }
  } catch (err) {
    // Kan ikke måle → slipp gjennom (grensen er mot misbruk, ikke en kasse)
    if (err instanceof Error && err.message.startsWith('Da sprenger du')) throw err
  }

  const trygtNavn = file.name.toLowerCase().replace(/[^a-z0-9.-]/g, '-')
  const path = `segment-videos/${productId}/${crypto.randomUUID()}-${trygtNavn}`
  const { error } = await supabase.storage
    .from('music-inbox')
    .upload(path, file, { contentType: file.type || 'video/mp4' })
  if (error) throw new Error(`Opplastingen feilet: ${error.message}`)

  const base = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
  return {
    url: `${base}/storage/v1/object/public/music-inbox/${path}`,
    name: file.name,
    size: file.size,
  }
}
