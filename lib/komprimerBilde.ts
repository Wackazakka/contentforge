// Klientside-komprimering av bilder FØR opplasting.
//
// Bakgrunnen (IndigoBoom 11/9-2026): artistbilder er nesten alltid over
// 8 MB-grensen vår, og brukerne møtte en feilmelding i stedet for et bilde.
// Poenget er at grensen aldri var det egentlige problemet — pipelinen jobber
// i 1024 px (se app/api/content/generate-image: size 1024, quality 'low',
// fordi hvert segment vises et par sekunder i en 9:16-video). Et
// 12 MB-bilde er typisk 5000 px bredt; over nitti prosent av dataene kastes
// uansett. Vi skalerer derfor ned FØR opplasting: raskere for brukeren på
// mobil, mindre trafikk mot R2, og grensen blir noe ingen møter.
//
// MAKS_KANT er satt til 2048 — dobbel margin mot de 1024 pipelinen bruker,
// så det er rom for høyere utdataoppløsning senere uten å røre dette.

/**
 * Sikkerhetsventil, ikke en bruksgrense. Etter komprimering lander normale
 * fotografier langt under dette; treffer noe taket er det som regel en fil
 * nettleseren ikke klarte aa dekode (HEIC) og som derfor gaar urort gjennom.
 */
export const MAKS_OPPLASTING = 25 * 1024 * 1024

const MAKS_KANT = 2048
const JPEG_KVALITET = 0.85
// Under denne størrelsen er det ikke verdt å røre fila: vi sparer lite, og
// re-koding av en allerede liten PNG kan gjøre den større.
const LA_STAA_UNDER = 1_000_000

/**
 * Skalerer ned og re-koder et bilde i nettleseren.
 *
 * Returnerer ALLTID en brukbar File: feiler dekodingen — typisk HEIC fra
 * iPhone, som de fleste nettlesere ikke tegner på canvas — får du originalen
 * tilbake uendret, og den vanlige størrelsesgrensen fanger den i stedet.
 * Denne funksjonen skal aldri være grunnen til at en opplasting stopper.
 */
export async function komprimerBilde(fil: File): Promise<File> {
  if (!fil.type.startsWith('image/')) return fil
  // SVG er vektor — nedskalering er meningsløst og ville rastrert den.
  if (fil.type === 'image/svg+xml') return fil
  if (fil.size <= LA_STAA_UNDER) return fil

  let url: string | null = null
  try {
    url = URL.createObjectURL(fil)
    const bilde = await lastBilde(url)

    const storsteKant = Math.max(bilde.width, bilde.height)
    const skala = storsteKant > MAKS_KANT ? MAKS_KANT / storsteKant : 1
    const bredde = Math.round(bilde.width * skala)
    const hoyde = Math.round(bilde.height * skala)

    const lerret = document.createElement('canvas')
    lerret.width = bredde
    lerret.height = hoyde
    const ctx = lerret.getContext('2d')
    if (!ctx) return fil
    // Hvit bunn: kilden kan ha gjennomsiktighet, og JPEG har ingen alfakanal.
    // Uten dette blir gjennomsiktige felt svarte.
    ctx.fillStyle = '#FFFFFF'
    ctx.fillRect(0, 0, bredde, hoyde)
    ctx.drawImage(bilde, 0, 0, bredde, hoyde)

    const blob = await new Promise<Blob | null>((res) =>
      lerret.toBlob(res, 'image/jpeg', JPEG_KVALITET)
    )
    if (!blob) return fil
    // Ble den ikke mindre, er originalen best. Skjer for små eller
    // allerede hardt komprimerte filer.
    if (blob.size >= fil.size) return fil

    return new File([blob], bytUtEndelse(fil.name), {
      type: 'image/jpeg',
      lastModified: Date.now(),
    })
  } catch {
    return fil
  } finally {
    if (url) URL.revokeObjectURL(url)
  }
}

function lastBilde(url: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const b = new Image()
    b.onload = () => res(b)
    b.onerror = () => rej(new Error('kunne ikke dekode bildet'))
    b.src = url
  })
}

function bytUtEndelse(navn: string): string {
  return navn.replace(/\.[^.]+$/, '') + '.jpg'
}
