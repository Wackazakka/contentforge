import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getTenant } from '@/lib/tenantServer'

// Norditechs egen dør inn til TwinLedger.
//
// SNUDD 20.09.2026: siden hadde ÉN dør, og den gikk til operatører («Become a
// partner»). Men produsenten er sluttkunden — byråene er white-labels under
// oss. Nå har siden to dører, og produsentens står først.
//
// Den var dessuten bare om STEMME, mens produktet dekker ansikt, film,
// casting og audition. Og den påsto at «Norway is currently served through a
// licensed partner» — det bortfalt da VoiceBank-avtaleutkastet ble lagt bort
// samme dag.
//
// Engelsk med vilje: den peker mot et internasjonalt marked.
//
// Bruker husets tokens (--paper/--ink/--ember) slik at siden er et sosken av
// Norditechs egen forside, ikke et fremmedelement. Hardkodet kopi, samme
// monster som BombazaLanding og /for-deg.

export const metadata = {
  title: 'TwinLedger — cleared voices and faces for film and advertising',
  description:
    'Cast a real person and prove you were allowed to. Every use of a performer’s voice or face is logged against the agreement that permits it, and paid back to them.',
}

const MONO = 'var(--font-cfmono), ui-monospace, SFMono-Regular, Menlo, monospace'
const DISPLAY = 'var(--font-archivo), "Avenir Next", system-ui, sans-serif'
const SANS = 'var(--font-hanken), "Avenir Next", system-ui, sans-serif'

export default async function TwinLedgerPage() {
  // Kun Norditechs egne dører: rot (centerforge.norditech.io) og TwinLedgers
  // egen tenant (twinledger.norditech.io, fra 20/9 en ekte tenant under
  // Norditech, ikke bare et vertsnavn). På et partnerdomene skal siden ikke
  // finnes — partneren er kunden, og skal ikke vise at andre kan kjøpe det
  // samme (Lars 16/9).
  const tenant = await getTenant()
  const egenDor = tenant.slug === 'centerforge' || tenant.slug === 'twinledger'
  if (!egenDor) notFound()
  // På TwinLedger-tenanten er dette forsiden til en app med rettighetshavere
  // og admin bak seg — da hører innlogging og utvalget hjemme i toppen.
  const erApp = tenant.slug === 'twinledger'
  return (
    <div style={{ minHeight: '100vh', background: 'var(--paper)', color: 'var(--ink)', fontFamily: SANS }}>
      <style>{`
        .tl-band { max-width: 1060px; margin: 0 auto; padding: 0 28px; }
        .tl-eyebrow { font-family: ${MONO}; font-size: 11.5px; font-weight: 600; letter-spacing: 0.16em; text-transform: uppercase; color: var(--text-faint); margin: 0 0 14px; }
        .tl-h2 { font-family: ${DISPLAY}; font-weight: 800; font-size: clamp(24px, 3.2vw, 34px); letter-spacing: -0.02em; line-height: 1.15; margin: 0 0 14px; text-wrap: balance; }
        .tl-p { font-size: 17px; line-height: 1.65; color: var(--ink-soft); margin: 0 0 14px; max-width: 34em; }
        .tl-card { background: var(--paper-raised); border: 1px solid var(--ember-tint-border); border-radius: 4px; padding: 26px; display: flex; flex-direction: column; gap: 9px; }
        .tl-card h3 { font-family: ${DISPLAY}; font-weight: 700; font-size: 17px; margin: 0; letter-spacing: -0.01em; }
        .tl-card p { margin: 0; font-size: 15.5px; line-height: 1.6; color: var(--ink-soft); }
        .tl-g3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 18px; }
        .tl-g2 { display: grid; grid-template-columns: repeat(2, 1fr); gap: 18px; }
        .tl-cta { display: inline-block; padding: 14px 28px; border-radius: 4px; background: var(--ember-deep); color: var(--on-ember) !important; font-weight: 700; font-size: 16px; text-decoration: none; }
        .tl-cta:hover { filter: brightness(0.93); }
        .tl-ghost { display: inline-block; padding: 14px 24px; border-radius: 4px; border: 1.5px solid var(--ember-tint-border); color: var(--ink); font-weight: 600; font-size: 16px; text-decoration: none; }
        .tl-ghost:hover { border-color: var(--ember-deep); color: var(--ember-deep); }
        .tl-band a:focus-visible { outline: 2px solid var(--ember-deep); outline-offset: 2px; }
        .tl-rule { height: 1px; background: var(--ember-tint-border); border: 0; margin: 0; }

        /* Hovedboken — det visuelle hjertet */
        .tl-frame { background: var(--paper-raised); border: 1px solid var(--ember-tint-border); border-radius: 4px; overflow-x: auto; }
        .tl-table { width: 100%; border-collapse: collapse; font-size: 15px; min-width: 620px; }
        .tl-table th { font-family: ${MONO}; font-size: 10.5px; font-weight: 600; letter-spacing: 0.14em; text-transform: uppercase; color: var(--text-faint); text-align: left; padding: 14px 20px; border-bottom: 1px solid var(--ember-tint-border); }
        .tl-table td { padding: 15px 20px; border-bottom: 1px solid var(--ember-tint-border); }
        .tl-table tr:last-child td { border-bottom: 0; }
        .tl-num { font-variant-numeric: tabular-nums; text-align: right; }
        .tl-out { color: var(--ember-deep); font-weight: 700; }
        @media (max-width: 860px) { .tl-g3, .tl-g2 { grid-template-columns: 1fr; } }
      `}</style>

      {/* Header */}
      <header className="tl-band" style={{ display: 'flex', alignItems: 'center', gap: 14, paddingTop: 24, paddingBottom: 24, flexWrap: 'wrap' }}>
        <Link href="/" style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 22, letterSpacing: '-0.02em', color: 'var(--ink)', textDecoration: 'none' }}>
          TwinLedger
        </Link>
        <span style={{ fontFamily: MONO, fontSize: 10.5, fontWeight: 600, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--ember-deep)', background: 'var(--ember-tint-bg)', border: '1px solid var(--ember-tint-border)', borderRadius: 3, padding: '5px 9px' }}>
          by Norditech
        </span>
        <nav style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 20 }}>
          <a href="#ledger" style={{ color: 'var(--ink-soft)', fontSize: 15, textDecoration: 'none' }}>How it works</a>
          {erApp && <Link href="/stemmer" style={{ color: 'var(--ink-soft)', fontSize: 15, textDecoration: 'none' }}>Voices &amp; faces</Link>}
          {erApp && <Link href="/bli-stemme" style={{ color: 'var(--ink-soft)', fontSize: 15, textDecoration: 'none' }}>For rights holders</Link>}
          {erApp && <Link href="/login" style={{ color: 'var(--ink-soft)', fontSize: 15, textDecoration: 'none' }}>Log in</Link>}
          <Link href="/white-label" className="tl-ghost" style={{ padding: '9px 18px', fontSize: 14 }}>Talk to us</Link>
        </nav>
      </header>

      <hr className="tl-rule" />

      {/* Hero. Snudd 20.09.2026: produsenten er sluttkunden, og siden dekker
          nå ansikt like mye som stemme. Den gamle overskriften var bare stemme,
          og den eneste døra gikk til operatører. */}
      <section className="tl-band" style={{ paddingTop: 72, paddingBottom: 60 }}>
        <p className="tl-eyebrow">Cleared voices and faces for film, advertising and games</p>
        <h1 style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 'clamp(34px, 5.2vw, 54px)', lineHeight: 1.05, letterSpacing: '-0.03em', margin: '0 0 22px', maxWidth: 820, textWrap: 'balance' }}>
          Cast a real person.<br />Prove you were allowed to.
        </h1>
        <p className="tl-p" style={{ fontSize: 19, maxWidth: '36em' }}>
          TwinLedger is where a performer&apos;s voice and face are licensed. Every use is logged
          against the agreement that permits it, and paid back to the person it belongs to — so
          the clearance is a record, not a promise.
        </p>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 28 }}>
          <Link href="/stemmer" className="tl-cta">See who is available</Link>
          <a href="#ledger" className="tl-ghost">See the ledger</a>
        </div>
      </section>

      {/* For produsenten. Denne fantes ikke — siden hadde bare en dør, og den
          gikk til operatører. */}
      <section className="tl-band" style={{ paddingBottom: 72 }}>
        <p className="tl-eyebrow">If you are casting</p>
        <h2 className="tl-h2">Hear your own lines, in their voice, before you decide</h2>
        <div className="tl-g3" style={{ marginTop: 26 }}>
          <div className="tl-card">
            <h3>Real people who said yes</h3>
            <p>Every voice and face in the catalogue belongs to a person who agreed to it, on terms recorded at the moment they agreed.</p>
          </div>
          <div className="tl-card">
            <h3>Audition on your own script</h3>
            <p>Write one line, pick who reads it, and compare them side by side. Same scene, same framing — only the performer changes. They are paid for the audition.</p>
          </div>
          <div className="tl-card">
            <h3>A licence, not a metered API</h3>
            <p>Buy the right you actually need: medium, territory, term — or a one-off buyout bound to the work, for film and scripted television.</p>
          </div>
        </div>
      </section>

      {/* Hovedboken */}
      <section id="ledger" className="tl-band" style={{ paddingBottom: 72 }}>
        <p className="tl-eyebrow">The ledger</p>
        <h2 className="tl-h2">One use, one line, written as it happens</h2>
        <p className="tl-p" style={{ marginBottom: 26 }}>
          Nobody reconstructs afterwards how many times a voice or a face was used. It is in the
          book — and that is why a performer can say yes without having to trust anyone.
        </p>
        <div className="tl-frame">
          <table className="tl-table">
            <thead>
              <tr>
                <th>Use</th>
                <th>Asset</th>
                <th>Under</th>
                <th className="tl-num">From customer</th>
                <th className="tl-num">To rights holder</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Radio spot</td>
                <td>Voice</td>
                <td>Campaign, Norway, 6 mo</td>
                <td className="tl-num">400.00</td>
                <td className="tl-num tl-out">150.00</td>
              </tr>
              <tr>
                <td>Feature film</td>
                <td>Voice and face</td>
                <td>Work licence, perpetual</td>
                <td className="tl-num">250.00</td>
                <td className="tl-num tl-out">120.00</td>
              </tr>
              <tr>
                <td>Campaign image</td>
                <td>Face</td>
                <td>Campaign, Nordics, 12 mo</td>
                <td className="tl-num">300.00</td>
                <td className="tl-num tl-out">140.00</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p style={{ fontFamily: MONO, fontSize: 13, color: 'var(--text-faint)', marginTop: 12 }}>
          Illustration. Every line points at the licence that permits it — that is what makes this a clearance record and not a usage meter.
        </p>
      </section>

      <hr className="tl-rule" />

      {/* Hva du får */}
      <section className="tl-band" style={{ paddingTop: 72, paddingBottom: 72 }}>
        <p className="tl-eyebrow">What you licence</p>
        <h2 className="tl-h2">The part nobody wants to build twice</h2>
        <div className="tl-g3" style={{ marginTop: 26 }}>
          <div className="tl-card">
            <h3>Rights bank</h3>
            <p>Agreements, frozen consent, rates per use type and per rights holder, approval flow with agreed deadlines.</p>
          </div>
          <div className="tl-card">
            <h3>Ledger and settlement</h3>
            <p>Every use logged with amounts on both sides. Statements per rights holder, ready for payout.</p>
          </div>
          <div className="tl-card">
            <h3>Your brand, your chain</h3>
            <p>White-label across four generations. You set your prices and your own resellers&apos; terms.</p>
          </div>
        </div>
      </section>

      <hr className="tl-rule" />

      {/* Avgrensningen — hva det IKKE er */}
      <section className="tl-band" style={{ paddingTop: 72, paddingBottom: 72 }}>
        <p className="tl-eyebrow">Where the line runs</p>
        <h2 className="tl-h2">Rights management, not voice cloning</h2>
        <div className="tl-g2" style={{ marginTop: 26 }}>
          <div className="tl-card">
            <h3>This is TwinLedger</h3>
            <p>
              Someone other than the person uses their voice or face, and that person is paid for
              it. Those two things together are what makes a ledger necessary at all.
            </p>
          </div>
          <div className="tl-card">
            <h3>This is not</h3>
            <p>
              A person using their own voice in their own material. No third party, no royalty,
              nothing owed — and no ledger needed. That is ordinary production, and it is what{' '}
              <Link href="/" style={{ color: 'var(--ember-deep)' }}>CenterForge</Link> does.
            </p>
          </div>
        </div>
        <p className="tl-p" style={{ marginTop: 22, fontSize: 15.5 }}>
          The two products run on the same platform and are sold separately. Partners who only
          produce content do not need a ledger — and should not inherit the obligations that come
          with one.
        </p>
      </section>

      <hr className="tl-rule" />

      {/* CTA */}
      <section className="tl-band" style={{ paddingTop: 64, paddingBottom: 80 }}>
        <h2 className="tl-h2">Who this is for</h2>
        <p className="tl-p">
          <strong style={{ fontWeight: 600 }}>Producers and casting directors</strong> who want a
          performer they can actually clear — and <strong style={{ fontWeight: 600 }}>agencies,
          talent managers and studios</strong> who commercialise other people&apos;s voice or
          likeness and need to account for it: per use, per rights holder, in a form that
          survives an audit and a difficult conversation.
        </p>
        <div style={{ marginTop: 26 }}>
          <Link href="/white-label" className="tl-cta">Become a partner</Link>
        </div>
      </section>

      <footer className="tl-band" style={{ paddingTop: 28, paddingBottom: 56, borderTop: '1px solid var(--ember-tint-border)', display: 'flex', gap: 22, flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontFamily: MONO, fontSize: 13, color: 'var(--text-faint)' }}>TwinLedger — by Norditech</span>
        <Link href="/" style={{ color: 'var(--ink-soft)', fontSize: 14, textDecoration: 'none' }}>CenterForge</Link>
        <Link href="/white-label" style={{ color: 'var(--ink-soft)', fontSize: 14, textDecoration: 'none' }}>Partner</Link>
      </footer>
    </div>
  )
}
