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
 * Det reelle taket for det som sendes videre til API-et. Opplastingen gaar
 * gjennom en Netlify-funksjon, og Netlify kutter forespoersler paa ~6 MB
 * (~4,5 MB for binaert innhold) og svarer med tom kropp -- da kraesjer
 * klienten paa «Unexpected end of JSON input». Sto paa 25 MB, som ingen
 * kunne naa (Lars 18/9).
 *
 * Normale fotografier lander langt under etter komprimeringen over. Det som
 * treffer taket er filer nettleseren ikke klarte aa dekode -- typisk HEIC fra
 * iPhone -- og de avvises uansett av ruta (kun PNG/JPG/WebP). Beskjeden
 * «bildet er for stort» er da aerligere enn et kraesj.
 */
export const MAKS_OPPLASTING = 4 * 1024 * 1024

const MAKS_KANT = 2048
const JPEG_KVALITET = 0.85
// Under denne størrelsen er det ikke verdt å røre fila: vi sparer lite, og
// re-koding av en allerede liten PNG kan gjøre den større.
const LA_STAA_UNDER = 1_000_000

/**
 * Filtypene bildeopplastingene godtar (accept på <input type="file">).
 * HEIC/HEIF er med (Lars 30.10): bilder fra iPhone og Bilder-appen på Mac er
 * HEIC, og uten dem i lista ble filene grå i filvelgeren — testerne på Safari
 * kom aldri forbi «Bildene dine». komprimerBilde gjør dem om til JPG.
 */
export const BILDE_ACCEPT = 'image/png,image/jpeg,image/webp,image/heic,image/heif,.heic,.heif'

export function erHeic(fil: File): boolean {
  return /image\/hei[cf]/.test(fil.type || '') || /\.hei[cf]$/i.test(fil.name || '')
}

/**
 * Skalerer ned og re-koder et bilde i nettleseren.
 *
 * HEIC gjøres alltid om til JPG: Safari leser HEIC selv; Chrome og Firefox
 * kan ikke, og da brukes heic2any (lastes bare ned når det trengs).
 *
 * Returnerer ALLTID en brukbar File: feiler dekodingen, får du originalen
 * tilbake uendret, og bildeFeil forklarer hvorfor. Denne funksjonen skal
 * aldri være grunnen til at en opplasting stopper.
 */
export async function komprimerBilde(fil: File): Promise<File> {
  const heic = erHeic(fil)
  if (!heic) {
    if (!fil.type.startsWith('image/')) return fil
    // SVG er vektor — nedskalering er meningsløst og ville rastrert den.
    if (fil.type === 'image/svg+xml') return fil
    if (fil.size <= LA_STAA_UNDER) return fil
  }

  let url: string | null = null
  try {
    let bilde: HTMLImageElement
    try {
      url = URL.createObjectURL(fil)
      bilde = await lastBilde(url)
    } catch (err) {
      if (!heic) throw err
      const heic2any = (await import('heic2any')).default
      const ut = await heic2any({ blob: fil, toType: 'image/jpeg', quality: JPEG_KVALITET })
      URL.revokeObjectURL(url!)
      url = URL.createObjectURL(Array.isArray(ut) ? ut[0] : ut)
      bilde = await lastBilde(url)
    }

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
    // allerede hardt komprimerte filer. Ikke for HEIC — den må bli JPG.
    if (!heic && blob.size >= fil.size) return fil

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

/**
 * Hvorfor et bilde ikke kan lastes opp, i klartekst -- eller null.
 * Kalles ETTER komprimerBilde, med originalen og resultatet.
 *
 * HEIC/HEIF gjøres om til JPG i komprimerBilde (Lars 30.10). Er resultatet
 * fortsatt HEIC, feilet omgjøringen, og ruta ville avvist fila (kun
 * PNG/JPG/WebP). Foer fikk brukeren «for stort» eller et JSON-kraesj uten aa
 * faa vite hva som var galt (Lars 18/9).
 */
export function bildeFeil(original: File, klar: File): string | null {
  if (erHeic(klar)) {
    return `«${original.name}» er i HEIC-format og kunne ikke gjøres om til JPG. ` +
      'Eksporter bildet som JPG (i Bilder-appen på Mac: Arkiv → Eksporter), og last det opp på nytt.'
  }
  if (klar.size > MAKS_OPPLASTING) {
    const mb = (klar.size / 1024 / 1024).toFixed(1)
    return `«${original.name}» er for stort (${mb} MB, maks 4 MB). Lagre det som JPG, eller velg et mindre bilde.`
  }
  return null
}
