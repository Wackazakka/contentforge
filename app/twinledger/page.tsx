import Link from 'next/link'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { getTenant } from '@/lib/tenantServer'
import { LangToggle } from '@/components/LangToggle'

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
// TOSPRAKLIG 20.09.2026: kopien var hardkodet engelsk mens resten av tenanten
// er norsk — samme trakt i to sprak, og <html lang> loy. Na ligger den i
// messages/*.json under 'twinledger', og sprakvelgeren star i toppen: uten
// den kan en engelsk leser ikke komme seg ut av en norsk forside.

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('twinledger')
  return { title: t('meta_title'), description: t('meta_description') }
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
  const t = await getTranslations('twinledger')
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
          {t('by_norditech')}
        </span>
        <nav style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 20 }}>
          <a href="#ledger" style={{ color: 'var(--ink-soft)', fontSize: 15, textDecoration: 'none' }}>{t('nav_how')}</a>
          {erApp && <Link href="/stemmer" style={{ color: 'var(--ink-soft)', fontSize: 15, textDecoration: 'none' }}>{t('nav_cast')}</Link>}
          {erApp && <Link href="/bli-stemme" style={{ color: 'var(--ink-soft)', fontSize: 15, textDecoration: 'none' }}>{t('nav_rights')}</Link>}
          {erApp && <Link href="/login" style={{ color: 'var(--ink-soft)', fontSize: 15, textDecoration: 'none' }}>{t('nav_login')}</Link>}
          <Link href="/white-label" className="tl-ghost" style={{ padding: '9px 18px', fontSize: 14 }}>{t('nav_talk')}</Link>
          {tenant.show_language_toggle !== false && <LangToggle />}
        </nav>
      </header>

      <hr className="tl-rule" />

      {/* Hero. Snudd 20.09.2026: produsenten er sluttkunden, og siden dekker
          nå ansikt like mye som stemme. Den gamle overskriften var bare stemme,
          og den eneste døra gikk til operatører. */}
      <section className="tl-band" style={{ paddingTop: 72, paddingBottom: 60 }}>
        <p className="tl-eyebrow">{t('hero_eyebrow')}</p>
        <h1 style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 'clamp(34px, 5.2vw, 54px)', lineHeight: 1.05, letterSpacing: '-0.03em', margin: '0 0 22px', maxWidth: 820, textWrap: 'balance' }}>
          {t('hero_h1_a')}<br />{t('hero_h1_b')}
        </h1>
        <p className="tl-p" style={{ fontSize: 19, maxWidth: '36em' }}>
          {t('hero_body')}
        </p>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 28 }}>
          <Link href="/stemmer" className="tl-cta">{t('hero_cta')}</Link>
          <a href="#ledger" className="tl-ghost">{t('hero_ghost')}</a>
        </div>
      </section>

      {/* For produsenten. Denne fantes ikke — siden hadde bare en dør, og den
          gikk til operatører. */}
      <section className="tl-band" style={{ paddingBottom: 72 }}>
        <p className="tl-eyebrow">{t('casting_eyebrow')}</p>
        <h2 className="tl-h2">{t('casting_h2')}</h2>
        <div className="tl-g3" style={{ marginTop: 26 }}>
          <div className="tl-card">
            <h3>{t('c1_h')}</h3>
            <p>{t('c1_p')}</p>
          </div>
          <div className="tl-card">
            <h3>{t('c2_h')}</h3>
            <p>{t('c2_p')}</p>
          </div>
          <div className="tl-card">
            <h3>{t('c3_h')}</h3>
            <p>{t('c3_p')}</p>
          </div>
        </div>
      </section>

      {/* Hovedboken */}
      <section id="ledger" className="tl-band" style={{ paddingBottom: 72 }}>
        <p className="tl-eyebrow">{t('ledger_eyebrow')}</p>
        <h2 className="tl-h2">{t('ledger_h2')}</h2>
        <p className="tl-p" style={{ marginBottom: 26 }}>
          {t('ledger_body')}
        </p>
        <div className="tl-frame">
          <table className="tl-table">
            <thead>
              <tr>
                <th>{t('th_use')}</th>
                <th>{t('th_asset')}</th>
                <th>{t('th_under')}</th>
                <th className="tl-num">{t('th_from')}</th>
                <th className="tl-num">{t('th_to')}</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>{t('r1_use')}</td>
                <td>{t('r1_asset')}</td>
                <td>{t('r1_under')}</td>
                <td className="tl-num">400.00</td>
                <td className="tl-num tl-out">150.00</td>
              </tr>
              <tr>
                <td>{t('r2_use')}</td>
                <td>{t('r2_asset')}</td>
                <td>{t('r2_under')}</td>
                <td className="tl-num">250.00</td>
                <td className="tl-num tl-out">120.00</td>
              </tr>
              <tr>
                <td>{t('r3_use')}</td>
                <td>{t('r3_asset')}</td>
                <td>{t('r3_under')}</td>
                <td className="tl-num">300.00</td>
                <td className="tl-num tl-out">140.00</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p style={{ fontFamily: MONO, fontSize: 13, color: 'var(--text-faint)', marginTop: 12 }}>
          {t('ledger_note')}
        </p>
      </section>

      <hr className="tl-rule" />

      {/* Hva du får */}
      <section className="tl-band" style={{ paddingTop: 72, paddingBottom: 72 }}>
        <p className="tl-eyebrow">{t('what_eyebrow')}</p>
        <h2 className="tl-h2">{t('what_h2')}</h2>
        <div className="tl-g3" style={{ marginTop: 26 }}>
          <div className="tl-card">
            <h3>{t('w1_h')}</h3>
            <p>{t('w1_p')}</p>
          </div>
          <div className="tl-card">
            <h3>{t('w2_h')}</h3>
            <p>{t('w2_p')}</p>
          </div>
          <div className="tl-card">
            <h3>{t('w3_h')}</h3>
            <p>{t('w3_p')}</p>
          </div>
        </div>
      </section>

      <hr className="tl-rule" />

      {/* Avgrensningen — hva det IKKE er */}
      <section className="tl-band" style={{ paddingTop: 72, paddingBottom: 72 }}>
        <p className="tl-eyebrow">{t('line_eyebrow')}</p>
        <h2 className="tl-h2">{t('line_h2')}</h2>
        <div className="tl-g2" style={{ marginTop: 26 }}>
          <div className="tl-card">
            <h3>{t('is_h')}</h3>
            <p>
              {t('is_p')}
            </p>
          </div>
          <div className="tl-card">
            <h3>{t('isnot_h')}</h3>
            <p>
              {t.rich('isnot_p', {
                cf: (c) => <Link href="/" style={{ color: 'var(--ember-deep)' }}>{c}</Link>,
              })}
            </p>
          </div>
        </div>
        <p className="tl-p" style={{ marginTop: 22, fontSize: 15.5 }}>
          {t('line_body')}
        </p>
      </section>

      <hr className="tl-rule" />

      {/* CTA */}
      <section className="tl-band" style={{ paddingTop: 64, paddingBottom: 80 }}>
        <h2 className="tl-h2">{t('who_h2')}</h2>
        <p className="tl-p">
          {t.rich('who_p', {
            b: (c) => <strong style={{ fontWeight: 600 }}>{c}</strong>,
          })}
        </p>
        <div style={{ marginTop: 26 }}>
          <Link href="/white-label" className="tl-cta">{t('who_cta')}</Link>
        </div>
      </section>

      <footer className="tl-band" style={{ paddingTop: 28, paddingBottom: 56, borderTop: '1px solid var(--ember-tint-border)', display: 'flex', gap: 22, flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontFamily: MONO, fontSize: 13, color: 'var(--text-faint)' }}>{t('foot_brand')}</span>
        <Link href="/" style={{ color: 'var(--ink-soft)', fontSize: 14, textDecoration: 'none' }}>{t('foot_centerforge')}</Link>
        <Link href="/white-label" style={{ color: 'var(--ink-soft)', fontSize: 14, textDecoration: 'none' }}>{t('foot_partner')}</Link>
      </footer>
    </div>
  )
}
