import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { STANDARD_RATE_CARD, mergeRateCard } from '@/lib/rateCard'
import { getTenant } from '@/lib/tenantServer'
import { TwinLedgerLogo } from '@/components/TwinLedgerLogo'
import { LangToggle } from '@/components/LangToggle'

// Prissiden for TwinLedger (Claude Design 5F, 21.09.2026).
//
// 🔑 TALLENE SKRIVES IKKE INN — DE LESES FRA TAKSTKORTET. Designmocken hadde
// plassholdere, og en side med innskrevne tall drifter fra virkeligheten
// første gang en sats justeres. Da lyver prissida mot tilbudet kunden faktisk
// får. Her leses `tenants.rate_card` flettet over STANDARD_RATE_CARD, altså
// nøyaktig det samme oppslaget som tilbudsgeneratoren bruker.
//
// 🔑 KUN KAMPANJESATSER PUBLISERES (Lars 21.09). Verk-satsene er merket i
// rateCard.ts som «dårligere fundert enn kampanje-satsene — ankeret bør være
// Norsk Skuespillerforbunds satser». Å publisere 200 000 for en internasjonal
// hovedrolle uten det ankeret er å invitere til en diskusjon man taper. Film
// og serie er derfor «snakk med oss», og det står hvorfor.
//
// ⚠️ Kortet er en TILBUDSGENERATOR, ikke en prisliste. Derfor «fra»-priser
// overalt, og derfor sier fotnoten at prisen kan avvike gjennom et byrå — det
// er deres kort som gjelder da.

const MONO = 'var(--font-cfmono), ui-monospace, monospace'
const DISPLAY = 'var(--font-archivo), system-ui, sans-serif'
const SANS = 'var(--font-hanken), system-ui, sans-serif'
const GUTTER = 'clamp(20px, 4vw, 56px)'

const nok = (n: number) => n.toLocaleString('nb-NO')
const faktor = (n: number) => (n === 1 ? '—' : `× ${String(n).replace('.', ',')}`)

export default async function LisensPriser() {
  const tenant = await getTenant()
  const t = await getTranslations('licencePricing')
  // Samme oppslag som tilbudsgeneratoren: tenantens eget kort vinner der det
  // finnes, standardkortet ellers.
  const kort = mergeRateCard(tenant.rate_card ?? null)
  const c = kort.campaign

  const klasser = [
    ['internal', c.base.internal],
    ['online', c.base.online],
    ['broadcast', c.base.broadcast],
  ] as const

  return (
    <div style={{ minHeight: '100vh', background: 'var(--paper)', color: 'var(--ink)', fontFamily: SANS }}>
      <style>{`
        .lp-table { width: 100%; min-width: 560px; border-collapse: collapse; font-size: 16px; }
        .lp-table thead tr { background: var(--ink); }
        .lp-table th { font-family: ${MONO}; font-size: 10.5px; font-weight: 600; letter-spacing: 0.14em; text-transform: uppercase; color: #C9C9CE; text-align: left; padding: 14px 20px; }
        .lp-table th.num { text-align: right; }
        .lp-table td { padding: 16px 20px; border-bottom: 1px solid var(--ds-border); vertical-align: top; }
        .lp-table td.num { text-align: right; font-variant-numeric: tabular-nums; font-weight: 600; }
        .lp-table tr:last-child td { border-bottom: 0; }
        .lp-split { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); }
      `}</style>

      <header style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', padding: `18px ${GUTTER}`, background: 'var(--paper-raised)', borderBottom: '1px solid var(--ds-border)' }}>
        <Link href="/" style={{ textDecoration: 'none' }}><TwinLedgerLogo size={22} /></Link>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '10px 18px', flexWrap: 'wrap', fontSize: 15 }}>
          <Link href="/stemmer" style={{ color: 'var(--ink-soft)', textDecoration: 'none' }}>{t('eyebrow')}</Link>
          {tenant.show_language_toggle !== false && <LangToggle />}
        </div>
      </header>

      <section style={{ background: 'var(--paper-sunken)', padding: `clamp(44px, 6vw, 80px) ${GUTTER} clamp(36px, 4vw, 56px)` }}>
        <p style={{ fontFamily: MONO, fontSize: 11.5, fontWeight: 600, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--text-faint)', margin: '0 0 12px' }}>{t('eyebrow')}</p>
        <h1 style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 'clamp(32px, 4.6vw, 58px)', letterSpacing: '-0.04em', lineHeight: 1.04, margin: '0 0 18px', maxWidth: '15em' }}>{t('h1')}</h1>
        <p style={{ fontSize: 'clamp(16px, 1.4vw, 19px)', lineHeight: 1.55, color: 'var(--ink-soft)', margin: 0, maxWidth: '38em' }}>{t('lede')}</p>
      </section>

      <section style={{ background: 'var(--paper-raised)', borderTop: '1px solid var(--ds-border-strong)', borderBottom: '1px solid var(--ds-border-strong)', padding: `clamp(40px, 5vw, 68px) ${GUTTER}` }}>
        <h2 style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 'clamp(22px, 2.4vw, 30px)', letterSpacing: '-0.03em', margin: '0 0 8px' }}>{t('table_h')}</h2>
        <p style={{ fontSize: 14.5, color: 'var(--text-muted)', margin: '0 0 24px' }}>{t('table_note')}</p>
        <div style={{ overflowX: 'auto', border: '1px solid var(--ds-border-strong)' }}>
          <table className="lp-table">
            <thead>
              <tr>
                <th>{t('th_class')}</th>
                <th className="num">{t('th_voice')}</th>
                <th className="num">{t('th_face')}</th>
              </tr>
            </thead>
            <tbody>
              {klasser.map(([id, pris]) => (
                <tr key={id}>
                  <td>
                    <span style={{ display: 'block', fontFamily: DISPLAY, fontWeight: 700, fontSize: 15.5, letterSpacing: '-0.01em' }}>{t(`class_${id}`)}</span>
                    <span style={{ display: 'block', fontSize: 13, color: 'var(--text-muted)', marginTop: 3 }}>{t(`class_${id}_hint`)}</span>
                  </td>
                  <td className="num">{nok(pris.voice)}</td>
                  <td className="num">{nok(pris.face)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Multiplikatorene står synlig: uten dem er fra-prisen en halv
            opplysning, og leseren kan ikke regne seg fram til sin egen. */}
        <h3 style={{ fontFamily: MONO, fontSize: 10.5, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--text-faint)', margin: '32px 0 14px' }}>{t('scale_h')}</h3>
        <div className="lp-split" style={{ border: '1px solid var(--ds-border-strong)' }}>
          <Skala tittel={t('scale_territory')} rader={[
            [t('terr_no'), faktor(c.territory.no)],
            [t('terr_nordic'), faktor(c.territory.nordic)],
            [t('terr_world'), faktor(c.territory.world)],
          ]} />
          <Skala tittel={t('scale_term')} kant rader={[
            [t('term_3'), faktor(c.term['3'])],
            [t('term_12'), faktor(c.term['12'])],
            [t('term_0'), faktor(c.term['0'])],
          ]} />
          <Skala tittel={t('scale_excl')} kant rader={[
            [t('excl_none'), faktor(c.exclusivity.none)],
            [t('excl_category'), faktor(c.exclusivity.category)],
            [t('excl_full'), faktor(c.exclusivity.full)],
          ]} />
        </div>
      </section>

      {/* Verk: ingen tall, og grunnen står. Se toppkommentaren. */}
      <section style={{ padding: `clamp(40px, 5vw, 64px) ${GUTTER}` }}>
        <div className="lp-split">
          <div style={{ paddingRight: 32 }}>
            <h2 style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 'clamp(22px, 2.4vw, 30px)', letterSpacing: '-0.03em', margin: '0 0 12px' }}>{t('work_h')}</h2>
            <p style={{ fontSize: 16, lineHeight: 1.6, color: 'var(--ink-soft)', margin: '0 0 22px', maxWidth: '34em' }}>{t('work_p')}</p>
            <Link href="/white-label" style={{ display: 'inline-block', padding: '13px 26px', fontFamily: DISPLAY, fontWeight: 700, fontSize: 15.5, background: 'var(--ember-deep)', color: 'var(--on-ember)', textDecoration: 'none' }}>{t('work_cta')}</Link>
          </div>
        </div>
      </section>

      <section style={{ background: 'var(--band)', padding: `clamp(40px, 5vw, 64px) ${GUTTER}` }}>
        <div className="lp-split" style={{ gap: 0 }}>
          {[
            [t('p1_h', { pct: kort.rightsHolderPct }), t('p1_p', { pct: kort.rightsHolderPct })],
            [t('p2_h'), t('p2_p', { renewal: kort.renewalPct })],
            [t('p3_h'), t('p3_p')],
          ].map(([h, p], i) => (
            <div key={h} style={{ paddingRight: 28, borderLeft: i === 0 ? 'none' : '1px solid var(--ds-border-strong)', paddingLeft: i === 0 ? 0 : 28 }}>
              <h3 style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 18, letterSpacing: '-0.02em', margin: '0 0 8px' }}>{h}</h3>
              <p style={{ fontSize: 15, lineHeight: 1.6, color: 'var(--ink-soft)', margin: 0 }}>{p}</p>
            </div>
          ))}
        </div>
        <p style={{ fontFamily: MONO, fontSize: 11.5, lineHeight: 1.6, color: 'var(--text-muted)', margin: '36px 0 0', maxWidth: '46em' }}>
          {t('footnote', { version: kort.version })}
        </p>
      </section>
    </div>
  )
}

function Skala({ tittel, rader, kant }: { tittel: string; rader: Array<[string, string]>; kant?: boolean }) {
  return (
    <div style={{ padding: '18px 20px', borderLeft: kant ? '1px solid var(--ds-border)' : undefined }}>
      <p style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 15, margin: '0 0 10px' }}>{tittel}</p>
      {rader.map(([k, v], i) => (
        <div key={k} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '6px 0', fontSize: 14.5, borderTop: i === 0 ? 'none' : '1px solid var(--ds-border-faint)' }}>
          <span style={{ color: 'var(--text-muted)' }}>{k}</span>
          <span style={{ fontFamily: MONO, fontSize: 13, color: 'var(--ink)', fontVariantNumeric: 'tabular-nums' }}>{v}</span>
        </div>
      ))}
    </div>
  )
}
