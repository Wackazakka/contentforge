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
}

export const tracksFolder = (productId: string) => `tracks-${productId}`

// Full sang trenger mer enn de 4 MB bakgrunnsmusikk-opplastingen tillot
// (3–4 min MP3 @192 kbps ≈ 5–6 MB). Dropleten tar imot langt større filer.
export const TRACK_MAX_BYTES = 15 * 1024 * 1024

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
