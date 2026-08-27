'use client'

import Link from 'next/link'

// Standard Ropert — Standard Festmagasins white-label av Studio.
// Kundene er folk og bedrifter med noe aa feire: invitasjoner, gratulasjoner
// og kunngjoeringer. En ropert er en megafon — navnet baerer hele ideen, og
// heroen spiller paa det. KUN produksjon (twinledger_enabled=false paa raden);
// ingen stemmebank-spraak her. Fargene speiler tenant-raden (#D4283F).
// Egen sr-navnerom-styling; tenant-tokens styrer innloggede flater.

const SANS = 'var(--font-hanken), "Avenir Next", system-ui, sans-serif'
const DISPLAY = 'var(--font-archivo), "Avenir Next", system-ui, sans-serif'

const PAPIR = '#FFF9F2'
const KORT = '#FFFFFF'
const BLEKK = '#2A1518'
const DEMPET = '#8A6A6F'
const LINJE = '#F0DFD6'
const ROD = '#D4283F'
const ROD_DYP = '#B01F33'
const GULL = '#E8A33D'

export default function StandardRopertLanding() {
  return (
    <div style={{ minHeight: '100vh', background: PAPIR, color: BLEKK, fontFamily: SANS }}>
      <style>{`
        .sr-band { max-width: 1020px; margin: 0 auto; padding: 0 28px; }
        .sr-h2 { font-family: ${DISPLAY}; font-weight: 800; font-size: clamp(24px, 3.2vw, 34px); letter-spacing: -0.02em; line-height: 1.15; margin: 0 0 14px; text-wrap: balance; }
        .sr-p { font-size: 17px; line-height: 1.65; color: ${DEMPET}; margin: 0 0 14px; max-width: 34em; }
        .sr-kort { background: ${KORT}; border: 1px solid ${LINJE}; border-radius: 10px; padding: 26px; display: flex; flex-direction: column; gap: 9px; box-shadow: 0 8px 24px -18px rgba(42,21,24,0.25); }
        .sr-kort h3 { font-family: ${DISPLAY}; font-weight: 700; font-size: 18px; margin: 0; }
        .sr-kort p { margin: 0; font-size: 15.5px; line-height: 1.6; color: ${DEMPET}; }
        .sr-g3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 18px; }
        .sr-cta { display: inline-block; padding: 15px 30px; border-radius: 999px; background: ${ROD}; color: #fff !important; font-weight: 700; font-size: 16.5px; text-decoration: none; box-shadow: 0 10px 24px -10px rgba(212,40,63,0.55); transition: background 150ms ease-out; }
        .sr-cta:hover { background: ${ROD_DYP}; }
        .sr-ghost { display: inline-block; padding: 14px 24px; border-radius: 999px; border: 1.5px solid ${LINJE}; color: ${BLEKK}; font-weight: 600; font-size: 16px; text-decoration: none; background: ${KORT}; }
        .sr-ghost:hover { border-color: ${ROD}; color: ${ROD}; }
        .sr-band a:focus-visible { outline: 2px solid ${ROD}; outline-offset: 2px; }
        .sr-steg { display: grid; grid-template-columns: repeat(3, 1fr); gap: 18px; }
        .sr-nr { width: 30px; height: 30px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-family: ${DISPLAY}; font-weight: 800; font-size: 14px; color: #fff; background: ${GULL}; }
        .sr-rule { height: 1px; background: ${LINJE}; border: 0; margin: 0; }
        @media (max-width: 820px) { .sr-g3, .sr-steg { grid-template-columns: 1fr; } }
      `}</style>

      {/* Header */}
      <header className="sr-band" style={{ display: 'flex', alignItems: 'center', gap: 12, paddingTop: 24, paddingBottom: 24, flexWrap: 'wrap' }}>
        <span style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 23, letterSpacing: '-0.01em' }}>
          Standard <span style={{ color: ROD }}>Ropert</span>
        </span>
        <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: DEMPET }}>
          fra Standard Festmagasin
        </span>
        <nav style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 18 }}>
          <a href="#slik" style={{ color: DEMPET, fontSize: 15, textDecoration: 'none' }}>Slik virker det</a>
          <Link href="/login" className="sr-ghost" style={{ padding: '9px 18px', fontSize: 14 }}>Logg inn</Link>
        </nav>
      </header>

      <hr className="sr-rule" />

      {/* Hero — roperten sier det hoeyt */}
      <section className="sr-band" style={{ paddingTop: 72, paddingBottom: 64, textAlign: 'center' }}>
        <div style={{ fontSize: 52, marginBottom: 14 }} aria-hidden="true">📣</div>
        <h1 style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 'clamp(36px, 5.6vw, 58px)', lineHeight: 1.04, letterSpacing: '-0.03em', margin: '0 auto 20px', maxWidth: 760, textWrap: 'balance' }}>
          Noe å feire?<br />Si det med stil.
        </h1>
        <p className="sr-p" style={{ fontSize: 19, margin: '0 auto 30px', maxWidth: '32em' }}>
          Invitasjoner, gratulasjoner og kunngjøringer — som video, bilder og tekst, klare til å
          deles. Du forteller hva som skjer; Roperten lager resten.
        </p>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
          <Link href="/register" className="sr-cta">Kom i gang</Link>
          <a href="#slik" className="sr-ghost">Se hvordan</a>
        </div>
      </section>

      {/* Tre anledninger */}
      <section className="sr-band" style={{ paddingBottom: 72 }}>
        <div className="sr-g3">
          <div className="sr-kort">
            <h3>💌 Invitasjoner</h3>
            <p>Bursdag, bryllup, jubileum eller dåp — en invitasjon folk faktisk legger merke til, med video eller bilde.</p>
          </div>
          <div className="sr-kort">
            <h3>🎉 Gratulasjoner</h3>
            <p>En hilsen som er mer enn en melding. Personlig video til dagen, eksamenen eller de nygifte.</p>
          </div>
          <div className="sr-kort">
            <h3>📣 Kunngjøringer</h3>
            <p>Babyen som kom, flyttingen, åpningen av butikken — fortell det til alle på én gang, pent.</p>
          </div>
        </div>
      </section>

      <hr className="sr-rule" />

      {/* Slik virker det */}
      <section id="slik" className="sr-band" style={{ paddingTop: 72, paddingBottom: 72 }}>
        <h2 className="sr-h2">Tre steg, noen minutter</h2>
        <div className="sr-steg" style={{ marginTop: 26 }}>
          <div className="sr-kort">
            <div className="sr-nr">1</div>
            <h3>Fortell om anledningen</h3>
            <p>Hva som feires, hvem det gjelder og når. To setninger holder.</p>
          </div>
          <div className="sr-kort">
            <div className="sr-nr">2</div>
            <h3>Se det bli laget</h3>
            <p>Video, bilder og tekst lages for deg — du ser alt og godkjenner før noe sendes.</p>
          </div>
          <div className="sr-kort">
            <div className="sr-nr">3</div>
            <h3>Del det</h3>
            <p>Rett til Facebook og Instagram, eller last ned og send akkurat dit du vil.</p>
          </div>
        </div>
        <div style={{ marginTop: 34, textAlign: 'center' }}>
          <Link href="/register" className="sr-cta">Lag din første</Link>
        </div>
      </section>

      <hr className="sr-rule" />

      <footer className="sr-band" style={{ paddingTop: 28, paddingBottom: 52, display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontSize: 13.5, color: DEMPET }}>Standard Ropert — fra Standard Festmagasin</span>
        <Link href="/login" style={{ color: DEMPET, fontSize: 14, textDecoration: 'none' }}>Logg inn</Link>
      </footer>
    </div>
  )
}
