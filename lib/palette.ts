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
  // Prøv BEGGE retninger og ta den som treffer først. Første versjon gjettet
  // retning ut fra en luminansterskel på 0,35, og bommet på mellomtoner: en flate
  // på 0,33 ble regnet som mørk, så teksten ble lysnet helt til hvit — 2,8:1 mot
  // en mellomblå bakgrunn der svart ville gitt 7:1.
  const base = hexToHsl(fg)
  let best = fg
  let bestC = contrast(fg, bg)
  for (let d = 1; d <= 100; d++) {
    for (const l of [base.l - d, base.l + d]) {
      if (l < 0 || l > 100) continue
      const kandidat = hslToHex({ ...base, l })
      const c = contrast(kandidat, bg)
      if (c >= target) return kandidat // korteste vei som treffer vinner
      if (c > bestC) { bestC = c; best = kandidat }
    }
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
 * Bygger en palett rundt en GITT merkefarge, i stedet for å trekke tilfeldig.
 *
 * Poenget er arbeidsdelingen: merkefargen havner på aksenten, der den dekker lite
 * areal og bare trenger én tekstfarge oppå seg. Sideflaten blir en dempet slektning
 * — samme kulør, mye lavere metning. En sterk farge som SIDEFLATE har nemlig ikke
 * plass til et teksthierarki: knall rød (#E01B1B) gir 4,84:1 mot hvit og 4,34 mot
 * svart, så alle fire tekstnivåer må klemmes inn mellom lyshet 80 og 97 og blir
 * umulige å skille. Til sammenligning gir en lys sideflate 18:1.
 *
 * Merkefargen beholdes EKSAKT på `--ember`. Det er `--ember-deep` som mørknes til
 * den bærer hvit tekst — den er det knappene faktisk bruker — slik at merkevaren
 * ikke justeres bak ryggen på noen.
 */
export function paletteFromBrand(brand: string, opts?: { dark?: boolean }): Palette {
  const b = hexToHsl(brand)
  const dark = opts?.dark ?? false

  // Dyp variant: mørkne merkefargen til hvit tekst er trygg på den.
  let deep = hslToHex({ ...b, l: Math.max(0, b.l - 10) })
  for (let d = 10; d <= 100 && contrast('#FFFFFF', deep) < 4.5; d += 2) {
    deep = hslToHex({ ...b, l: Math.max(0, b.l - d) })
  }
  // Tekstfargen maales mot DEEP, ikke mot merkefargen. Knappene har
  // --ember-deep som bakgrunn, og for en LYS merkefarge havner de to paa hver
  // sin side av tekstgrensen: #EC3DFA vil ha moerk tekst, mens #C606D6 -- som
  // knappen faktisk er -- krever hvit. Maalt paa IndigoBooms magenta ga den
  // gamle regelen 3,86:1 paa hver eneste knapp (Lars 5/8: «alle knapper paa
  // tjenesten som har samme kontrasten»). Deep er konstruert slik at hvit
  // alltid naar 4,5, saa gulvet holder naa uansett merkefarge.
  const onEmber = contrast('#FFFFFF', deep) >= contrast('#141414', deep) ? '#FFFFFF' : '#141414'

  // Sideflaten: samme kulør, kraftig dempet. Det er slektskapet som gjør at
  // paletten henger sammen, ikke styrken.
  const surfSat = dark ? Math.min(26, b.s * 0.28) : Math.min(34, b.s * 0.20)
  const paperL = dark ? 11 : 94
  const paper = hslToHex({ h: b.h, s: surfSat, l: paperL })

  const textSat = Math.min(14, b.s * 0.16)
  const tl = dark ? [96, 84, 70, 56] : [10, 24, 38, 54]
  const bl = dark ? [24, 34, 18] : [86, 78, 91]
  const bs = surfSat * 0.5

  return {
    '--ember': brand.toUpperCase(),
    '--ember-deep': deep,
    '--ember-tint-bg': hslToHex({ h: b.h, s: Math.min(42, b.s * 0.45), l: dark ? 19 : 93 }),
    '--ember-tint-border': hslToHex({ h: b.h, s: Math.min(48, b.s * 0.5), l: dark ? 29 : 83 }),
    '--on-ember': onEmber,
    '--paper': paper,
    '--paper-raised': hslToHex({ h: b.h, s: surfSat * 0.6, l: dark ? paperL + 5 : paperL + 3 }),
    '--paper-sunken': hslToHex({ h: b.h, s: surfSat, l: dark ? paperL + 2.5 : paperL - 3 }),
    '--band': hslToHex({ h: b.h, s: surfSat * 1.2, l: dark ? paperL + 8 : paperL - 7 }),
    '--ink': ensureContrast(hslToHex({ h: b.h, s: textSat, l: tl[0] }), paper, 7),
    '--ink-soft': ensureContrast(hslToHex({ h: b.h, s: textSat * 0.9, l: tl[1] }), paper, 5.5),
    '--text-muted': ensureContrast(hslToHex({ h: b.h, s: textSat * 0.8, l: tl[2] }), paper, 4.5),
    '--text-faint': ensureContrast(hslToHex({ h: b.h, s: textSat * 0.7, l: tl[3] }), paper, 3),
    '--ds-border': hslToHex({ h: b.h, s: bs, l: bl[0] }),
    '--ds-border-strong': hslToHex({ h: b.h, s: bs, l: bl[1] }),
    '--ds-border-faint': hslToHex({ h: b.h, s: bs * 0.8, l: bl[2] }),
  }
}

/**
 * Merkefargen som SIDEFLATE — den dristige varianten.
 *
 * Prisen er reell og skal ikke bortforklares: en mettet flate gir bare fire
 * brukbare tekstlysheter (L97–100 på #E01B1B, mot 43 på en lys flate). Fire
 * tekstnivåer får altså ikke plass, og hierarkiet flates ut.
 *
 * Det finnes nøyaktig ÉN sammenhengende løsning, og den er målt fram: med LYSE
 * kort på en sterk flate virker null tekstlysheter begge steder. Med MØRKE kort
 * virker fire. Derfor: sterk flate, mørke kort, lys tekst. Brødteksten er hvit og
 * leses både på flaten og i kortene; de svakere nivåene er dimmet og gjelder inne
 * i kortene, som er der lengre tekst faktisk står.
 *
 * Egner seg til landingssider og flater med lite tekst — ikke til et dashbord.
 */
export function paletteBoldSurface(brand: string): Palette {
  const b = hexToHsl(brand)
  const paper = brand.toUpperCase()

  // Hele paletten vipper etter hva flaten tåler. Hvit tekst virker på mørke,
  // mettede merkefarger (rød 4,84 · fiolett 6,42) men ikke på lyse (gul 1,65 ·
  // lyseblå 2,02) — der må teksten være mørk, og da må kortene være LYSE, ellers
  // finnes ingen tekstfarge som virker begge steder.
  const mørkTekst = contrast('#000000', brand) >= contrast('#FFFFFF', brand)
  const ink = mørkTekst ? '#000000' : '#FFFFFF'
  const kortL = mørkTekst ? 96 : 12
  const card = hslToHex({ h: b.h, s: Math.min(30, b.s * 0.35), l: kortL })

  // Trapp for de svakere nivåene, alltid bort fra kortet.
  const trapp = mørkTekst ? [16, 34, 48] : [88, 74, 60]
  const dybde = mørkTekst
    ? { sunken: Math.min(94, b.l + 10), band: Math.min(97, b.l + 16) }
    : { sunken: Math.max(6, b.l - 12), band: Math.max(5, b.l - 18) }

  // Aksenten kan ikke være merkefargen — den ER flaten. Den må stikke seg ut
  // motsatt vei av tekstretningen.
  const accent = hslToHex({ h: b.h, s: Math.min(28, b.s * 0.3), l: mørkTekst ? 16 : 95 })
  const onEmber = hslToHex({ h: b.h, s: Math.min(40, b.s * 0.5), l: mørkTekst ? 96 : 14 })

  return {
    '--ember': accent,
    '--ember-deep': hslToHex({ h: b.h, s: Math.min(22, b.s * 0.25), l: mørkTekst ? 9 : 88 }),
    '--ember-tint-bg': hslToHex({ h: b.h, s: b.s * 0.6, l: mørkTekst ? Math.min(96, b.l + 18) : Math.max(10, b.l - 20) }),
    '--ember-tint-border': hslToHex({ h: b.h, s: b.s * 0.7, l: mørkTekst ? Math.min(90, b.l + 10) : Math.max(16, b.l - 12) }),
    '--on-ember': onEmber,
    '--paper': paper,
    '--paper-raised': card,
    '--paper-sunken': hslToHex({ h: b.h, s: b.s * 0.9, l: dybde.sunken }),
    '--band': hslToHex({ h: b.h, s: b.s, l: dybde.band }),
    // Brødtekst: leses BÅDE på flaten og i kortene — det er den eneste som må det.
    '--ink': ink,
    // De svakere nivåene måles mot KORTET; det er der lengre tekst faktisk står.
    '--ink-soft': ensureContrast(hslToHex({ h: b.h, s: 6, l: trapp[0] }), card, 7),
    '--text-muted': ensureContrast(hslToHex({ h: b.h, s: 6, l: trapp[1] }), card, 4.5),
    '--text-faint': ensureContrast(hslToHex({ h: b.h, s: 6, l: trapp[2] }), card, 3),
    '--ds-border': hslToHex({ h: b.h, s: b.s * 0.5, l: mørkTekst ? Math.max(8, b.l - 22) : Math.min(96, b.l + 22) }),
    '--ds-border-strong': hslToHex({ h: b.h, s: b.s * 0.4, l: mørkTekst ? Math.max(4, b.l - 34) : Math.min(99, b.l + 34) }),
    '--ds-border-faint': hslToHex({ h: b.h, s: b.s * 0.6, l: mørkTekst ? Math.max(14, b.l - 12) : Math.min(92, b.l + 12) }),
  }
}

/**
 * Lager en sammenhengende palett fra ett tilfeldig frø.
 *
 * Frøet er sideflaten: en kulør, og om paletten er lys eller mørk. Aksenten
 * legges enten i slekt med kuløren eller i kontrast til den; flater, tekst og
 * kanter trappes ut fra sideflaten. Deretter tvinges kontrastene opp.
 */
export function generatePalette(opts?: { dark?: boolean }): Palette {
  const hue = between(0, 360)

  // TRE stemninger, ikke to. Første versjon hadde bare «lys» (L 90–96) og «mørk»
  // (L 8–15), og da finnes mellomtonene rett og slett ikke — resultatet ser ut
  // som hvitt, svart eller blek pastell uansett kulør. Ved 93 % lyshet KAN en
  // farge ikke bli annet enn pastell, uansett metning. Mellomsjiktet er der en
  // flate faktisk viser farge.
  const mood: 'lys' | 'mellom' | 'mørk' =
    // Jevn tredeling. Var 50/25/25, men da ser man sjelden en mellomtone i et
    // lite utvalg — og mellomtonene er nettopp de som viser kulør. Dette er en
    // ren smaksinnstilling: endre vektene her for å skifte hvor ofte hver
    // stemning dukker opp.
    opts?.dark ? 'mørk' : pick(['lys', 'mellom', 'mørk'])
  const dark = mood === 'mørk'

  // Sideflaten skal ha SYNLIG kulør — den er frøet hele paletten hviler på.
  // Første versjon brukte 5–14 % metning ved 93–97 % lyshet, og da ble resultatet
  // i praksis hvitt eller svart uansett kulør. CenterForges egen sideflate
  // (#F4EEE2) ligger på ~45 % metning, så spennet må være mye bredere.
  // Mellomtonene tåler — og trenger — mest metning; det er de som viser kulør.
  const surfaceSat = mood === 'mørk' ? between(12, 32) : mood === 'mellom' ? between(22, 46) : between(18, 48)
  // Nedre grense for «mellom» er 62: under det klarer ikke engang ren svart tekst
  // 4,5:1 mot flaten, og da finnes ingen lesbar palett.
  const paperL = mood === 'mørk' ? between(8, 20) : mood === 'mellom' ? between(62, 78) : between(84, 95)
  const lysFlate = paperL > 50
  const paper = hslToHex({ h: hue, s: surfaceSat, l: paperL })
  const raised = hslToHex({ h: hue, s: surfaceSat * 0.7, l: lysFlate ? paperL + 3 : paperL + 5 })
  const sunken = hslToHex({ h: hue, s: surfaceSat, l: lysFlate ? paperL - 3 : paperL + 2.5 })
  const band = hslToHex({ h: hue, s: surfaceSat * 1.1, l: lysFlate ? paperL - 7 : paperL + 8 })

  // Aksenten: enten i slekt med sideflaten (rolig) eller i kontrast (markant).
  const accentHue = (hue + pick([28, -28, 150, 180, 210])) % 360
  const rawAccent = hslToHex({ h: accentHue, s: between(58, 84), l: dark ? between(52, 64) : between(44, 56) })
  const { accent, onEmber } = makeAccentLegible(rawAccent)
  const accentDeep = hslToHex({ ...hexToHsl(accent), l: hexToHsl(accent).l - (dark ? 8 : 10) })
  // Merkelapp-flaten må skille seg fra sideflaten uten å skrike — derfor legges
  // den relativt til den, ikke på en fast lyshet.
  const tintL = mood === 'mørk' ? 19 : mood === 'mellom' ? paperL + 16 : 93
  const tintBg = hslToHex({ h: accentHue, s: between(24, 40), l: tintL })
  const tintBorder = hslToHex({ h: accentHue, s: between(28, 46), l: mood === 'mellom' ? paperL + 6 : dark ? 29 : 83 })

  // Tekst deler kulør med sideflaten, men MYE lavere metning — ellers blir en
  // kraftig tonet flate til farget tekst, som leses dårlig og ser billig ut.
  // CenterForges egen tekst (#1C1A16) og dempede tekst (#5E564A) ligger begge
  // rundt 12 % metning, mot sideflatens 45.
  const textSat = between(6, 16)
  // Mot en mellomtonet flate må teksttrappen komprimeres mot det mørke — dempet
  // tekst på L 38 mot en flate på L 70 gir bare 2,3:1. ensureContrast redder
  // resten, men den bør ikke måtte flytte fargene langt.
  const textL =
    mood === 'mørk' ? [96, 84, 70, 56]
    : mood === 'mellom' ? [6, 15, 24, 34]
    : [10, 24, 38, 54]
  const ink = hslToHex({ h: hue, s: textSat, l: textL[0] })
  const inkSoft = hslToHex({ h: hue, s: textSat * 0.9, l: textL[1] })
  const muted = hslToHex({ h: hue, s: textSat * 0.8, l: textL[2] })
  const faint = hslToHex({ h: hue, s: textSat * 0.7, l: textL[3] })

  // Kanter ligger mellom flate og tekst, både i lyshet og metning.
  const borderSat = surfaceSat * 0.45
  const borderL =
    mood === 'mørk' ? [24, 34, 18]
    : mood === 'mellom' ? [paperL - 14, paperL - 24, paperL - 7]
    : [86, 78, 91]
  const border = hslToHex({ h: hue, s: borderSat, l: borderL[0] })
  const borderStrong = hslToHex({ h: hue, s: borderSat, l: borderL[1] })
  const borderFaint = hslToHex({ h: hue, s: borderSat * 0.8, l: borderL[2] })

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
    // Kontrastgarantiene: brødtekst siktes mot 7:1 (AAA) og dempet mot 4,5:1 (AA).
    // AA-gulvet holder ALLTID; AAA nås ikke på de mørkeste mellomtonene, der 7:1
    // er matematisk umulig selv med ren svart tekst. Målt på 800 paletter: 0 under
    // 4,5 — 6 mellom 6,06 og 7.
    '--ink': ensureContrast(ink, paper, 7),
    '--ink-soft': ensureContrast(inkSoft, paper, 5.5),
    '--text-muted': ensureContrast(muted, paper, 4.5),
    '--text-faint': ensureContrast(faint, paper, 3),
    '--ds-border': border,
    '--ds-border-strong': borderStrong,
    '--ds-border-faint': borderFaint,
  }
}
