'use client'

import Link from 'next/link'

// Standard Ropert — Standard Festmagasins white-label av Studio, og
// foelgesvennen til Sangskaper.no (avtale 4/9): kunden har laget en sang der,
// og faar den som film/invitasjon her. En ropert er en megafon — navnet
// baerer ideen. Maalgruppen sender saa vidt e-post, saa siden lover bare det
// flyten faktisk gjoer: sang + bilder → film → last ned og del.
// KUN produksjon (twinledger_enabled=false); ingen stemmebank-spraak.
// Fargene speiler tenant-raden (#D4283F). Egen sr-navnerom-styling.

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

// Anledningene paa forsiden (Lars 5/9): papirklipp-illustrasjoner laget med
// samme bildemotor og stil som filmene — kunden ser hva de faar.
// Filene ligger i public/ropert/anledninger/ (720x1080 JPEG).
const ANLEDNINGER: Array<{ key: string; navn: string; linje: string; farge: string }> = [
  { key: 'halloween', navn: 'Halloween', linje: 'Kom utkledd, om du tør', farge: '#5E2C8C' },
  { key: 'jul', navn: 'Jul', linje: 'God jul fra oss', farge: '#B41E2D' },
  { key: 'syttendemai', navn: '17. mai', linje: 'Hurra for dagen', farge: '#BA0C2F' },
  { key: 'bursdag', navn: 'Bursdag', linje: 'Kom og feir med oss', farge: '#FF5C7A' },
  { key: 'bryllup', navn: 'Bryllup', linje: 'Vi gifter oss', farge: '#C8A06E' },
  { key: 'konfirmasjon', navn: 'Konfirmasjon', linje: 'Velkommen til feiringen', farge: '#3C6EC8' },
  { key: 'daap', navn: 'Dåp', linje: 'Velkommen til dåpen', farge: '#8CBEE6' },
  { key: 'paaske', navn: 'Påske', linje: 'God påske', farge: '#F0C830' },
  { key: 'nyttaar', navn: 'Nyttårsaften', linje: 'Godt nytt år', farge: '#B08A2E' },
  { key: 'krepselag', navn: 'Krepselag', linje: 'Ta med egen drikke', farge: '#D4283F' },
  { key: 'julebord', navn: 'Julebord', linje: 'Velkommen til bords', farge: '#2F5A44' },
  { key: 'oktoberfest', navn: 'Oktoberfest', linje: 'Prost!', farge: '#285AC8' },
]

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
        .sr-sang { background: ${KORT}; border: 1px solid ${LINJE}; border-radius: 14px; padding: 26px 30px; display: flex; align-items: center; gap: 22px; flex-wrap: wrap; }
        .sr-sang p { margin: 0; }
        .sr-foot a { color: ${DEMPET}; font-size: 14px; text-decoration: none; }
        .sr-eks { display: grid; grid-template-columns: 300px 1fr; gap: 40px; align-items: center; }
        .sr-tlf { width: 300px; aspect-ratio: 9 / 16; border-radius: 28px; overflow: hidden; background: #14101a; box-shadow: 0 24px 50px -24px rgba(42,21,24,0.55); border: 6px solid #2A1518; }
        .sr-tlf video { width: 100%; height: 100%; object-fit: cover; display: block; }
        @media (max-width: 820px) { .sr-eks { grid-template-columns: 1fr; justify-items: center; text-align: center; } }
        .sr-anl { display: grid; grid-template-columns: repeat(6, 1fr); gap: 14px; }
        .sr-anl-kort { position: relative; border-radius: 12px; overflow: hidden; aspect-ratio: 2 / 3; background: ${LINJE}; box-shadow: 0 10px 26px -18px rgba(42,21,24,0.35); transition: transform 160ms ease-out; }
        .sr-anl-kort:hover { transform: translateY(-4px); }
        .sr-anl-kort img { width: 100%; height: 100%; object-fit: cover; display: block; }
        .sr-anl-tekst { position: absolute; left: 0; right: 0; bottom: 0; padding: 26px 12px 12px; color: #fff; background: linear-gradient(to top, rgba(20,10,20,0.78), rgba(20,10,20,0)); }
        .sr-anl-tekst b { display: block; font-family: ${DISPLAY}; font-size: 16px; letter-spacing: -0.01em; }
        .sr-anl-tekst span { display: block; font-size: 12.5px; opacity: 0.85; margin-top: 2px; }
        @media (max-width: 1000px) { .sr-anl { grid-template-columns: repeat(4, 1fr); } }
        @media (max-width: 640px) { .sr-anl { grid-template-columns: repeat(3, 1fr); gap: 10px; } .sr-anl-tekst b { font-size: 13.5px; } .sr-anl-tekst span { display: none; } }
        .sr-foot a:hover { color: ${ROD}; }
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

      {/* Hero — sangen blir film */}
      <section className="sr-band" style={{ paddingTop: 72, paddingBottom: 56, textAlign: 'center' }}>
        <div style={{ fontSize: 52, marginBottom: 14 }} aria-hidden="true">📣</div>
        <h1 style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 'clamp(36px, 5.6vw, 58px)', lineHeight: 1.04, letterSpacing: '-0.03em', margin: '0 auto 20px', maxWidth: 760, textWrap: 'balance' }}>
          Har du laget en sang?<br />Gjør den til en film.
        </h1>
        <p className="sr-p" style={{ fontSize: 19, margin: '0 auto 30px', maxWidth: '32em' }}>
          Last opp sangen fra Sangskaper, legg til noen bilder, og få en film du kan sende til
          alle du vil invitere eller gratulere. Du forteller hva som skjer; Roperten setter det sammen.
        </p>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
          <Link href="/register" className="sr-cta">Kom i gang</Link>
          <a href="#slik" className="sr-ghost">Se hvordan</a>
        </div>
      </section>

      {/* Anledningene — papirklipp fra samme motor som filmene */}
      <section className="sr-band" style={{ paddingBottom: 64 }}>
        <h2 className="sr-h2" style={{ textAlign: 'center' }}>Til alt som feires</h2>
        <p className="sr-p" style={{ textAlign: 'center', margin: '0 auto 26px' }}>
          Hver anledning har sin egen palett og sine egne illustrasjoner. Velg din, så ser filmen ut som den hører til.
        </p>
        <div className="sr-anl">
          {ANLEDNINGER.map((a) => (
            <Link key={a.key} href={`/register?next=${encodeURIComponent(`/dashboard?ny=${a.key}`)}`} className="sr-anl-kort" style={{ background: a.farge }} aria-label={a.navn}
              onClick={() => { try { localStorage.setItem('ropert.ny', a.key) } catch { /* privat modus */ } }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/ropert/anledninger/${a.key}.jpg`} alt={a.navn} loading="lazy" />
              <div className="sr-anl-tekst"><b>{a.navn}</b><span>{a.linje}</span></div>
            </Link>
          ))}
        </div>
      </section>

      <hr className="sr-rule" />

      {/* Eksempelfilm — Lars' Halloween-film, laget i produktet 5/9 */}
      <section className="sr-band" style={{ paddingBottom: 72 }}>
        <div className="sr-eks">
          <div className="sr-tlf">
            <video controls playsInline preload="none" poster="/ropert/halloween-eksempel.jpg" src="/ropert/halloween-eksempel.mp4" />
          </div>
          <div>
            <h2 className="sr-h2">Slik ser en ferdig film ut</h2>
            <p className="sr-p">
              En Halloween-invitasjon laget i Roperten på noen minutter: sangen fra Sangskaper, svarene fra skjemaet som
              plakater, papirklipp-illustrasjoner i Halloween-farger, og klipp i takt med musikken. Ett minutt, klar til å sende.
            </p>
            <Link href="/register" className="sr-cta">Lag din egen</Link>
          </div>
        </div>
      </section>

      {/* Tre anledninger */}
      <section className="sr-band" style={{ paddingBottom: 56 }}>
        <div className="sr-g3">
          <div className="sr-kort">
            <h3>💌 Invitasjoner</h3>
            <p>Bursdag, bryllup, konfirmasjon eller krepselag i gata — en invitasjon med sangen deres under, som folk faktisk ser på.</p>
          </div>
          <div className="sr-kort">
            <h3>🎉 Gratulasjoner</h3>
            <p>En hilsen som er mer enn en melding. Sangen du lagde, bildene deres, og et par ord til dagen.</p>
          </div>
          <div className="sr-kort">
            <h3>📣 Kunngjøringer</h3>
            <p>Babyen som kom, flyttingen, de nygifte — fortell det til alle på én gang, med musikk.</p>
          </div>
        </div>
      </section>

      {/* Ingen sang ennaa? → Sangskaper */}
      <section className="sr-band" style={{ paddingBottom: 72 }}>
        <div className="sr-sang">
          <span style={{ fontSize: 38 }} aria-hidden="true">🎵</span>
          <div style={{ flex: 1, minWidth: 240 }}>
            <p style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 18, marginBottom: 4 }}>Ingen sang ennå?</p>
            <p className="sr-p" style={{ margin: 0, fontSize: 15.5 }}>
              Lag én på Sangskaper.no på noen minutter — til bursdagen, utdrikningslaget eller konfirmasjonen.
              Last den ned derfra, og ta den med hit.
            </p>
          </div>
          <a href="https://sangskaper.no" target="_blank" rel="noopener noreferrer" className="sr-ghost">Til Sangskaper.no →</a>
        </div>
      </section>

      <hr className="sr-rule" />

      {/* Slik virker det */}
      <section id="slik" className="sr-band" style={{ paddingTop: 72, paddingBottom: 72 }}>
        <h2 className="sr-h2">Tre steg, noen minutter</h2>
        <div className="sr-steg" style={{ marginTop: 26 }}>
          <div className="sr-kort">
            <div className="sr-nr">1</div>
            <h3>Last opp sangen</h3>
            <p>MP3-fila fra Sangskaper, eller en annen sang du har lov til å bruke. Filmen blir like lang som sangen.</p>
          </div>
          <div className="sr-kort">
            <div className="sr-nr">2</div>
            <h3>Legg til bilder og et par ord</h3>
            <p>Bilder fra telefonen, og to setninger om hva som skjer, når og hvor. Har du ingen bilder, lager vi noen som passer.</p>
          </div>
          <div className="sr-kort">
            <div className="sr-nr">3</div>
            <h3>Se filmen og del den</h3>
            <p>Last den ned og send den på Messenger, WhatsApp eller e-post — eller legg den ut på Facebook.</p>
          </div>
        </div>
        <div style={{ marginTop: 34, textAlign: 'center' }}>
          <Link href="/register" className="sr-cta">Lag din første film</Link>
        </div>
      </section>

      <hr className="sr-rule" />

      <footer className="sr-band sr-foot" style={{ paddingTop: 28, paddingBottom: 52, display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontSize: 13.5, color: DEMPET }}>Standard Ropert — fra Standard Festmagasin, i samarbeid med Voice Bank AS</span>
        <Link href="/terms">Vilkår</Link>
        <Link href="/privacy">Personvern</Link>
        <Link href="/login">Logg inn</Link>
      </footer>
    </div>
  )
}
