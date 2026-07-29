'use client'

import Link from 'next/link'

// Bombaza-forsiden: håndverker-vertikalen ER merket, så bombaza-tenanten får
// denne i stedet for den generiske plattform-landingssiden (gren i app/page.tsx).
// Norsk hardkodet (målgruppen er norsk); egne bz-tokens så tenant-CSS-vars
// ikke trengs utover det som alt ligger i tenants.colors.

const ARCHIVO = 'var(--font-archivo), sans-serif'
const HANKEN = 'var(--font-hanken), sans-serif'
const MONO = 'var(--font-cfmono), monospace'

const BLUE = '#0A5CFF'
const BLUE_DEEP = '#0846C4'
const TINT = '#E5EDFF'
const TINT_BORDER = '#BFD2F8'
const PAPER = '#F6F8FC'
const CARD = '#FFFFFF'
const INK = '#101623'
const INK_SOFT = '#3D4657'
const INK_MUTED = '#6E7889'
const AMBER = '#FFB020'

const FAG = ['Rørlegger', 'Elektriker', 'Snekker', 'Maler', 'Murer', 'Taktekker']

function Fagchip({ label }: { label: string }) {
  return (
    <span style={{ padding: '8px 14px', borderRadius: 999, background: TINT, border: `1px solid ${TINT_BORDER}`, fontFamily: HANKEN, fontSize: 14, color: BLUE_DEEP }}>
      {label}
    </span>
  )
}

function Steg({ n, tittel, children }: { n: number; tittel: string; children: React.ReactNode }) {
  return (
    <div style={{ background: CARD, border: '1px solid #E2E7F0', borderRadius: 18, padding: 26, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 40, height: 40, borderRadius: 999, background: n === 2 ? AMBER : TINT, color: n === 2 ? INK : BLUE_DEEP, fontFamily: ARCHIVO, fontWeight: 800, fontSize: 18 }}>{n}</span>
      <h3 style={{ margin: 0, fontFamily: ARCHIVO, fontWeight: 700, fontSize: 20, color: INK }}>{tittel}</h3>
      <p style={{ margin: 0, fontFamily: HANKEN, fontSize: 15.5, lineHeight: 1.55, color: INK_SOFT }}>{children}</p>
    </div>
  )
}

function Fordel({ tittel, children }: { tittel: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={BLUE} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" style={{ flex: 'none', marginTop: 3 }}><path d="M5 12.5 L10 17 L19 6.5" /></svg>
      <p style={{ margin: 0, fontFamily: HANKEN, fontSize: 15.5, lineHeight: 1.55, color: INK_SOFT }}>
        <strong style={{ color: INK }}>{tittel}</strong> {children}
      </p>
    </div>
  )
}

export default function BombazaLanding() {
  return (
    <div style={{ minHeight: '100vh', background: PAPER, color: INK, fontFamily: HANKEN }}>
      <style>{`
        .bz-band { max-width: 1140px; margin: 0 auto; padding: 0 28px; }
        .bz-hero { display: grid; grid-template-columns: 1.1fr 0.9fr; gap: 56px; align-items: center; }
        .bz-steg { display: grid; grid-template-columns: repeat(3, 1fr); gap: 18px; }
        .bz-cta { display: inline-block; padding: 15px 26px; border-radius: 999px; background: ${BLUE}; color: #fff !important; font-family: ${HANKEN}; font-weight: 700; font-size: 16.5px; text-decoration: none; transition: background 150ms ease-out; }
        .bz-cta:hover { background: ${BLUE_DEEP}; }
        .bz-ghost { display: inline-block; padding: 15px 24px; border-radius: 999px; border: 1.5px solid ${TINT_BORDER}; color: ${INK}; font-family: ${HANKEN}; font-weight: 600; font-size: 16.5px; text-decoration: none; }
        .bz-ghost:hover { border-color: ${INK_MUTED}; }
        .bz-band a:focus-visible, .bz-cta:focus-visible, .bz-ghost:focus-visible { outline: 2px solid ${BLUE}; outline-offset: 2px; }
        @media (max-width: 880px) {
          .bz-hero { grid-template-columns: 1fr; gap: 36px; }
          .bz-steg { grid-template-columns: 1fr; }
        }
      `}</style>

      {/* Header */}
      <header className="bz-band" style={{ display: 'flex', alignItems: 'center', gap: 14, paddingTop: 24, paddingBottom: 24 }}>
        <span style={{ fontFamily: ARCHIVO, fontWeight: 800, fontSize: 23, letterSpacing: '-0.02em' }}>
          Bombaza<span style={{ color: BLUE }}>.</span>
        </span>
        <span style={{ background: TINT, color: BLUE_DEEP, fontFamily: HANKEN, fontSize: 12, fontWeight: 600, letterSpacing: '0.05em', borderRadius: 999, padding: '5px 11px' }}>FOR HÅNDVERKERE</span>
        <nav style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 18 }}>
          <Link href="/login" style={{ fontFamily: HANKEN, fontSize: 15, color: INK_SOFT, textDecoration: 'none' }}>Logg inn</Link>
          <Link href="/start" className="bz-cta" style={{ padding: '10px 18px', fontSize: 15 }}>Prøv gratis</Link>
        </nav>
      </header>

      {/* Hero */}
      <section className="bz-band bz-hero" style={{ paddingTop: 48, paddingBottom: 64 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <h1 style={{ margin: 0, fontFamily: ARCHIVO, fontWeight: 800, fontSize: 'clamp(38px, 5.5vw, 58px)', lineHeight: 1.05, letterSpacing: '-0.025em' }}>
            Annonser som skaffer jobber — mens du står i en.
          </h1>
          <p style={{ margin: 0, fontFamily: HANKEN, fontSize: 19, lineHeight: 1.55, color: INK_SOFT, maxWidth: 480 }}>
            Skriv én setning om hva du gjør. Bombaza lager en proff video med ekte
            stemme — og legger den ut på Facebook og Instagram før kaffepausen er over.
            Ingen byrå. Ingen markedsavdeling. Bare jobber.
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, maxWidth: 480 }}>
            {FAG.map((f) => <Fagchip key={f} label={f} />)}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'center' }}>
            <Link href="/start" className="bz-cta">Prøv gratis — uten konto →</Link>
            <a href="#slik" className="bz-ghost">Se hvordan</a>
          </div>
          <p style={{ margin: 0, fontFamily: HANKEN, fontSize: 14.5, color: INK_MUTED }}>
            Gratis i åpningsperioden. Ingen binding — og du ser alltid prisen før noe koster.
          </p>
        </div>

        {/* Eksempel-kort: annonsen slik den ser ut i feeden */}
        <div style={{ justifySelf: 'center', width: 'min(320px, 100%)' }}>
          <div style={{ background: CARD, border: '1px solid #E2E7F0', borderRadius: 20, padding: 16, boxShadow: '0 30px 70px -35px rgba(16,22,35,0.35)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <span style={{ width: 34, height: 34, borderRadius: 999, background: TINT, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontFamily: ARCHIVO, fontWeight: 800, color: BLUE_DEEP }}>BB</span>
              <div>
                <div style={{ fontFamily: HANKEN, fontWeight: 700, fontSize: 14 }}>Bakken Bygg AS</div>
                <div style={{ fontFamily: HANKEN, fontSize: 12, color: INK_MUTED }}>Sponset · Follo</div>
              </div>
            </div>
            <div style={{ position: 'relative', aspectRatio: '4 / 5', borderRadius: 14, overflow: 'hidden', background: `linear-gradient(160deg, ${TINT} 0%, #CFE0FF 55%, ${BLUE} 160%)` }}>
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ width: 54, height: 54, borderRadius: 999, background: 'rgba(255,255,255,0.92)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                  <svg width="16" height="18" viewBox="0 0 11 12"><path d="M0 0 L11 6 L0 12 Z" fill={BLUE_DEEP} /></svg>
                </span>
              </div>
              <div style={{ position: 'absolute', left: 14, right: 14, bottom: 12, fontFamily: ARCHIVO, fontWeight: 800, fontSize: 19, lineHeight: 1.2, color: '#fff', textShadow: '0 2px 16px rgba(16,22,35,0.5)' }}>
                Vi legger varmekabler i hele Follo
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12 }}>
              <span style={{ fontFamily: MONO, fontSize: 11, letterSpacing: '0.08em', color: INK_MUTED }}>VIDEO · 18 SEK · EKTE STEMME</span>
              <span style={{ marginLeft: 'auto', fontFamily: HANKEN, fontSize: 13, fontWeight: 700, color: BLUE }}>Få tilbud</span>
            </div>
          </div>
          <p style={{ textAlign: 'center', fontFamily: HANKEN, fontSize: 13, color: INK_MUTED, margin: '14px 0 0' }}>
            Laget av én setning. Eksempel — firmaet er oppdiktet.
          </p>
        </div>
      </section>

      {/* Mer enn en bildeannonse */}
      <section className="bz-band" style={{ paddingTop: 56, paddingBottom: 56, borderTop: '1px solid #E2E7F0' }}>
        <h2 style={{ margin: '0 0 8px', fontFamily: ARCHIVO, fontWeight: 800, fontSize: 'clamp(26px, 3.6vw, 36px)', letterSpacing: '-0.02em' }}>
          Andre gir deg en bildeannonse. Du får en produksjon.
        </h2>
        <p style={{ margin: '0 0 26px', fontFamily: HANKEN, fontSize: 17, color: INK_SOFT, maxWidth: 560 }}>
          Kundene stopper for video, ikke for stillbilder med tekst på.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 640 }}>
          <Fordel tittel="Video med bevegelse og lyd,">ikke bare et bilde — laget ferdig med manus, bilder og musikk.</Fordel>
          <Fordel tittel="Ekte, lisensierte stemmer">leser budskapet ditt — du hører resultatet før du godkjenner.</Fordel>
          <Fordel tittel="Flere kanaler enn Facebook og Instagram:">også LinkedIn og YouTube, når det passer bedriftskunder.</Fordel>
          <Fordel tittel="Kalender og planlegging">— legg opp ukens innlegg søndag kveld, så går de ut av seg selv.</Fordel>
          <Fordel tittel="Artikler i tillegg til annonser,">for deg som vil vises i søk også.</Fordel>
        </div>
      </section>

      {/* Slik gjør du det */}
      <section id="slik" className="bz-band" style={{ paddingTop: 56, paddingBottom: 64, borderTop: '1px solid #E2E7F0' }}>
        <h2 style={{ margin: '0 0 26px', fontFamily: ARCHIVO, fontWeight: 800, fontSize: 'clamp(26px, 3.6vw, 36px)', letterSpacing: '-0.02em' }}>
          Tre steg. Under ti minutter.
        </h2>
        <div className="bz-steg">
          <Steg n={1} tittel="Si hva du gjør">
            «Vi legger varmekabler i hele Follo. Gratis befaring.» Én setning holder —
            du trenger ikke skrive annonsetekst.
          </Steg>
          <Steg n={2} tittel="Se og godkjenn">
            Du får videoen ferdig med stemme og bilder. Bytt det du vil. Prisen står
            synlig hele veien — ingenting koster før du sier ja.
          </Steg>
          <Steg n={3} tittel="Publiser der kundene er">
            Rett til Facebook og Instagram — nå, eller planlagt når folk er hjemme
            fra jobb.
          </Steg>
        </div>
        <div style={{ marginTop: 34, display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'center' }}>
          <Link href="/start" className="bz-cta">Prøv gratis — uten konto →</Link>
          <Link href="/register" className="bz-ghost">Registrer bedriften</Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="bz-band" style={{ borderTop: '1px solid #E2E7F0', paddingTop: 26, paddingBottom: 48, display: 'flex', flexWrap: 'wrap', gap: '10px 26px', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <span style={{ fontFamily: MONO, fontSize: 11.5, letterSpacing: '0.04em', color: INK_MUTED }}>
          Bombaza © {new Date().getFullYear()} · Powered by Norditech
        </span>
        <span style={{ display: 'flex', gap: 18 }}>
          <Link href="/privacy" style={{ fontFamily: HANKEN, fontSize: 14, color: INK_SOFT, textDecoration: 'none' }}>Personvern</Link>
          <Link href="/terms" style={{ fontFamily: HANKEN, fontSize: 14, color: INK_SOFT, textDecoration: 'none' }}>Vilkår</Link>
        </span>
        <span style={{ width: '100%', fontFamily: HANKEN, fontSize: 13, color: INK_MUTED }}>
          Innholdet lages med KI-verktøy ut fra teksten du skriver — du ser og godkjenner alt før det publiseres.
        </span>
      </footer>
    </div>
  )
}
