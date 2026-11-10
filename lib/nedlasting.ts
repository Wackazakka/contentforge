// «Last ned»-lenke for en ferdig film. Filmer i R2 går via /api/video-proxy,
// som logger nedlastingen i film_hendelser (Lars 10.11.2026). Eldre filmer
// med droplet-adresse slipper proxyen (den godtar bare R2) og lenkes direkte.
const R2_PREFIKS = 'https://pub-5dcdfe9305a740febc87568c9ccb40a6.r2.dev/'

export function nedlastingsLenke(url: string, kilde: string): string {
  return url.startsWith(R2_PREFIKS) ? `/api/video-proxy?kilde=${encodeURIComponent(kilde)}&url=${encodeURIComponent(url)}` : url
}
