'use client'

import { getSupabase } from '@/lib/supabaseClient'

// Bildene til en Ropert-film lages i nettleseren (Netlify-funksjoner taaler
// ~26 s, ett bilde tar ~10 s). Delt mellom filmsiden (gratis omgjoering) og
// /film/klar (etter betaling — betalingen skal komme FOER noe lages, Lars 5/9).

export interface FilmSeg { index: number; text: string; image_url: string; image_prompt?: string; [k: string]: unknown }

export async function fillMissingImages(opts: {
  draftId: string
  productId: string
  title: string
  segments: FilmSeg[]
  onProgress?: (done: number, total: number) => void
}): Promise<FilmSeg[]> {
  const { draftId, productId, title, onProgress } = opts
  let segments = [...opts.segments]
  const total = segments.length
  onProgress?.(0, total)
  for (let i = 0; i < segments.length; i++) {
    if (segments[i].image_url) { onProgress?.(i + 1, total); continue }
    try {
      const r = await fetch('/api/content/generate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic: segments[i].image_prompt || `${segments[i].text} (${title})`,
          productId,
          imageSize: '1024x1536',
          imageStyle: 'papercut',
          draftId,
        }),
        signal: AbortSignal.timeout(55000),
      })
      const d = await r.json().catch(() => null)
      if (r.ok && d?.imageUrl) segments[i] = { ...segments[i], image_url: d.imageUrl }
    } catch { /* scenen faar bildet fra naboen under */ }
    onProgress?.(i + 1, total)
  }
  // Scener uten bilde laaner naermeste ferdige — filmen stopper aldri paa ett kall
  const anyImage = segments.find((s) => s.image_url)?.image_url
  if (!anyImage) throw new Error('IMAGES_FAILED')
  let last = anyImage
  segments = segments.map((s) => { if (s.image_url) last = s.image_url; return { ...s, image_url: s.image_url || last } })
  const { error } = await getSupabase().from('production_drafts').update({ segments }).eq('id', draftId)
  if (error) throw new Error(error.message)
  return segments
}
