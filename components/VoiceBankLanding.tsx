'use client'

import Link from 'next/link'
import { CenterForgeLogo } from '@/components/CenterForgeLogo'

// VoiceBank-forsiden: RETTIGHETSFORVALTNING, ikke innholdsproduksjon.
// Målgruppen er BYRÅER som skal lisensiere plattformen (Både Og, Pullman) —
// ikke sluttkunder som skal lage en video. Sluttkundene ser byråets merke.
//
// Visuell idé: en HOVEDBOK. Linjert flate, blekk, tabellsifre. Bevisst motsatt
// av bransjens standard (mørk side med neon bølgeform) og av de to andre
// forsidene våre — Både Og er mørk filmisk, Bombaza er elektrisk blå.
// Egen vb-navnerom-styling; tenant-tokens styrer innloggede flater, ikke denne.

const SANS = 'var(--font-hanken), "Avenir Next", Avenir, system-ui, sans-serif'
const DISPLAY = 'var(--font-archivo), "Avenir Next", system-ui, sans-serif'
const MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace'

const PAPIR = '#F2F4F8'
const PAPIR_HEV = '#FFFFFF'
const BLEKK = '#14161C'
const DEMPET = '#5A6272'
const LINJE = '#D9DEE7'
const INDIGO = '#4338CA'
const BOK = '#1F6F5C'

export default function VoiceBankLanding() {
  return (
    <div style={{ minHeight: '100vh', background: PAPIR, color: BLEKK, fontFamily: SANS }}>
      <style>{`
        .vb-band { max-width: 1080px; margin: 0 auto; padding: 0 28px; }
        .vb-eyebrow { font-family: ${MONO}; font-size: 11.5px; font-weight: 600; letter-spacing: 0.16em; text-transform: uppercase; color: ${DEMPET}; }
        .vb-h2 { font-family: ${DISPLAY}; font-weight: 800; font-size: clamp(24px, 3.2vw, 34px); letter-spacing: -0.02em; line-height: 1.15; margin: 0 0 14px; text-wrap: balance; }
        .vb-p { font-size: 17px; line-height: 1.65; color: ${DEMPET}; margin: 0 0 14px; max-width: 34em; }
        .vb-kort { background: ${PAPIR_HEV}; border: 1px solid ${LINJE}; border-radius: 4px; padding: 26px 26px 28px; display: flex; flex-direction: column; gap: 10px; }
        .vb-kort h3 { font-family: ${DISPLAY}; font-weight: 700; font-size: 17px; margin: 0; letter-spacing: -0.01em; }
        .vb-kort p { margin: 0; font-size: 15.5px; line-height: 1.6; color: ${DEMPET}; }
        .vb-grid3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 18px; }
        .vb-grid2 { display: grid; grid-template-columns: repeat(2, 1fr); gap: 18px; }
        .vb-cta { display: inline-block; padding: 14px 28px; border-radius: 4px; background: ${INDIGO}; color: #fff !important; font-weight: 700; font-size: 16px; text-decoration: none; transition: background 150ms ease-out; }
        .vb-cta:hover { background: #372CA8; }
        .vb-ghost { display: inline-block; padding: 14px 24px; border-radius: 4px; border: 1.5px solid ${LINJE}; color: ${BLEKK}; font-weight: 600; font-size: 16px; text-decoration: none; }
        .vb-ghost:hover { border-color: ${INDIGO}; color: ${INDIGO}; }
        .vb-band a:focus-visible, .vb-tabell a:focus-visible { outline: 2px solid ${INDIGO}; outline-offset: 2px; }
        .vb-navlenke { color: ${DEMPET}; font-size: 15px; text-decoration: none; }
        .vb-navlenke:hover { color: ${BLEKK}; }

        /* Hovedboken — det visuelle hjertet */
        .vb-bokramme { background: ${PAPIR_HEV}; border: 1px solid ${LINJE}; border-radius: 4px; overflow-x: auto; }
        .vb-tabell { width: 100%; border-collapse: collapse; font-size: 15px; min-width: 560px; }
        .vb-tabell th { font-family: ${MONO}; font-size: 10.5px; font-weight: 600; letter-spacing: 0.14em; text-transform: uppercase; color: ${DEMPET}; text-align: left; padding: 14px 20px; border-bottom: 1px solid ${LINJE}; }
        .vb-tabell td { padding: 15px 20px; border-bottom: 1px solid ${LINJE}; }
        .vb-tabell tr:last-child td { border-bottom: 0; }
        .vb-tall { font-variant-numeric: tabular-nums; text-align: right; }
        .vb-ut { color: ${BOK}; font-weight: 700; }

        .vb-skille { height: 1px; background: ${LINJE}; border: 0; margin: 0; }
        @media (max-width: 860px) { .vb-grid3, .vb-grid2 { grid-template-columns: 1fr; } }
      `}</style>

      {/* Header */}
      <header className="vb-band" style={{ display: 'flex', alignItems: 'center', gap: 14, paddingTop: 24, paddingBottom: 24, flexWrap: 'wrap' }}>
        {/* Tenant-logoen naar den finnes; komponenten faller selv tilbake til
            ordmerke. Egen tegnet tekst her ville ignorert merkevaren tenanten
            faktisk har lastet opp. */}
        <CenterForgeLogo size={30} wordmarkSize={20} />
        <span style={{ background: 'rgba(67,56,202,0.09)', color: INDIGO, fontFamily: MONO, fontSize: 10.5, fontWeight: 600, letterSpacing: '0.16em', borderRadius: 3, padding: '5px 9px', textTransform: 'uppercase' }}>
          Rettighetsforvaltning
        </span>
        <nav style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 20 }}>
          <a href="#hovedbok" className="vb-navlenke">Slik virker det</a>
          <Link href="/bli-stemme" className="vb-navlenke">For rettighetshavere</Link>
          <Link href="/login" className="vb-ghost" style={{ padding: '9px 18px', fontSize: 14 }}>Logg inn</Link>
        </nav>
      </header>

      <hr className="vb-skille" />

      {/* Hero — tesen, ikke teknologien */}
      <section className="vb-band" style={{ paddingTop: 72, paddingBottom: 64 }}>
        <p className="vb-eyebrow" style={{ margin: '0 0 20px' }}>For byråer som forvalter stemmer og ansikter</p>
        <h1 style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 'clamp(34px, 5.4vw, 56px)', lineHeight: 1.05, letterSpacing: '-0.03em', margin: '0 0 22px', maxWidth: 800, textWrap: 'balance' }}>
          Stemmen tilhører et menneske.<br />Vi sørger for at de får betalt<br />hver gang den brukes.
        </h1>
        <p className="vb-p" style={{ fontSize: 19, maxWidth: '36em' }}>
          VoiceBank er hovedboken for syntetiske stemmer og ansikter. Hver eneste bruk føres i
          det øyeblikket den skjer — hvem kjennetegnet tilhører, hva kunden betalte, og hva
          rettighetshaveren skal ha.
        </p>
        <p style={{ fontSize: 16, lineHeight: 1.6, color: DEMPET, margin: '18px 0 0', maxWidth: '36em' }}>
          Produksjonsverktøyet <strong style={{ color: BLEKK, fontWeight: 700 }}>VoiceBank&nbsp;Studio</strong> følger
          med — video, artikler og publisering, med eller uten en rettighetshavers stemme.
        </p>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 28 }}>
          <Link href="/white-label" className="vb-cta">Bli partner</Link>
          <a href="#hovedbok" className="vb-ghost">Se hvordan det føres</a>
        </div>
      </section>

      {/* Hovedboken — produktet i ett blikk */}
      <section id="hovedbok" className="vb-band" style={{ paddingBottom: 72 }}>
        <p className="vb-eyebrow" style={{ margin: '0 0 12px' }}>Hovedboken</p>
        <h2 className="vb-h2">Én bruk, én linje, umiddelbart</h2>
        <p className="vb-p" style={{ marginBottom: 26 }}>
          Ingen rekonstruerer i etterkant hvor mange ganger en stemme ble brukt. Det står i boka
          — og det er derfor et menneske kan si ja til dette uten å måtte stole på noen.
        </p>
        <div className="vb-bokramme">
          <table className="vb-tabell">
            <thead>
              <tr>
                <th>Bruk</th>
                <th>Rettighetshaver</th>
                <th className="vb-tall">Fra kunden</th>
                <th className="vb-tall">Til rettighetshaver</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Radiospot</td>
                <td>Stemme</td>
                <td className="vb-tall">400,00</td>
                <td className="vb-tall vb-ut">150,00</td>
              </tr>
              <tr>
                <td>Boligvideo</td>
                <td>Stemme</td>
                <td className="vb-tall">250,00</td>
                <td className="vb-tall vb-ut">120,00</td>
              </tr>
              <tr>
                <td>Annonsebilde</td>
                <td>Ansikt</td>
                <td className="vb-tall">300,00</td>
                <td className="vb-tall vb-ut">140,00</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p style={{ fontSize: 13.5, color: DEMPET, marginTop: 12, fontFamily: MONO }}>
          Illustrasjon. Satsene settes av den som har avtalen med rettighetshaveren.
        </p>
      </section>

      <hr className="vb-skille" />

      {/* For byråer — hovedmålgruppen */}
      <section className="vb-band" style={{ paddingTop: 72, paddingBottom: 72 }}>
        <p className="vb-eyebrow" style={{ margin: '0 0 12px' }}>For byråer</p>
        <h2 className="vb-h2">Dere eier forholdet. Vi fører regnskapet.</h2>
        <p className="vb-p" style={{ marginBottom: 30 }}>
          Dere inngår avtalene med skuespillerne, blir enige med dem om hva de skal sitte igjen
          med, og beholder kundene deres. Plattformen kjører under deres eget merke og eget
          domene — kundene ser aldri hvem som står bak.
        </p>
        <div className="vb-grid3">
          <div className="vb-kort">
            <h3>Deres satser</h3>
            <p>Dere setter både hva rettighetshaveren får og hva kunden betaler. Vi bestemmer ingen av delene.</p>
          </div>
          <div className="vb-kort">
            <h3>Deres merke</h3>
            <p>Eget navn, egne farger, eget domene. Hele porteføljen tilgjengelig fra første dag.</p>
          </div>
          <div className="vb-kort">
            <h3>Vårt regnskap</h3>
            <p>Logging, avregningsgrunnlag og utbetalingsoversikt per rettighetshaver. Klart til bokføring.</p>
          </div>
        </div>
      </section>

      <hr className="vb-skille" />

      {/* De to produktene */}
      <section className="vb-band" style={{ paddingTop: 72, paddingBottom: 72 }}>
        <p className="vb-eyebrow" style={{ margin: '0 0 12px' }}>To produkter</p>
        <h2 className="vb-h2">Det ene fører regnskap. Det andre lager materialet.</h2>
        <div className="vb-grid2" style={{ marginTop: 26 }}>
          <div className="vb-kort">
            <h3 style={{ color: INDIGO }}>VoiceBank</h3>
            <p>
              Rettighetsforvaltningen. Avtaler og samtykke per rettighetshaver, satser per
              brukstype, godkjenningsflyt, hovedbok og avregning. Stemme og ansikt i samme bok.
            </p>
          </div>
          <div className="vb-kort">
            <h3>VoiceBank Studio</h3>
            <p>
              Produksjonsverktøyet. Video, artikler og annonser med publisering rett til kundens
              egne kanaler. Standardstemmer følger med — rettighetshavere brukes kun når kunden
              velger det.
            </p>
          </div>
        </div>
        <p className="vb-p" style={{ marginTop: 22, fontSize: 15.5 }}>
          De henger sammen, men selges hver for seg. Byråer som bare skal lage innhold trenger
          ingen hovedbok — og skal ikke arve forpliktelsene som følger med den.
        </p>
      </section>

      <hr className="vb-skille" />

      {/* For rettighetshavere — rekrutteringssiden */}
      <section className="vb-band" style={{ paddingTop: 72, paddingBottom: 72 }}>
        <p className="vb-eyebrow" style={{ margin: '0 0 12px' }}>For skuespillere og rettighetshavere</p>
        <h2 className="vb-h2">Du eier stemmen din. Og ansiktet ditt.</h2>
        <p className="vb-p">
          Det samme gjelder begge: stemmen som klones, og ansiktet som blir en digital
          karakter. Én avtale, én kontoutskrift, samme kontroll.
        </p>
        <div className="vb-grid3" style={{ marginTop: 26 }}>
          <div className="vb-kort">
            <h3>Klonen er din</h3>
            <p>Stemmeklonen ligger på din egen konto, ikke vår. Vi har bruksrett — du har eierskapet.</p>
          </div>
          <div className="vb-kort">
            <h3>Du ser hver bruk</h3>
            <p>Kontoutskrift med hva stemmen eller ansiktet er brukt til, når, og hva du har til gode.</p>
          </div>
          <div className="vb-kort">
            <h3>Du kan trekke deg</h3>
            <p>Tilgangen kan trekkes tilbake. Du bestemmer også hvilke bruksområder du sier ja til.</p>
          </div>
        </div>
        <div style={{ marginTop: 30 }}>
          <Link href="/bli-stemme" className="vb-ghost">Bli en stemme i banken</Link>
        </div>
      </section>

      <hr className="vb-skille" />

      {/* Footer */}
      <footer className="vb-band" style={{ paddingTop: 40, paddingBottom: 56, display: 'flex', gap: 22, flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontFamily: MONO, fontSize: 13, color: DEMPET }}>VoiceBank</span>
        <Link href="/for-deg" className="vb-navlenke" style={{ fontSize: 14 }}>Privatperson? Lag noe selv →</Link>
        <Link href="/white-label" className="vb-navlenke" style={{ fontSize: 14 }}>Bli partner</Link>
        <Link href="/login" className="vb-navlenke" style={{ fontSize: 14 }}>Logg inn</Link>
      </footer>
    </div>
  )
}
