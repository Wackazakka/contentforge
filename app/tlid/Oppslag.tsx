import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import type { Tenant } from '@/lib/tenantServer'
import type { PublicActor } from '@/lib/publicActors'
import { CenterForgeLogo } from '@/components/CenterForgeLogo'
import { TwinLedgerLogo } from '@/components/TwinLedgerLogo'
import { LangToggle } from '@/components/LangToggle'
import SoekeSkjema from './SoekeSkjema'
import RensAdresse from './RensAdresse'

// Det åpne TLID-oppslaget, for mennesker. Felles for /tlid (søkefeltet) og
// /tlid/<TLID> (svaret). Server-komponent: ingenting her trenger JavaScript i
// nettleseren — skjemaet er et vanlig GET-skjema.
//
// 🔑 SVARET SIER «IKKE I DET ÅPNE REGISTERET», IKKE «FINNES IKKE». Upubliserte
// profiler vises ikke, og vi sier heller ikke at de finnes (se
// lib/publicActors getPublicActorByTlid).

const MONO = 'var(--font-cfmono), ui-monospace, monospace'
const DISPLAY = 'var(--font-archivo), system-ui, sans-serif'
const SANS = 'var(--font-hanken), system-ui, sans-serif'
const GUTTER = 'clamp(20px, 4vw, 56px)'

export type Svar =
  | { kind: 'tom' }
  | { kind: 'ugyldig'; q: string }
  | { kind: 'ikke_funnet'; tlid: string }
  | { kind: 'funnet'; tlid: string; actor: PublicActor; siden: string | null; apiUrl: string }

export default async function Oppslag({ tenant, svar }: { tenant: Tenant; svar: Svar }) {
  const t = await getTranslations('tlidLookup')
  const erTwinLedger = tenant.slug === 'twinledger'
  const forhaand = svar.kind === 'funnet' || svar.kind === 'ikke_funnet' ? svar.tlid : svar.kind === 'ugyldig' ? svar.q : ''

  return (
    <div style={{ minHeight: '100vh', background: 'var(--paper)', color: 'var(--ink)', fontFamily: SANS }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', padding: `18px ${GUTTER}`, background: 'var(--paper-raised)', borderBottom: '1px solid var(--ds-border)' }}>
        <Link href="/" style={{ textDecoration: 'none' }}>
          {erTwinLedger ? <TwinLedgerLogo size={22} /> : <CenterForgeLogo size={26} wordmarkSize={17} />}
        </Link>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '10px 18px', flexWrap: 'wrap', fontSize: 15 }}>
          <Link href="/stemmer" style={{ color: 'var(--ink-soft)', textDecoration: 'none' }}>{t('gallery')}</Link>
          {tenant.show_language_toggle !== false && <LangToggle />}
        </div>
      </header>

      <main style={{ maxWidth: 720, margin: '0 auto', padding: `40px ${GUTTER} 64px` }}>
        <p style={{ fontFamily: MONO, fontSize: 10.5, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--text-faint)', margin: '0 0 10px' }}>{t('eyebrow')}</p>
        <h1 style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 'clamp(28px, 4vw, 40px)', letterSpacing: '-0.03em', lineHeight: 1.1, margin: '0 0 12px' }}>{t('h1')}</h1>
        <p style={{ fontSize: 16, lineHeight: 1.6, color: 'var(--ink-soft)', margin: '0 0 24px', maxWidth: 560 }}>{t('lead')}</p>

        {/* key: et nytt oppslag skal tømme feltet til det nye svaret, ikke
            beholde det forrige skjemaets tilstand. */}
        <SoekeSkjema key={forhaand} forhaand={forhaand} label={t('label')} knapp={t('button')} />
        {(svar.kind === 'funnet' || svar.kind === 'ikke_funnet') && <RensAdresse />}

        {svar.kind === 'ugyldig' && (
          <Boks tone="advarsel">{t('invalid', { q: svar.q })}</Boks>
        )}

        {svar.kind === 'ikke_funnet' && (
          <Boks tone="advarsel">
            <strong style={{ display: 'block', marginBottom: 4 }}>{t('not_found_h')}</strong>
            {t('not_found_p', { tlid: svar.tlid })}
          </Boks>
        )}

        {svar.kind === 'funnet' && (() => {
          const a = svar.actor
          const klarerbar = !a.isDemo && (a.hasVoice || a.hasFace || a.hasSinging)
          const dato = svar.siden ? new Date(svar.siden).toLocaleDateString('nb-NO') : null
          const rader: Array<[string, React.ReactNode]> = [
            [t('row_name'), a.name],
            [t('row_managed'), a.managedBy],
            [t('row_version'), dato ? t('row_version_since', { n: a.twinVersion, date: dato }) : String(a.twinVersion)],
            [t('row_voice'), a.hasVoice ? t('available') : t('unavailable')],
            [t('row_face'), a.hasFace ? t('available') : t('unavailable')],
            // Sang og artisttype (127): sangen bare når den finnes; en virtuell
            // artist skal alltid stå som det den er.
            ...(a.hasSinging ? [[t('row_singing'), t('available')] as [string, React.ReactNode]] : []),
            ...(a.artistKind === 'virtual' ? [[t('row_kind'), t('kind_virtual')] as [string, React.ReactNode]] : []),
          ]
          return (
            <section style={{ border: '1px solid var(--ds-border-strong)', background: 'var(--paper-raised)', padding: '22px 24px' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
                <span style={{ fontFamily: MONO, fontSize: 20, fontWeight: 700, letterSpacing: '0.06em' }}>{svar.tlid}</span>
                <span style={{ fontFamily: MONO, fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: klarerbar ? 'var(--ink)' : 'var(--ember-deep)' }}>
                  {t('registered')} · {klarerbar ? t('clearable_yes') : t('clearable_no')}
                </span>
              </div>
              {a.isDemo && <p style={{ fontSize: 14, color: 'var(--ember-deep)', margin: '0 0 12px' }}>{t('example')}</p>}
              {rader.map(([k, v], i) => (
                <div key={k} style={{ display: 'flex', justifyContent: 'space-between', gap: 16, padding: '10px 0', fontSize: 15, borderTop: `1px solid ${i === 0 ? 'var(--ds-border-strong)' : 'var(--ds-border)'}`, ...(i === rader.length - 1 ? { borderBottom: '1px solid var(--ds-border-strong)' } : {}) }}>
                  <span style={{ color: 'var(--text-muted)' }}>{k}</span>
                  <span style={{ textAlign: 'right' }}>{v}</span>
                </div>
              ))}
              <p style={{ fontSize: 13.5, lineHeight: 1.55, color: 'var(--text-muted)', margin: '14px 0 0' }}>{t('version_note')}</p>
              <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', marginTop: 18, fontSize: 15, fontWeight: 600 }}>
                <Link href={`/stemme/${a.id}`} style={{ color: 'var(--ink)' }}>{t('cta_profile')}</Link>
                {klarerbar && <Link href={`/dashboard/be-om-lisens/${a.id}`} style={{ color: 'var(--ember-deep)' }}>{t('cta_licence')}</Link>}
              </div>
              <p style={{ fontFamily: MONO, fontSize: 11.5, color: 'var(--text-faint)', margin: '18px 0 0', wordBreak: 'break-all' }}>{t('api_note')} {svar.apiUrl}</p>
            </section>
          )
        })()}
      </main>
    </div>
  )
}

function Boks({ tone, children }: { tone: 'advarsel'; children: React.ReactNode }) {
  return (
    <div style={{ border: '1px solid var(--ember-tint-border)', background: 'var(--ember-tint-bg)', color: 'var(--ink)', padding: '14px 16px', fontSize: 15, lineHeight: 1.55 }} data-tone={tone}>
      {children}
    </div>
  )
}
