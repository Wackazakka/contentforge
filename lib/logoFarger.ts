// Foreslår sluttplakatens farger ut fra en opplastet logo (Lars 21.10).
// Kjører i nettleseren (canvas). Sluttplakaten viser LOGOEN OPPÅ bakgrunnen,
// så bakgrunnen kan ikke bare være logoens farge — da forsvinner logoen:
//  - Logo med egen, ensfarget bakgrunn (JPG-kvadrat o.l.): bruk den fargen,
//    så glir logoen sømløst inn.
//  - Gjennomsiktig logo: mørk eller lys bakgrunn som gir logoen kontrast,
//    og logoens egen farge som tekst hvis den er lesbar der.

const MORK = '#14161b'
const LYS = '#f5f3ee'

function hex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')
}

function luminans(r: number, g: number, b: number): number {
  const lin = (c: number) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4) }
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}

function kontrast(a: number, b: number): number {
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
}

function lesFil(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => { URL.revokeObjectURL(url); resolve(img) }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('kunne ikke lese bildet')) }
    img.src = url
  })
}

export async function fargerFraLogo(file: File): Promise<{ bakgrunn: string; tekst: string } | null> {
  try {
    const img = await lesFil(file)
    const S = 96
    const canvas = document.createElement('canvas')
    canvas.width = S; canvas.height = S
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) return null
    ctx.drawImage(img, 0, 0, S, S)
    const px = ctx.getImageData(0, 0, S, S).data
    const at = (x: number, y: number) => { const i = (y * S + x) * 4; return [px[i], px[i + 1], px[i + 2], px[i + 3]] }

    // 1) Har logoen egen bakgrunn? Se på kanten: nesten helt dekkende og ensfarget
    const kant: number[][] = []
    for (let i = 0; i < S; i++) { kant.push(at(i, 0), at(i, S - 1), at(0, i), at(S - 1, i)) }
    const dekkende = kant.filter((p) => p[3] > 200)
    if (dekkende.length / kant.length > 0.9) {
      const snitt = [0, 1, 2].map((c) => dekkende.reduce((s, p) => s + p[c], 0) / dekkende.length)
      const avvik = dekkende.reduce((s, p) => s + Math.abs(p[0] - snitt[0]) + Math.abs(p[1] - snitt[1]) + Math.abs(p[2] - snitt[2]), 0) / dekkende.length
      if (avvik < 40) {
        const L = luminans(snitt[0], snitt[1], snitt[2])
        return { bakgrunn: hex(snitt[0], snitt[1], snitt[2]), tekst: L > 0.5 ? '#111111' : '#ffffff' }
      }
    }

    // 2) Gjennomsiktig logo: finn hovedfargen blant de synlige pikslene.
    //    Fargerike toner foretrekkes hvis de utgjør en merkbar del.
    const botter = new Map<string, { n: number; r: number; g: number; b: number; metning: number }>()
    let synlige = 0
    for (let i = 0; i < px.length; i += 4) {
      if (px[i + 3] < 128) continue
      synlige++
      const [r, g, b] = [px[i], px[i + 1], px[i + 2]]
      const k = `${r >> 4},${g >> 4},${b >> 4}`
      const maks = Math.max(r, g, b), min = Math.min(r, g, b)
      const v = botter.get(k) || { n: 0, r: 0, g: 0, b: 0, metning: maks === 0 ? 0 : (maks - min) / maks }
      v.n++; v.r += r; v.g += g; v.b += b
      botter.set(k, v)
    }
    if (synlige === 0) return null
    const sortert = [...botter.values()].sort((a, b) => b.n - a.n)
    const fargerik = sortert.find((v) => v.metning > 0.3 && v.n / synlige > 0.05)
    const hoved = fargerik || sortert[0]
    const [r, g, b] = [hoved.r / hoved.n, hoved.g / hoved.n, hoved.b / hoved.n]
    const L = luminans(r, g, b)

    // Bakgrunnen må gi logoen kontrast: lys logo → mørk bakgrunn og omvendt
    const bakgrunn = L > 0.18 ? MORK : LYS
    const Lbg = bakgrunn === MORK ? luminans(0x14, 0x16, 0x1b) : luminans(0xf5, 0xf3, 0xee)
    // Logoens farge som tekst hvis den er lesbar (WCAG 4,5:1), ellers hvit/svart
    const tekst = kontrast(L, Lbg) >= 4.5 ? hex(r, g, b) : bakgrunn === MORK ? '#ffffff' : '#111111'
    return { bakgrunn, tekst }
  } catch {
    return null
  }
}
