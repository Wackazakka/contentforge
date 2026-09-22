import Link from 'next/link'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { getTenant, getTenantCanonicalOrigin } from '@/lib/tenantServer'
import { LangToggle } from '@/components/LangToggle'
import { TwinLedgerLogo } from '@/components/TwinLedgerLogo'

// Norditechs egen dør inn til TwinLedger.
//
// SNUDD 20.09.2026: siden hadde ÉN dør, og den gikk til operatører. Produsenten
// er sluttkunden — byråene er white-labels under oss.
//
// TOSPRÅKLIG 20.09.2026: kopien lå hardkodet engelsk mens tenanten er norsk.
// Nå i messages/*.json under 'twinledger', med språkvelger i toppen.
//
// TO LIKESTILTE DØRER 20.09.2026: rettighetshaveren fantes bare som en lenke i
// menyen, og det er TILBUDSSIDEN som er den bindende skranken.
//
// ═══ REDESIGN 21.09.2026 (Claude Design, «To dører» + «Nøytralt papir») ═══
//
// 🔑 KORTENE ER BORTE. Sida var seks seksjoner med like hvite kort i samme
// rytme — alt fikk lik vekt, og ingenting leste som viktigere enn noe annet.
// Nå er seksjonene HELE FLATER som møtes i en hard kant. Skillet mellom de to
// dørene er en fysisk deling på tvers av siden, ikke to bokser ved siden av
// hverandre.
//
// Formreglene som gjelder hele pakken, og som er lette å bryte uten å merke det:
//   · INGEN border-radius. Alt er firkantet. (Unntak: avspillingsknapper.)
//   · INGEN skygger. Hairline-ramme i stedet.
//   · INGEN emoji.
//   · Summer får DOBBELTSTREK — enkel strek før, dobbel etter, som i bokføring.
//   · Tabeller har mørk hodelinje, og tall høyrestilles med tabular-nums.
//
// ⚠️ PALETTEN LIGGER I tenants.colors, IKKE I globals.css. Designet ba om nye
// verdier i :root, men :root deles av ALLE tenantene — Bombaza og BådeOg
// overstyrer bare --ember*, og CenterForge ingenting. En endring der ville
// byttet drakt på tre andre produkter. tenant.colors er mekanismen som finnes
// for nettopp dette (VoiceBank og PromoMaker bruker den).

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('twinledger')
  // Sida serveres på «/» via omskrivingen i proxy.ts, og kanoniseres dit — ikke
  // til /twinledger, som er en intern sti ingen skal lande på.
  const origin = await getTenantCanonicalOrigin()
  return {
    title: t('meta_title'),
    description: t('meta_description'),
    alternates: { canonical: `${origin}/` },
  }
}

const MONO = 'var(--font-cfmono), ui-monospace, SFMono-Regular, Menlo, monospace'
const DISPLAY = 'var(--font-archivo), "Avenir Next", system-ui, sans-serif'
const SANS = 'var(--font-hanken), "Avenir Next", system-ui, sans-serif'

// Sidepadding er ett tall gjennom hele sida. Endres den, endres den ett sted.
const GUTTER = 'clamp(20px, 4vw, 56px)'

export default async function TwinLedgerPage() {
  // Kun Norditechs egne dører: rot og TwinLedgers egen tenant. På et
  // partnerdomene skal siden ikke finnes — partneren er kunden, og skal ikke
  // vise at andre kan kjøpe det samme (Lars 16/9).
  const tenant = await getTenant()
  const t = await getTranslations('twinledger')
  const egenDor = tenant.slug === 'centerforge' || tenant.slug === 'twinledger'
  if (!egenDor) notFound()
  // På TwinLedger-tenanten er dette forsiden til en app med rettighetshavere
  // og admin bak seg — da hører innlogging og utvalget hjemme i toppen.
  const erApp = tenant.slug === 'twinledger'

  const rader = [
    { use: t('r1_use'), asset: t('r1_asset'), under: t('r1_under'), from: '400.00', to: '150.00' },
    { use: t('r2_use'), asset: t('r2_asset'), under: t('r2_under'), from: '250.00', to: '120.00' },
    { use: t('r3_use'), asset: t('r3_asset'), under: t('r3_under'), from: '300.00', to: '140.00' },
  ]

  return (
    <div style={{ minHeight: '100vh', background: 'var(--paper)', color: 'var(--ink)', fontFamily: SANS }}>
      <style>{`
        .tl-eyebrow { font-family: ${MONO}; font-size: 11.5px; font-weight: 600; letter-spacing: 0.16em; text-transform: uppercase; color: var(--text-faint); margin: 0; }
        .tl-h2 { font-family: ${DISPLAY}; font-weight: 800; font-size: clamp(28px, 3.4vw, 42px); letter-spacing: -0.03em; line-height: 1.1; margin: 0 0 14px; text-wrap: balance; }
        .tl-h3 { font-family: ${DISPLAY}; font-weight: 700; font-size: clamp(17px, 1.5vw, 21px); letter-spacing: -0.02em; margin: 0 0 8px; }
        .tl-p { font-size: 16px; line-height: 1.6; color: var(--ink-soft); margin: 0; max-width: 34em; }
        .tl-lede { font-size: clamp(17px, 1.5vw, 20px); line-height: 1.55; color: var(--ink-soft); margin: 0; max-width: 36em; }

        /* Ingen radius, ingen skygge — se formreglene i toppkommentaren. */
        .tl-cta, .tl-ink, .tl-ghost { display: inline-block; padding: 14px 28px; font-family: ${DISPLAY}; font-weight: 700; font-size: 15.5px; text-decoration: none; border-radius: 0; transition: background 0.15s ease, color 0.15s ease, border-color 0.15s ease; }
        .tl-cta { background: var(--ember-deep); color: var(--on-ember) !important; border: 1px solid var(--ember-deep); }
        .tl-cta:hover { background: var(--ember); border-color: var(--ember); }
        .tl-ink { background: var(--ink); color: var(--paper) !important; border: 1px solid var(--ink); }
        .tl-ink:hover { background: var(--ink-soft); border-color: var(--ink-soft); }
        .tl-ghost { background: transparent; color: var(--ink); border: 1px solid var(--ds-border-strong); }
        .tl-ghost:hover { background: var(--ink); color: var(--paper) !important; border-color: var(--ink); }
        .tl-nav a { color: var(--ink-soft); font-size: 15px; text-decoration: none; transition: color 0.15s ease; }
        .tl-nav a:hover { color: var(--ember-deep); }
        a:focus-visible, button:focus-visible { outline: 2px solid var(--ember-deep); outline-offset: 2px; }

        /* Responsivt UTEN mediaqueries: delingene brytes av auto-fit, og
           typografi/padding av clamp(). Da finnes det ingen bruddpunkt å
           glemme når en kolonne legges til. */
        .tl-split { display: grid; grid-template-columns: repeat(auto-fit, minmax(340px, 1fr)); }
        .tl-split-narrow { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); }
        /* Når kolonnene stables, skal skillet ligge OVER og ikke til venstre —
           ellers står en loddrett strek i tomme luften på mobil. */
        .tl-half-b { border-left: 1px solid var(--ds-border-strong); }
        @media (max-width: 719px) { .tl-half-b { border-left: 0; border-top: 1px solid var(--ds-border-strong); padding-left: 0 !important; } }

        .tl-frame { overflow-x: auto; border: 1px solid var(--ds-border-strong); }
        .tl-table { width: 100%; min-width: 640px; border-collapse: collapse; font-size: 16px; color: var(--ink); }
        .tl-table thead tr { background: var(--ink); }
        .tl-table th { font-family: ${MONO}; font-size: 10.5px; font-weight: 600; letter-spacing: 0.14em; text-transform: uppercase; color: #C9C9CE; text-align: left; padding: 14px 20px; }
        .tl-table th.num, .tl-table td.num { text-align: right; font-variant-numeric: tabular-nums; }
        /* Utbetalingskolonnen skiller seg ut allerede i hodet: det er den ene
           kolonnen som handler om mennesket, ikke om oss. */
        .tl-table th.payout { color: #F0B49A; }
        .tl-table td { padding: 16px 20px; border-bottom: 1px solid var(--ds-border); }
        .tl-table tr:last-child td { border-bottom: 0; }
        .tl-table td.payout { background: #FBF1EA; font-weight: 600; }

        /* «Føres nå». steps(1) gir et hardt blink — en myk fade ville lest som
           pynt; dette skal lese som et instrument. */
        @keyframes tlblink { 0%, 49% { opacity: 1; } 50%, 100% { opacity: 0.15; } }
        .tl-blink { width: 7px; height: 7px; background: var(--ember); animation: tlblink 1.05s steps(1) infinite; }
        @media (prefers-reduced-motion: reduce) { .tl-blink { animation: none; } }
      `}</style>

      <header style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', padding: `18px ${GUTTER}`, background: 'var(--paper-raised)', borderBottom: '1px solid var(--ds-border)' }}>
        <Link href="/" style={{ textDecoration: 'none' }}><TwinLedgerLogo size={22} /></Link>
        <span style={{ fontFamily: MONO, fontSize: 10.5, fontWeight: 600, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--ember-deep)', background: 'var(--ember-tint-bg)', border: '1px solid var(--ember-tint-border)', padding: '5px 9px' }}>
          {t('by_norditech')}
        </span>
        {/* ⚠️ flexWrap MÅ stå her. Uten den ble seks lenker 534px brede i et
            375px vindu, og hele sida kunne dras sidelengs på mobil. */}
        <nav className="tl-nav" style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '10px 18px', flexWrap: 'wrap' }}>
          <a href="#ledger">{t('nav_how')}</a>
          {erApp && <Link href="/stemmer">{t('nav_cast')}</Link>}
          {erApp && <Link href="/bli-stemme">{t('nav_rights')}</Link>}
          {erApp && <Link href="/login">{t('nav_login')}</Link>}
          <Link href="/white-label" className="tl-ghost" style={{ padding: '8px 16px', fontSize: 14 }}>{t('nav_talk')}</Link>
          {tenant.show_language_toggle !== false && <LangToggle />}
        </nav>
      </header>

      {/* Hero ligger på --paper-sunken, ikke på sidens egen bakgrunn: da er
          toppen av sida en egen flate og ikke bare luft over innholdet. */}
      <section style={{ background: 'var(--paper-sunken)', padding: `clamp(48px, 7vw, 92px) ${GUTTER} clamp(40px, 5vw, 68px)` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
          <p className="tl-eyebrow">{t('hero_eyebrow')}</p>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
            <span className="tl-blink" aria-hidden="true" />
            <span style={{ fontFamily: MONO, fontSize: 10.5, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--ember-deep)' }}>
              {t('live_now')}
            </span>
          </span>
        </div>
        <h1 style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 'clamp(38px, 6vw, 78px)', lineHeight: 1.02, letterSpacing: '-0.04em', margin: '0 0 22px', maxWidth: '16em', textWrap: 'balance' }}>
          {t('hero_h1_a')}<br />{t('hero_h1_b')}
        </h1>
        <p className="tl-lede">{t('hero_body')}</p>
        {/* Navnet forklart. Ordet «tvilling» sto ingen steder paa sida — og
            det er halve firmanavnet (Lars 22.09). Én linje, i mono som en
            ordbokoppføring, saa den leser som forklaring og ikke som slagord. */}
        <p style={{ fontFamily: MONO, fontSize: 12.5, lineHeight: 1.6, color: 'var(--text-faint)', margin: '16px 0 0', maxWidth: '44em' }}>{t('name_line')}</p>
      </section>

      {/* DE TO DØRENE som en 50/50-deling i full bredde. Ikke to kort — en
          fysisk deling av siden, så de to sidene av markedsplassen har like
          mye flate og ingen av dem leser som en fotnote til den andre. */}
      <div className="tl-split" style={{ borderTop: '1px solid var(--ds-border)' }}>
        <div style={{ background: 'var(--band)', padding: `clamp(32px, 3.5vw, 44px) ${GUTTER} clamp(40px, 4.5vw, 56px)`, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <h2 className="tl-h3">{t('door_cast_h')}</h2>
          <p className="tl-p">{t('door_cast_p')}</p>
          <div style={{ marginTop: 'auto', paddingTop: 12 }}>
            <Link href="/stemmer" className="tl-cta">{t('door_cast_cta')}</Link>
          </div>
        </div>
        <div className="tl-half-b" style={{ background: 'var(--paper-raised)', padding: `clamp(32px, 3.5vw, 44px) ${GUTTER} clamp(40px, 4.5vw, 56px)`, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <h2 className="tl-h3">{t('door_talent_h')}</h2>
          <p className="tl-p">{t('door_talent_p')}</p>
          {/* Døra tar imot den som ikke er i banken ennå. Den som ALLEREDE er
              det kom for å se hovedboken sin, og fant før dette bare en
              nøytral «Logg inn» oppe i hjørnet, delt med kundene. */}
          <div style={{ marginTop: 'auto', paddingTop: 12, display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap' }}>
            <Link href="/bli-stemme" className="tl-ink">{t('door_talent_cta')}</Link>
            <Link href="/login?rolle=stemme" style={{ fontSize: 14.5, color: 'var(--ink-soft)', textDecoration: 'underline', textUnderlineOffset: 3 }}>
              {t('door_talent_signin')}
            </Link>
          </div>
        </div>
      </div>

      {/* HVORFOR NAA. Reguleringen er investordokumentets sterkeste argument og
          var fravaerende paa sida (Lars 22.09). Rammet inn mot produsenten:
          «klarert» er et mykt ord, «dokumentert samtykke» er en hard grunn.
          ⚠️ Bare det vi leverer: samtykke, lisens og hovedbok. Vi merker IKKE
          innhold (C2PA) — noten sier det rett ut, saa sida ikke lover mer enn
          veikartet. */}
      <section style={{ background: 'var(--paper)', borderTop: '1px solid var(--ds-border-strong)', padding: `clamp(44px, 5.5vw, 72px) ${GUTTER}` }}>
        <p className="tl-eyebrow" style={{ marginBottom: 14 }}>{t('why_eyebrow')}</p>
        <h2 className="tl-h2" style={{ marginBottom: 28 }}>{t('why_h2')}</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 'clamp(20px, 3vw, 36px)', marginBottom: 26 }}>
          {[['why_1_h', 'why_1_p'], ['why_2_h', 'why_2_p'], ['why_3_h', 'why_3_p']].map(([h, b]) => (
            <div key={h} style={{ borderTop: '2px solid var(--ember-deep)', paddingTop: 14 }}>
              <h3 className="tl-h3" style={{ marginBottom: 8 }}>{t(h)}</h3>
              <p className="tl-p" style={{ margin: 0 }}>{t(b)}</p>
            </div>
          ))}
        </div>
        <p style={{ fontFamily: MONO, fontSize: 12.5, lineHeight: 1.6, color: 'var(--text-faint)', margin: 0, maxWidth: '60em' }}>{t('why_note')}</p>
      </section>

      {/* Hovedboken. Det eneste beviset som virker for BEGGE målgruppene:
          produsenten leser «dette er klarert», rettighetshaveren «jeg får
          betalt, og jeg ser det». */}
      <section id="ledger" style={{ background: 'var(--paper-raised)', borderTop: '1px solid var(--ds-border-strong)', borderBottom: '1px solid var(--ds-border-strong)', padding: `clamp(48px, 6vw, 80px) ${GUTTER}` }}>
        <p className="tl-eyebrow" style={{ marginBottom: 14 }}>{t('ledger_eyebrow')}</p>
        <h2 className="tl-h2">{t('ledger_h2')}</h2>
        <p className="tl-p" style={{ marginBottom: 28 }}>{t('ledger_body')}</p>
        <div className="tl-frame">
          <table className="tl-table">
            <thead>
              <tr>
                <th>{t('th_use')}</th>
                <th>{t('th_asset')}</th>
                <th>{t('th_under')}</th>
                <th className="num">{t('th_from')}</th>
                <th className="num payout">{t('th_to')}</th>
              </tr>
            </thead>
            <tbody>
              {rader.map((r) => (
                <tr key={r.use}>
                  <td>{r.use}</td>
                  <td>{r.asset}</td>
                  <td>{r.under}</td>
                  <td className="num">{r.from}</td>
                  <td className="num payout">{r.to}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p style={{ fontFamily: MONO, fontSize: 12.5, color: 'var(--text-faint)', marginTop: 12, lineHeight: 1.5 }}>
          {t('ledger_note')}
        </p>
      </section>

      {/* Argumentene, delt på samme måte som dørene: produsenten til venstre,
          rettighetshaveren til høyre, like mye flate. */}
      <div className="tl-split">
        <section style={{ background: 'var(--paper)', padding: `clamp(40px, 5vw, 64px) ${GUTTER}`, display: 'flex', flexDirection: 'column', gap: 26 }}>
          <div>
            <p className="tl-eyebrow" style={{ marginBottom: 12 }}>{t('casting_eyebrow')}</p>
            <h2 className="tl-h2" style={{ fontSize: 'clamp(24px, 2.6vw, 32px)' }}>{t('casting_h2')}</h2>
          </div>
          {[['c1_h', 'c1_p'], ['c2_h', 'c2_p'], ['c3_h', 'c3_p']].map(([h, p]) => (
            <div key={h}>
              <h3 className="tl-h3">{t(h)}</h3>
              <p className="tl-p">{t(p)}</p>
            </div>
          ))}
        </section>
        <section className="tl-half-b" style={{ background: 'var(--paper-sunken)', padding: `clamp(40px, 5vw, 64px) ${GUTTER}`, display: 'flex', flexDirection: 'column', gap: 26 }}>
          <div>
            <p className="tl-eyebrow" style={{ marginBottom: 12 }}>{t('talent_eyebrow')}</p>
            <h2 className="tl-h2" style={{ fontSize: 'clamp(24px, 2.6vw, 32px)' }}>{t('talent_h2')}</h2>
          </div>
          {[['t1_h', 't1_p'], ['t2_h', 't2_p'], ['t3_h', 't3_p']].map(([h, p]) => (
            <div key={h}>
              <h3 className="tl-h3">{t(h)}</h3>
              <p className="tl-p">{t(p)}</p>
            </div>
          ))}
        </section>
      </div>

      {/* CenterForge er vår EGEN produksjonsenhet, ikke en gaffel i veien.
          To spalter delt av en vertikal hairline — ikke to kort. */}
      <section style={{ background: 'var(--paper-raised)', borderTop: '1px solid var(--ds-border-strong)', borderBottom: '1px solid var(--ds-border-strong)', padding: `clamp(48px, 6vw, 76px) ${GUTTER}` }}>
        <p className="tl-eyebrow" style={{ marginBottom: 12 }}>{t('line_eyebrow')}</p>
        <h2 className="tl-h2">{t('line_h2')}</h2>
        <div className="tl-split-narrow" style={{ gap: 0, borderTop: '1px solid var(--ds-border-strong)', marginTop: 24 }}>
          <div style={{ paddingTop: 24, paddingRight: 32 }}>
            <h3 className="tl-h3">{t('is_h')}</h3>
            <p className="tl-p">{t('is_p')}</p>
          </div>
          <div className="tl-half-b" style={{ paddingTop: 24, paddingLeft: 32 }}>
            <h3 className="tl-h3">{t('isnot_h')}</h3>
            <p className="tl-p">
              {t.rich('isnot_p', {
                cf: (c) => <Link href="/" style={{ color: 'var(--ember-deep)' }}>{c}</Link>,
              })}
            </p>
          </div>
        </div>
        <p className="tl-p" style={{ marginTop: 22, fontSize: 15.5 }}>{t('line_body')}</p>
      </section>

      {/* Byråer og agenter: én stripe, nederst. White-label er en salgssamtale,
          ikke en selvbetjent dør. Og castingagenten står på BEGGE sider av
          bordet, så hen ville måttet velge feil dør. */}
      <section style={{ background: 'var(--band)', padding: `clamp(40px, 5vw, 64px) ${GUTTER}` }}>
        <p className="tl-eyebrow" style={{ marginBottom: 12 }}>{t('agency_eyebrow')}</p>
        <h2 className="tl-h2" style={{ fontSize: 'clamp(22px, 2.4vw, 28px)' }}>{t('agency_h2')}</h2>
        <p className="tl-p">{t('agency_p')}</p>
        <div style={{ marginTop: 22 }}>
          <Link href="/white-label" className="tl-ghost">{t('agency_cta')}</Link>
        </div>
      </section>

      <footer style={{ display: 'flex', alignItems: 'center', gap: 22, flexWrap: 'wrap', padding: `28px ${GUTTER} 48px`, borderTop: '1px solid var(--ds-border)' }}>
        <span style={{ fontFamily: MONO, fontSize: 12.5, color: 'var(--text-faint)' }}>{t('foot_brand')}</span>
        <Link href="/" style={{ color: 'var(--ink-soft)', fontSize: 14, textDecoration: 'none' }}>{t('foot_centerforge')}</Link>
        <Link href="/white-label" style={{ color: 'var(--ink-soft)', fontSize: 14, textDecoration: 'none' }}>{t('foot_partner')}</Link>
      </footer>
    </div>
  )
}
