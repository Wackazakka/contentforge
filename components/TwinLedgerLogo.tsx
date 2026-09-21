'use client'

// TwinLedger-ordmerket (Claude Design, runde 3 — implementert 21.09.2026).
//
// 🔑 DOBBELTSTREKEN ER IKKE DEKORASJON. I bokføring betyr en dobbel strek at
// summen over er endelig. Det er hele produktets påstand, tegnet: hver bruk
// føres, og streken under er at den er gjort opp. Samme grep gjentas på alle
// summer i tjenesten — se `Dobbeltstrek` nederst.
//
// ⚠️ TO EGNE ELEMENTER, IKKE `border-bottom: double`. En double-kant kan ikke
// styres per størrelse: tykkelsen og mellomrommet følger hverandre, og under
// ~15px kollapser den til noe grumsete. Her skaleres begge to hver for seg,
// etter tabellen designet oppgir.

/** Optiske steg fra designet. Verdiene er tegnet, ikke regnet — derfor en
 *  tabell og ikke en formel. Nærmeste steg vinner. */
const STEG = [
  { ord: 11, strek: 1, mellom: 1, gap: 3 },
  { ord: 15, strek: 1.5, mellom: 1.5, gap: 4 },
  { ord: 22, strek: 2, mellom: 2, gap: 5 },
  { ord: 34, strek: 2.5, mellom: 2.5, gap: 7 },
] as const

function steg(ord: number) {
  return STEG.reduce((naermest, s) =>
    Math.abs(s.ord - ord) < Math.abs(naermest.ord - ord) ? s : naermest)
}

export type LogoVariant = 'default' | 'dark' | 'ember' | 'mono'

const FARGER: Record<LogoVariant, { ord: string; strek: string }> = {
  // Standard: blekk på papir, streker i ember.
  default: { ord: 'var(--ink)', strek: 'var(--ember-deep)' },
  // På mørk flate må streken lysne, ellers forsvinner den i bakgrunnen.
  dark: { ord: 'var(--paper)', strek: 'var(--ember)' },
  // Oppå en ember-flate kan streken ikke være ember. Alt blir --on-ember.
  ember: { ord: 'var(--on-ember)', strek: 'var(--on-ember)' },
  // Énfarget, til trykk og signaturer.
  mono: { ord: 'var(--ink)', strek: 'var(--ink)' },
}

export function TwinLedgerLogo({
  size = 22,
  variant = 'default',
  navn = 'TwinLedger',
}: {
  /** Ordmerkets fontstørrelse i px. Strekene skalerer med. */
  size?: number
  variant?: LogoVariant
  /** Overstyres kun av en white-label som har eget navn i samme form. */
  navn?: string
}) {
  const s = steg(size)
  const f = FARGER[variant]
  return (
    <span style={{ display: 'inline-flex', flexDirection: 'column', gap: s.gap }} aria-label={navn}>
      <span style={{
        fontFamily: 'var(--font-archivo), "Avenir Next", system-ui, sans-serif',
        fontWeight: 800,
        fontSize: size,
        lineHeight: 1,
        letterSpacing: '-0.035em',
        color: f.ord,
        whiteSpace: 'nowrap',
      }}>{navn}</span>
      <span style={{ display: 'flex', flexDirection: 'column', gap: s.mellom }} aria-hidden="true">
        <span style={{ height: s.strek, background: f.strek }} />
        <span style={{ height: s.strek, background: f.strek }} />
      </span>
    </span>
  )
}

/**
 * Ikonet: «TL» på blekk, med dobbeltstreken under.
 *
 * ⚠️ UNDER 20px KOLLAPSER STREKEN TIL ÉN. Det er den eneste forenklingen
 * designet tillater — to streker à 1px med 1px mellomrom blir en grå gjørme i
 * favicon-størrelse, og da leser ingen dobbeltstreken uansett.
 */
export function TwinLedgerIkon({ size = 32 }: { size?: number }) {
  const smaa = size < 20
  const strek = Math.max(1, Math.round(size * 0.055))
  return (
    <span style={{
      width: size, height: size, background: 'var(--ink)',
      display: 'inline-flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', gap: size * 0.07,
    }} aria-label="TwinLedger">
      <span style={{
        fontFamily: 'var(--font-archivo), system-ui, sans-serif',
        fontWeight: 800, fontSize: size * 0.42, lineHeight: 1,
        letterSpacing: '-0.04em', color: 'var(--paper)',
      }}>TL</span>
      <span style={{ display: 'flex', flexDirection: 'column', gap: strek, width: size * 0.42 }} aria-hidden="true">
        <span style={{ height: strek, background: 'var(--ember)' }} />
        {!smaa && <span style={{ height: strek, background: 'var(--ember)' }} />}
      </span>
    </span>
  )
}

/**
 * Dobbeltstrek under en sum — samme tegn som i logoen, og av samme grunn.
 *
 * Bokføringens konvensjon: enkel strek FØR summen, dobbel ETTER. Legges som
 * stil på raden som bærer sluttsummen, ikke som et eget element, slik at den
 * følger tabellen om kolonnene endres.
 */
export const dobbeltstrek = (tykk = false) => ({
  borderTop: '1.5px solid var(--ink)',
  borderBottom: `${tykk ? 5 : 3}px double var(--ember-deep)`,
})
