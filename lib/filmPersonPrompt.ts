// Tegning av kunden selv (Lars 5/9: «bruke fotoet som utgangspunkt for en
// illustrasjon i samme stil som resten, og lage noe som passer temaet —
// 17. mai, så kanskje jeg vifter med et flagg»). Scenen per anledning;
// stilen (papirklipp) legges paa av generate-image. Kunden ser resultatet
// foer filmen lages og kan velge fotoet i stedet.

const POSES: Record<string, string> = {
  syttendemai: 'waving a Norwegian flag, dressed up for 17 May with a red, white and blue ribbon, birch leaves and a parade in the background',
  bursdag: 'wearing a paper party crown and holding a birthday cake with candles, balloons all around',
  bryllup: 'in festive wedding attire under an arch of flowers, confetti in the air',
  utdrikningslag: 'wearing a party sash and party glasses, streamers and cocktails around',
  jubileum: 'raising a glass of bubbly, golden streamers and a big anniversary banner behind',
  daap: 'holding a small baby bundle in a white christening gown, soft blue and white flowers around',
  konfirmasjon: 'dressed up for confirmation holding flowers and a gift, a church and spring trees behind',
  krepselag: 'wearing a paper bib and a party hat and holding a crayfish, paper lanterns and a big moon',
  oktoberfest: 'in lederhosen or a dirndl raising a beer mug, pretzels and blue and white bunting around',
  halloween: 'in a Halloween costume holding a carved pumpkin lantern, bats and a purple night sky',
  julebord: 'in a festive Christmas sweater raising a glass, string lights and a long table of food',
  jul: 'wearing a Santa hat next to a Christmas tree, snow falling, gifts and lights',
  nyttaar: 'in party clothes raising a champagne glass, fireworks and gold stars in the night sky',
  valentine: 'holding a big paper heart, roses and hearts floating around',
  paaske: 'holding a basket of painted eggs, spring flowers and a yellow chick',
  firmafest: 'raising a glass with cheering colleagues, a festive banner and balloons',
  bedrift: 'raising a glass with cheering colleagues, a festive banner and balloons',
  default: 'celebrating with confetti and balloons, a big smile',
}

export function personPromptFor(category: string | null | undefined): string {
  const pose = POSES[String(category || '')] || POSES.default
  return `The person from the reference photo is the main character, ${pose}. Half or full figure, festive and warm.`
}

// Maks forsoek per bilde: hvert forsoek er ett bildekall FOER betalingen.
export const DRAWING_MAX_TRIES = 3
