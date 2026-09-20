'use client'

import Link from 'next/link'
import { CenterForgeLogo } from '@/components/CenterForgeLogo'

// VoiceBank-forsiden fra 20/9: VoiceBank driver ikke stemmeforvaltning, men
// står bak to tjenester for folk som skal feire noe — Sangskaper.no (sangen)
// og Standard Ropert (filmen av sangen). Forsiden peker dit, og ingen andre
// steder (Lars 20/9). Innholdsproduksjon for bedrifter finnes bak innloggingen,
// men selges ikke herfra.
//
// Bruker husets tokens (--paper/--ink/--ember), så VoiceBanks egne farger fra
// tenant-raden slår inn uten hardkoding. Egen vb-navnerom-styling.

const SANS = 'var(--font-hanken), "Avenir Next", system-ui, sans-serif'
const DISPLAY = 'var(--font-archivo), "Avenir Next", system-ui, sans-serif'
const MONO = 'var(--font-cfmono), ui-monospace, SFMono-Regular, Menlo, monospace'

const SANGSKAPER = 'https://sangskaper.no'
const ROPERT = 'https://standardropert.norditech.io'

export default function VoiceBankLanding() {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--paper)', color: 'var(--ink)', fontFamily: SANS }}>
      <style>{`
        .vb-band { max-width: 1020px; margin: 0 auto; padding: 0 28px; }
        .vb-eyebrow { font-family: ${MONO}; font-size: 11.5px; font-weight: 600; letter-spacing: 0.16em; text-transform: uppercase; color: var(--text-faint); margin: 0 0 14px; }
        .vb-h1 { font-family: ${DISPLAY}; font-weight: 800; font-size: clamp(34px, 5.2vw, 58px); letter-spacing: -0.03em; line-height: 1.05; margin: 0 0 18px; text-wrap: balance; }
        .vb-h2 { font-family: ${DISPLAY}; font-weight: 800; font-size: clamp(24px, 3.2vw, 34px); letter-spacing: -0.02em; line-height: 1.15; margin: 0 0 14px; text-wrap: balance; }
        .vb-p { font-size: 17px; line-height: 1.65; color: var(--ink-soft); margin: 0 0 14px; max-width: 34em; }
        .vb-kort { background: var(--paper-raised); border: 1px solid var(--ember-tint-border); border-radius: 12px; padding: 30px; display: flex; flex-direction: column; gap: 12px; }
        .vb-kort h3 { font-family: ${DISPLAY}; font-weight: 800; font-size: 24px; margin: 0; letter-spacing: -0.02em; }
        .vb-kort p { margin: 0; font-size: 16px; line-height: 1.6; color: var(--ink-soft); }
        .vb-kort ul { margin: 4px 0 0; padding-left: 18px; color: var(--ink-soft); font-size: 15px; line-height: 1.7; }
        .vb-g2 { display: grid; grid-template-columns: repeat(2, 1fr); gap: 20px; }
        .vb-g3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 18px; }
        .vb-cta { display: inline-block; padding: 14px 28px; border-radius: 999px; background: var(--ember-deep); color: var(--on-ember) !important; font-weight: 700; font-size: 16px; text-decoration: none; }
        .vb-cta:hover { filter: brightness(0.93); }
        .vb-ghost { display: inline-block; padding: 13px 22px; border-radius: 999px; border: 1.5px solid var(--ember-tint-border); color: var(--ink); font-weight: 600; font-size: 15px; text-decoration: none; background: var(--paper-raised); }
        .vb-ghost:hover { border-color: var(--ember-deep); color: var(--ember-deep); }
        .vb-navlenke { color: var(--text-muted); font-size: 15px; text-decoration: none; }
        .vb-navlenke:hover { color: var(--ink); }
        .vb-band a:focus-visible { outline: 2px solid var(--ember-deep); outline-offset: 2px; }
        .vb-skille { border: 0; height: 1px; background: var(--ember-tint-border); margin: 0; }
        .vb-steg { background: var(--paper-raised); border: 1px solid var(--ember-tint-border); border-radius: 10px; padding: 22px; }
        .vb-steg .nr { font-family: ${MONO}; font-size: 12px; font-weight: 700; letter-spacing: 0.14em; color: var(--ember-deep); margin-bottom: 8px; }
        .vb-steg h4 { font-family: ${DISPLAY}; font-weight: 700; font-size: 17px; margin: 0 0 6px; }
        .vb-steg p { margin: 0; font-size: 15px; line-height: 1.6; color: var(--ink-soft); }
        .vb-pris { font-family: ${MONO}; font-size: 13px; color: var(--text-faint); }
        @media (max-width: 720px) { .vb-g2, .vb-g3 { grid-template-columns: 1fr; } }
      `}</style>

      {/* Header */}
      <header className="vb-band" style={{ display: 'flex', alignItems: 'center', gap: 14, paddingTop: 22, paddingBottom: 22, flexWrap: 'wrap' }}>
        <CenterForgeLogo size={30} wordmarkSize={20} />
        <nav style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
          <a href={SANGSKAPER} className="vb-navlenke">Sangskaper</a>
          <a href={ROPERT} className="vb-navlenke">Ropert</a>
          <Link href="/login" className="vb-ghost" style={{ padding: '9px 18px', fontSize: 14 }}>Logg inn</Link>
        </nav>
      </header>

      <hr className="vb-skille" />

      {/* Hero */}
      <section className="vb-band" style={{ paddingTop: 72, paddingBottom: 56 }}>
        <p className="vb-eyebrow">VoiceBank</p>
        <h1 className="vb-h1">Lag sangen. Lag filmen.<br />Del festen.</h1>
        <p className="vb-p" style={{ fontSize: 19 }}>
          VoiceBank står bak to tjenester for alle som skal feire noe: <strong>Sangskaper</strong> lager
          en sang med navnet til den det gjelder, og <strong>Ropert</strong> gjør sangen til film,
          invitasjon eller hilsen. Ingen forkunnskaper. Ferdig på minutter.
        </p>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 24 }}>
          <a href={SANGSKAPER} className="vb-cta">Lag en sang</a>
          <a href={ROPERT} className="vb-ghost">Lag en film</a>
        </div>
      </section>

      <hr className="vb-skille" />

      {/* De to tjenestene */}
      <section className="vb-band" style={{ paddingTop: 56, paddingBottom: 56 }}>
        <div className="vb-g2">
          <article className="vb-kort">
            <p className="vb-eyebrow" style={{ margin: 0 }}>Sangskaper.no</p>
            <h3>En sang med navnet i</h3>
            <p>
              Skriv hvem det er til og hva anledningen er, så får du en ferdig sang der navnet
              synges. Hør den før du bestemmer deg.
            </p>
            <ul>
              <li>Bursdag, utdrikningslag, firmafest, konfirmasjon</li>
              <li>Prøv gratis, betal når du vil laste ned</li>
              <li>Logg inn med Vipps</li>
            </ul>
            <p className="vb-pris">298 kr per sang</p>
            <div style={{ marginTop: 6 }}><a href={SANGSKAPER} className="vb-cta">Gå til Sangskaper</a></div>
          </article>

          <article className="vb-kort">
            <p className="vb-eyebrow" style={{ margin: 0 }}>Standard Ropert</p>
            <h3>Sangen blir film</h3>
            <p>
              Last opp sangen og noen bilder, skriv et par linjer, og få en film du kan sende
              som invitasjon eller hilsen. Passer alle anledninger, fra bursdag til julebord.
            </p>
            <ul>
              <li>Invitasjon, hilsen eller kunngjøring</li>
              <li>Tre omgjøringer inkludert</li>
              <li>Last ned og del der du vil</li>
            </ul>
            <p className="vb-pris">149 kr per film</p>
            <div style={{ marginTop: 6 }}><a href={ROPERT} className="vb-cta">Gå til Ropert</a></div>
          </article>
        </div>
      </section>

      <hr className="vb-skille" />

      {/* Slik henger de sammen */}
      <section className="vb-band" style={{ paddingTop: 56, paddingBottom: 56 }}>
        <p className="vb-eyebrow">Slik henger de sammen</p>
        <h2 className="vb-h2">Fra navn til ferdig film i tre steg</h2>
        <div className="vb-g3" style={{ marginTop: 26 }}>
          <div className="vb-steg">
            <div className="nr">01</div>
            <h4>Lag sangen</h4>
            <p>På Sangskaper. Navn, anledning, stil. Hør den, og last ned når du er fornøyd.</p>
          </div>
          <div className="vb-steg">
            <div className="nr">02</div>
            <h4>Ta med sangen</h4>
            <p>Last sangen opp i Ropert sammen med bilder av den det gjelder.</p>
          </div>
          <div className="vb-steg">
            <div className="nr">03</div>
            <h4>Få filmen</h4>
            <p>Ropert lager filmen med sangen som lydspor. Del den på minutter.</p>
          </div>
        </div>
        <p className="vb-p" style={{ marginTop: 22, fontSize: 15 }}>
          Du kan også bruke Ropert uten Sangskaper, med egen musikk eller bare tekst.
        </p>
      </section>

      <hr className="vb-skille" />

      {/* Om VoiceBank */}
      <section className="vb-band" style={{ paddingTop: 56, paddingBottom: 64 }}>
        <p className="vb-eyebrow">Om VoiceBank</p>
        <h2 className="vb-h2">Et norsk selskap for feiringer som skal huskes</h2>
        <p className="vb-p">
          VoiceBank AS står bak Sangskaper og Ropert, i samarbeid med Festmagasinet Standard.
          Teknologien leveres av Norditech.
        </p>
        <p className="vb-p" style={{ fontSize: 15 }}>
          Bedrift som trenger innhold til egne kanaler? <Link href="/login" style={{ color: 'var(--ember-deep)' }}>Logg inn</Link> for å ta i bruk verktøyet.
        </p>
      </section>

      <hr className="vb-skille" />

      {/* Footer */}
      <footer className="vb-band" style={{ paddingTop: 36, paddingBottom: 56, display: 'flex', gap: 22, flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontFamily: MONO, fontSize: 13, color: 'var(--text-faint)' }}>© {new Date().getFullYear()} VoiceBank AS</span>
        <a href={SANGSKAPER} className="vb-navlenke" style={{ fontSize: 14 }}>Sangskaper</a>
        <a href={ROPERT} className="vb-navlenke" style={{ fontSize: 14 }}>Ropert</a>
        <Link href="/privacy" className="vb-navlenke" style={{ fontSize: 14 }}>Personvern</Link>
        <Link href="/terms" className="vb-navlenke" style={{ fontSize: 14 }}>Vilkår</Link>
        <Link href="/login" className="vb-navlenke" style={{ fontSize: 14 }}>Logg inn</Link>
      </footer>
    </div>
  )
}
