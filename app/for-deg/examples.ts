// Eksempelmedier for /for-deg. Alle null i v1 → tintede plassholdere.
// Ekte filer: last opp til R2 (pub-5dcdfe9305a740febc87568c9ccb40a6.r2.dev/for-deg/…)
// og sett URL-ene her — layouten endres ikke.
// NB: byttes hero-videoen, MÅ notatkort-sitatet i media.tsx byttes i samme commit
// (sitatet er inputen som «ga» videoen).

export type ExampleMedia = {
  id: string
  title: string
  meta: string
  tint: string
  videoUrl: string | null
  posterUrl: string | null
}

export const HERO: { videoUrl: string | null; posterUrl: string | null } = {
  videoUrl: null,
  posterUrl: null,
}

export const GALLERY: ExampleMedia[] = [
  { id: '50aar', title: '50-årsdag', meta: 'Invitasjon · 9:16', tint: '#F1E4D5', videoUrl: null, posterUrl: null },
  { id: 'loppis', title: 'Loppemarked', meta: 'Kunngjøring · 9:16', tint: '#E6EFEA', videoUrl: null, posterUrl: null },
  { id: 'aarsmote', title: 'Innkalling, årsmøte', meta: 'Til medlemmer · 9:16', tint: '#EFE7F3', videoUrl: null, posterUrl: null },
  { id: 'cup', title: 'Cupstart, G13', meta: 'Arrangement · 9:16', tint: '#F6E6DE', videoUrl: null, posterUrl: null },
]

export const AUDIO_TILE: { title: string; meta: string; audioUrl: string | null } = {
  title: 'Tale til\nBestemor Ruth',
  meta: 'Bare stemme · 40 sek',
  audioUrl: null,
}
