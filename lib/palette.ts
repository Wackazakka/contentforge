/**
 * Fargeverktøy for tenant-paletter.
 *
 * «Forslag»-knappen i Partnere-adminen trekker ÉN tilfeldig ting — sideflatens
 * kulør og om paletten er lys eller mørk — og utleder de femten andre fargene fra
 * den. Det er poenget: seksten uavhengige tilfeldige farger blir alltid stygt og
 * ofte uleselig. Ett frø pluss avledning gir en palett som henger sammen.
 *
 * Til slutt tvinges kontrastene opp til WCAG-nivå, så en generert palett aldri
 * kan gi usynlig tekst. Det var nettopp den feilen white-labelen hadde: mørk
 * bakgrunn og hardkodet nesten-svart tekst.
 */

export type Hsl = { h: number; s: number; l: number }

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

export function hexToHsl(hex: string): Hsl {
  const m = hex.replace('#', '')
  const r = parseInt(m.slice(0, 2), 16) / 255
  const g = parseInt(m.slice(2, 4), 16) / 255
  const b = parseInt(m.slice(4, 6), 16) / 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  const l = (max + min) / 2
  if (max === min) return { h: 0, s: 0, l: l * 100 }
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h = 0
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0))
  else if (max === g) h = (b - r) / d + 2
  else h = (r - g) / d + 4
  return { h: h * 60, s: s * 100, l: l * 100 }
}

export function hslToHex({ h, s, l }: Hsl): string {
  const sN = clamp(s, 0, 100) / 100
  const lN = clamp(l, 0, 100) / 100
  const c = (1 - Math.abs(2 * lN - 1)) * sN
  const x = c * (1 - Math.abs((((h % 360) + 360) % 360) / 60 % 2 - 1))
  const m = lN - c / 2
  const hh = (((h % 360) + 360) % 360) / 60
  let rgb: [number, number, number]
  if (hh < 1) rgb = [c, x, 0]
  else if (hh < 2) rgb = [x, c, 0]
  else if (hh < 3) rgb = [0, c, x]
  else if (hh < 4) rgb = [0, x, c]
  else if (hh < 5) rgb = [x, 0, c]
  else rgb = [c, 0, x]
  const to = (v: number) => Math.round((v + m) * 255).toString(16).padStart(2, '0')
  return `#${to(rgb[0])}${to(rgb[1])}${to(rgb[2])}`.toUpperCase()
}

/** WCAG relativ luminans. */
export function luminance(hex: string): number {
  const m = hex.replace('#', '')
  const ch = [0, 2, 4].map((i) => {
    const v = parseInt(m.slice(i, i + 2), 16) / 255
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
  })
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2]
}

/** WCAG kontrastforhold, 1–21. Brødtekst bør ligge over 4,5. */
export function contrast(a: string, b: string): number {
  const la = luminance(a), lb = luminance(b)
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

/**
 * Justerer lysheten på `fg` til den når `target` kontrast mot `bg`.
 * Går mot svart eller hvitt alt etter hva bakgrunnen tåler. Gir opp pent —
 * returnerer det beste den kom til i stedet for å loope i det uendelige.
 */
export function ensureContrast(fg: string, bg: string, target: number): string {
  if (contrast(fg, bg) >= target) return fg
  const hsl = hexToHsl(fg)
  const bgLight = luminance(bg) > 0.35
  let best = fg
  for (let i = 0; i < 100; i++) {
    hsl.l = clamp(hsl.l + (bgLight ? -1 : 1), 0, 100)
    const candidate = hslToHex(hsl)
    best = candidate
    if (contrast(candidate, bg) >= target) return candidate
    if (hsl.l <= 0 || hsl.l >= 100) break
  }
  return best
}

/**
 * Mettede mellomtoner har en dødsone: hverken hvit eller svart tekst når 4,5:1.
 * #A650E9 gir 4,25 mot hvit og 4,34 mot svart — ingen tekstfarge redder den.
 * Da må AKSENTEN flyttes. Vi prøver begge veier og velger den korteste, så
 * kuløren beholdes og lysheten endres minst mulig.
 */
export function makeAccentLegible(accent: string, target = 4.5): { accent: string; onEmber: string } {
  const best = (c: string) => (contrast('#FFFFFF', c) >= contrast('#141414', c) ? '#FFFFFF' : '#141414')
  if (Math.max(contrast('#FFFFFF', accent), contrast('#141414', accent)) >= target) {
    return { accent, onEmber: best(accent) }
  }
  const base = hexToHsl(accent)
  let darker: string | null = null
  let lighter: string | null = null
  for (let d = 1; d <= 100; d++) {
    if (!darker) {
      const c = hslToHex({ ...base, l: base.l - d })
      if (contrast('#FFFFFF', c) >= target) darker = c
    }
    if (!lighter) {
      const c = hslToHex({ ...base, l: base.l + d })
      if (contrast('#141414', c) >= target) lighter = c
    }
    if (darker && lighter) break
  }
  // Korteste vei vinner; i praksis finnes alltid minst én (svart/hvitt er ytterpunktene).
  const dl = darker ? Math.abs(hexToHsl(darker).l - base.l) : Infinity
  const ll = lighter ? Math.abs(hexToHsl(lighter).l - base.l) : Infinity
  const chosen = dl <= ll ? darker : lighter
  if (!chosen) return { accent, onEmber: best(accent) }
  return { accent: chosen, onEmber: best(chosen) }
}

/** Alle tokene en tenant-palett består av. */
export type Palette = Record<string, string>

const pick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)]
const between = (lo: number, hi: number) => lo + Math.random() * (hi - lo)

/**
 * Lager en sammenhengende palett fra ett tilfeldig frø.
 *
 * Frøet er sideflaten: en kulør, og om paletten er lys eller mørk. Aksenten
 * legges enten i slekt med kuløren eller i kontrast til den; flater, tekst og
 * kanter trappes ut fra sideflaten. Deretter tvinges kontrastene opp.
 */
export function generatePalette(opts?: { dark?: boolean }): Palette {
  const hue = between(0, 360)
  // Mørke paletter er sjeldnere i praksis, så de trekkes sjeldnere med mindre
  // kalleren ber om det eksplisitt.
  const dark = opts?.dark ?? Math.random() < 0.3

  // Sideflaten: nesten nøytral, men med et snev av kuløren så paletten henger sammen.
  const surfaceSat = between(5, 14)
  const paperL = dark ? between(9, 14) : between(93, 97)
  const paper = hslToHex({ h: hue, s: surfaceSat, l: paperL })
  const raised = hslToHex({ h: hue, s: surfaceSat, l: dark ? paperL + 5 : paperL + 2.5 })
  const sunken = hslToHex({ h: hue, s: surfaceSat, l: dark ? paperL + 2.5 : paperL - 2.5 })
  const band = hslToHex({ h: hue, s: surfaceSat + 2, l: dark ? paperL + 8 : paperL - 6 })

  // Aksenten: enten i slekt med sideflaten (rolig) eller i kontrast (markant).
  const accentHue = (hue + pick([28, -28, 150, 180, 210])) % 360
  const rawAccent = hslToHex({ h: accentHue, s: between(58, 84), l: dark ? between(52, 64) : between(44, 56) })
  const { accent, onEmber } = makeAccentLegible(rawAccent)
  const accentDeep = hslToHex({ ...hexToHsl(accent), l: hexToHsl(accent).l - (dark ? 8 : 10) })
  const tintBg = hslToHex({ h: accentHue, s: between(24, 40), l: dark ? 19 : 93 })
  const tintBorder = hslToHex({ h: accentHue, s: between(28, 46), l: dark ? 29 : 83 })

  // Tekst trappes fra sideflaten, ikke fra svart — da beholder paletten kuløren sin.
  const textL = dark ? [96, 84, 70, 56] : [10, 24, 38, 54]
  const ink = hslToHex({ h: hue, s: surfaceSat + 4, l: textL[0] })
  const inkSoft = hslToHex({ h: hue, s: surfaceSat + 3, l: textL[1] })
  const muted = hslToHex({ h: hue, s: surfaceSat + 2, l: textL[2] })
  const faint = hslToHex({ h: hue, s: surfaceSat, l: textL[3] })

  const borderL = dark ? [24, 34, 18] : [86, 78, 91]
  const border = hslToHex({ h: hue, s: surfaceSat, l: borderL[0] })
  const borderStrong = hslToHex({ h: hue, s: surfaceSat, l: borderL[1] })
  const borderFaint = hslToHex({ h: hue, s: surfaceSat, l: borderL[2] })

  return {
    '--ember': accent,
    '--ember-deep': accentDeep,
    '--ember-tint-bg': tintBg,
    '--ember-tint-border': tintBorder,
    '--on-ember': onEmber,
    '--paper': paper,
    '--paper-raised': raised,
    '--paper-sunken': sunken,
    '--band': band,
    // Kontrastgarantiene: brødtekst 7:1 (AAA), dempet tekst 4,5:1 (AA).
    '--ink': ensureContrast(ink, paper, 7),
    '--ink-soft': ensureContrast(inkSoft, paper, 5.5),
    '--text-muted': ensureContrast(muted, paper, 4.5),
    '--text-faint': ensureContrast(faint, paper, 3),
    '--ds-border': border,
    '--ds-border-strong': borderStrong,
    '--ds-border-faint': borderFaint,
  }
}
