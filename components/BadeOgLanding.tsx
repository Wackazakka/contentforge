'use client'

import Link from 'next/link'

// Både Og-forsiden: STEMMEFORVALTNING, ikke innholdsproduksjon. Visuelt uttrykk
// fra badeog.no (2026-07-29): mørk filmisk flate (#141414), lyseblå aksent
// (#6EC1E4), rosa-rød lenkefarge (#CC3366), Avenir-aktige headinger og
// UPPERCASE avdelingskort med «Les mer >». Egen bo-navnerom-styling —
// tenant-tokens brukes ikke her (de styrer innloggede flater).

const HANKEN = 'var(--font-hanken), "Avenir Next", Avenir, sans-serif'
const ARCHIVO = 'var(--font-archivo), "Avenir Next", sans-serif'

const MORK = '#141414'
const MORKERE = '#0D0D0D'
const KORT = '#1D1D1D'
const HVIT = '#FFFFFF'
const GRA = '#B8B8B8'
const BLA = '#6EC1E4'
const ROSA = '#CC3366'

function Avdelingskort({ tittel, children, href, lenke }: { tittel: string; children: React.ReactNode; href: string; lenke: string }) {
  return (
    <div className="bo-kort">
      <span className="bo-eyebrow">{tittel}</span>
      <p className="bo-kort-tekst">{children}</p>
      <Link href={href} className="bo-lesmer">{lenke} &gt;</Link>
    </div>
  )
}

export default function BadeOgLanding() {
  return (
    <div style={{ minHeight: '100vh', background: MORK, color: HVIT, fontFamily: HANKEN }}>
      <style>{`
        .bo-band { max-width: 1140px; margin: 0 auto; padding: 0 28px; }
        .bo-eyebrow { font-family: ${ARCHIVO}; font-weight: 800; font-size: 15px; letter-spacing: 0.22em; text-transform: uppercase; color: ${BLA}; }
        .bo-kort { background: ${KORT}; border: 1px solid #2A2A2A; border-radius: 6px; padding: 30px 28px; display: flex; flex-direction: column; gap: 14px; }
        .bo-kort-tekst { margin: 0; font-size: 16px; line-height: 1.6; color: ${GRA}; flex: 1; }
        .bo-lesmer { color: ${ROSA}; font-weight: 700; font-size: 15px; text-decoration: none; letter-spacing: 0.02em; }
        .bo-lesmer:hover { color: #E0517F; }
        .bo-cta { display: inline-block; padding: 15px 30px; border-radius: 4px; background: ${ROSA}; color: #fff !important; font-weight: 700; font-size: 16px; text-decoration: none; letter-spacing: 0.02em; transition: background 150ms ease-out; }
        .bo-cta:hover { background: #A82753; }
        .bo-ghost { display: inline-block; padding: 15px 26px; border-radius: 4px; border: 1.5px solid #3A3A3A; color: ${HVIT}; font-weight: 600; font-size: 16px; text-decoration: none; }
        .bo-ghost:hover { border-color: ${BLA}; color: ${BLA}; }
        .bo-band a:focus-visible { outline: 2px solid ${BLA}; outline-offset: 2px; }
        .bo-kortgrid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 18px; }
        .bo-steg { display: grid; grid-template-columns: repeat(3, 1fr); gap: 18px; }
        @media (max-width: 980px) { .bo-kortgrid { grid-template-columns: repeat(2, 1fr); } }
        @media (max-width: 640px) { .bo-kortgrid, .bo-steg { grid-template-columns: 1fr; } }
      `}</style>

      {/* Header */}
      <header className="bo-band" style={{ display: 'flex', alignItems: 'center', gap: 16, paddingTop: 26, paddingBottom: 26 }}>
        {/* Ordmerke i påvente av logofil fra Både Og (håndtegnet original) */}
        <span style={{ fontFamily: ARCHIVO, fontWeight: 800, fontSize: 24, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
          Både&nbsp;Og
        </span>
        <span style={{ background: 'rgba(110,193,228,0.12)', color: BLA, fontSize: 11.5, fontWeight: 700, letterSpacing: '0.18em', borderRadius: 3, padding: '5px 10px', textTransform: 'uppercase' }}>
          Stemmeforvaltning
        </span>
        <nav style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 20 }}>
          <a href="#slik" style={{ color: GRA, fontSize: 15, textDecoration: 'none' }}>Slik virker det</a>
          <Link href="/bli-stemme" style={{ color: GRA, fontSize: 15, textDecoration: 'none' }}>For skuespillere</Link>
          <Link href="/login" className="bo-ghost" style={{ padding: '10px 18px', fontSize: 14 }}>Logg inn</Link>
        </nav>
      </header>

      {/* Hero — mørk med lyseblå radial glød (som badeog.no) */}
      <section style={{ background: `radial-gradient(ellipse at 75% 10%, rgba(110,193,228,0.22) 0%, rgba(110,193,228,0) 55%), ${MORKERE}` }}>
        <div className="bo-band" style={{ padding: '84px 28px 96px' }}>
          <span className="bo-eyebrow">Siden 1989 · Nå med digital stemmeforvaltning</span>
          <h1 style={{ fontFamily: ARCHIVO, fontWeight: 800, fontSize: 'clamp(38px, 5.5vw, 62px)', lineHeight: 1.06, letterSpacing: '-0.01em', margin: '18px 0 22px', maxWidth: 720 }}>
            Stemmene du vil ha.<br />Forvaltet som de fortjener.
          </h1>
          <p style={{ margin: '0 0 34px', fontSize: 19, lineHeight: 1.6, color: GRA, maxWidth: 560 }}>
            Både Og forvalter og tilrettelegger profesjonelle reklamestemmer for radio,
            film og podkast. Hver stemme er klonet med samtykke, hver bruk logges,
            og hver krone honoreres — det er sånn stemmer skal behandles.
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
            <Link href="/login" className="bo-cta">Ta i bruk stemmene</Link>
            <Link href="/bli-stemme" className="bo-ghost">Bli en stemme hos oss</Link>
          </div>
        </div>
      </section>

      {/* Avdelingskortene — badeog.no-mønsteret, men om forvaltning */}
      <section className="bo-band" style={{ padding: '72px 28px' }}>
        <div className="bo-kortgrid">
          <Avdelingskort tittel="Stemmer" href="/login" lenke="Hør utvalget">
            Norges mest erfarne reklamestemmer — profesjonelt klonet og klare
            for din produksjon på minutter, ikke uker.
          </Avdelingskort>
          <Avdelingskort tittel="Forvaltning" href="#slik" lenke="Les mer">
            Samtykke, logging og honorar for hver eneste bruk. Skuespilleren ser
            sin egen kontoutskrift — du ser prisen før du bruker den.
          </Avdelingskort>
          <Avdelingskort tittel="Tilrettelegging" href="#slik" lenke="Les mer">
            Vi klargjør stemmen for formatet ditt og innhenter godkjenning der
            avtalen krever det — uten at du må vente på studiotid.
          </Avdelingskort>
          <Avdelingskort tittel="For skuespillere" href="/bli-stemme" lenke="Bli en stemme">
            Stemmen din kan jobbe når du ikke gjør det. Du bestemmer hvem som
            får bruke den — og tjener på hver bruk.
          </Avdelingskort>
        </div>
      </section>

      {/* Slik virker det */}
      <section id="slik" style={{ background: MORKERE, borderTop: '1px solid #262626', borderBottom: '1px solid #262626' }}>
        <div className="bo-band" style={{ padding: '72px 28px' }}>
          <span className="bo-eyebrow">Slik virker det</span>
          <div className="bo-steg" style={{ marginTop: 28 }}>
            {[
              { n: '01', t: 'Velg stemmen', d: 'Hør prøver og se prisen per bruk — ingen tilbudsrunder, ingen studiobooking.' },
              { n: '02', t: 'Vi tilrettelegger', d: 'Stemmen leses inn på manuset ditt. Krever avtalen godkjenning, innhenter vi den fra skuespilleren — med avtalt frist.' },
              { n: '03', t: 'Bruken logges og honoreres', d: 'Hver leveranse føres i hovedboken: skuespilleren får sitt, du får kvitteringen. Ryddig for alle.' },
            ].map((s) => (
              <div key={s.n} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <span style={{ fontFamily: ARCHIVO, fontWeight: 800, fontSize: 15, color: ROSA, letterSpacing: '0.1em' }}>{s.n}</span>
                <h3 style={{ margin: 0, fontFamily: ARCHIVO, fontWeight: 700, fontSize: 20 }}>{s.t}</h3>
                <p style={{ margin: 0, fontSize: 15.5, lineHeight: 1.6, color: GRA }}>{s.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Avslutnings-CTA */}
      <section className="bo-band" style={{ padding: '72px 28px', textAlign: 'center' }}>
        <h2 style={{ fontFamily: ARCHIVO, fontWeight: 800, fontSize: 'clamp(26px, 3.5vw, 38px)', margin: '0 0 14px' }}>
          Trenger produksjonen din en stemme?
        </h2>
        <p style={{ margin: '0 auto 30px', fontSize: 17, color: GRA, maxWidth: 480 }}>
          Logg inn for å høre utvalget — eller ta kontakt, så finner vi stemmen sammen.
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, justifyContent: 'center' }}>
          <Link href="/login" className="bo-cta">Logg inn</Link>
          <a href="mailto:post@badeog.no" className="bo-ghost">Kontakt oss</a>
        </div>
      </section>

      {/* Footer */}
      <footer style={{ borderTop: '1px solid #262626' }}>
        <div className="bo-band" style={{ padding: '28px 28px 48px', display: 'flex', flexWrap: 'wrap', gap: '10px 26px', alignItems: 'baseline', justifyContent: 'space-between', fontSize: 14, color: '#7A7A7A' }}>
          <span>Både Og © {new Date().getFullYear()} · Stemmeforvaltning siden 1989</span>
          <span style={{ display: 'flex', gap: 18 }}>
            <Link href="/privacy" style={{ color: '#7A7A7A', textDecoration: 'none' }}>Personvern</Link>
            <Link href="/terms" style={{ color: '#7A7A7A', textDecoration: 'none' }}>Vilkår</Link>
            <span>Powered by Norditech</span>
          </span>
          <span style={{ width: '100%', fontSize: 12.5 }}>
            Stemmene klones og leveres med KI-teknologi — alltid med skuespillerens samtykke, og hver bruk logges og honoreres.
          </span>
        </div>
      </footer>
    </div>
  )
}
