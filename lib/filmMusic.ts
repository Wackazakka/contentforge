// Musikken i «Bare musikk»/«Les opp teksten» for anledningsfilmene (Lars 5/9):
// egne spor per anledning i dropletmappen `celebration/`. Filnavnene er
// ASCII (aa/oe/ae) fordi dropleten vasker navn; visningsnavnene er de ekte.
// Standardspor velges etter products.category — mangler sporet i biblioteket,
// faller vi til foerste spor.

export const FILM_TRACK_NAMES: Record<string, string> = {
  'spooky-season.mp3': 'Spooky Season',
  'spooky-theremin.mp3': 'Spooky Theremin',
  'paaskemorgen-i-mosaikk.mp3': 'Påskemorgen i mosaikk',
  'daapsvann-og-lys.mp3': 'Dåpsvann og lys',
  'bridal-nave.mp3': 'Bridal Nave',
  'konfirmasjonslys.mp3': 'Konfirmasjonslys',
  'krepselag-paa-brygga.mp3': 'Krepselag på brygga',
  'bursdagslys.mp3': 'Bursdagslys',
  'festliche-polka.mp3': 'Festliche Polka',
  'your-heart-fits-mine.mp3': 'Your Heart Fits Mine',
  'julebord-glow.mp3': 'Julebord Glow',
  '17-mai.mp3': '17. mai',
  'flagg-og-fanfarer.mp3': 'Flagg og fanfarer',
}

// Standardspor per anledningstype (products.category → filnavn i celebration/)
export const DEFAULT_TRACK_BY_CATEGORY: Record<string, string> = {
  halloween: 'spooky-season.mp3',
  paaske: 'paaskemorgen-i-mosaikk.mp3',
  daap: 'daapsvann-og-lys.mp3',
  bryllup: 'bridal-nave.mp3',
  konfirmasjon: 'konfirmasjonslys.mp3',
  krepselag: 'krepselag-paa-brygga.mp3',
  bursdag: 'bursdagslys.mp3',
  oktoberfest: 'festliche-polka.mp3',
  valentine: 'your-heart-fits-mine.mp3',
  julebord: 'julebord-glow.mp3',
  syttendemai: '17-mai.mp3',
  // jul, nyttaar, utdrikningslag, jubileum, firmafest, bedrift: spor kommer
}

export function trackDisplayName(filename: string, fallback: string): string {
  const base = filename.split('/').pop() || ''
  return FILM_TRACK_NAMES[base] || fallback
}

export function defaultTrackFor(category: string | null | undefined, available: Array<{ filename: string }>): string | null {
  const want = category ? DEFAULT_TRACK_BY_CATEGORY[category] : undefined
  if (want) {
    const hit = available.find((f) => (f.filename.split('/').pop() || '') === want)
    if (hit) return hit.filename
  }
  return available[0]?.filename || null
}
