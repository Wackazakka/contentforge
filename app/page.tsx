'use client'

import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { CenterForgeMark, CenterForgeLogo } from '@/components/CenterForgeLogo'
import { LangToggle } from '@/components/LangToggle'
import { useTenant } from '@/lib/tenantContext'

const MONO = "var(--font-cfmono), monospace"
const SERIF = "var(--font-serif), serif"
const HANKEN = "var(--font-hanken), sans-serif"

type Stat = { v: string; l: string }
type Tier = { name: string; price: string; popular: boolean; feats: string[] }

function PlayDot() {
  return (
    <div
      style={{
        width: 30, height: 30, borderRadius: '50%',
        background: 'rgba(255,253,248,0.78)', border: '1px solid rgba(217,82,28,0.35)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <svg width="10" height="11" viewBox="0 0 11 12"><path d="M0 0 L11 6 L0 12 Z" fill="var(--ember)" /></svg>
    </div>
  )
}

export default function Home() {
  const t = useTranslations('home')
  const tenant = useTenant()
  const showPricing = tenant.billing_mode !== 'invoice'
  const stats = t.raw('stats') as Stat[]
  const tiers = t.raw('tiers') as Tier[]

  return (
    <div
      id="top"
      style={{
        position: 'relative',
        background: 'var(--paper)',
        minHeight: '100vh',
        fontFamily: HANKEN,
        overflowX: 'hidden',
        color: 'var(--ink)',
      }}
    >
      <div className="cf-grain" aria-hidden="true" />

      {/* Header */}
      <header
        style={{
          position: 'sticky', top: 0, zIndex: 50,
          backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)',
          background: 'rgba(244,238,226,0.8)', borderBottom: '1px solid #E2D9C8',
        }}
      >
        <div
          style={{
            maxWidth: 1180, margin: '0 auto', padding: '15px 28px',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 24,
          }}
        >
          <a href="#top" style={{ textDecoration: 'none' }}>
            <CenterForgeLogo size={30} wordmarkSize={20} />
          </a>
          <nav style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <LangToggle />
            {showPricing && (
              <a
                href="#priser"
                className="cf-nav-link"
                style={{ fontFamily: HANKEN, fontSize: 15, fontWeight: 500, color: 'var(--text-muted)', textDecoration: 'none', padding: '8px 14px' }}
              >
                {t('nav_pricing')}
              </a>
            )}
            <Link
              href="/login"
              className="cf-btn-ink"
              style={{ fontFamily: HANKEN, fontSize: 15, fontWeight: 600, color: '#F4EEE2', textDecoration: 'none', background: '#1C1A16', borderRadius: 999, padding: '10px 18px' }}
            >
              {t('nav_login')} →
            </Link>
          </nav>
        </div>
      </header>

      <main style={{ position: 'relative', zIndex: 2 }}>

        {/* Hero */}
        <section style={{ position: 'relative', maxWidth: 1180, margin: '0 auto', padding: 'clamp(48px,7vw,96px) 28px clamp(40px,6vw,72px)' }}>
          <div
            aria-hidden="true"
            style={{
              position: 'absolute', top: -70, left: '50%', transform: 'translateX(-50%)',
              width: 'min(880px,92%)', height: 480,
              background: 'radial-gradient(48% 50% at 50% 34%,rgba(217,82,28,0.13),rgba(217,82,28,0.03) 55%,transparent 72%)',
              pointerEvents: 'none',
            }}
          />
          <div style={{ position: 'relative', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 'clamp(40px,5vw,72px)' }}>

            {/* Left column */}
            <div style={{ flex: '1.1 1 380px', minWidth: 300 }}>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 13px', border: '1px solid var(--ember-tint-border)', borderRadius: 999, background: 'var(--ember-tint-bg)', marginBottom: 24 }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--ember)' }} />
                <span style={{ fontFamily: MONO, fontSize: 11.5, fontWeight: 500, letterSpacing: '0.12em', color: '#B8431A' }}>{t('badge')}</span>
              </div>
              <h1 style={{ fontFamily: SERIF, fontWeight: 400, fontSize: 'clamp(42px,5.8vw,70px)', lineHeight: 1.04, letterSpacing: '-0.01em', color: 'var(--ink)', overflowWrap: 'break-word', margin: '0 0 20px' }}>
                {t('hero_a')}<span style={{ fontStyle: 'italic', color: 'var(--ember)' }}>{t('hero_em')}</span>
              </h1>
              <p style={{ fontFamily: HANKEN, fontSize: 'clamp(17px,1.4vw,19px)', lineHeight: 1.6, color: 'var(--text-muted)', maxWidth: 470, margin: '0 0 32px' }}>{t('hero_sub')}</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 13, marginBottom: 46 }}>
                <Link href="/register" className="cf-btn-ink" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontFamily: HANKEN, fontWeight: 700, fontSize: 16, color: '#F4EEE2', background: '#1C1A16', borderRadius: 999, padding: '15px 28px', textDecoration: 'none', boxShadow: '0 12px 30px -12px rgba(28,26,22,0.5)' }}>
                  {t('cta_primary')} →
                </Link>
                <Link href="/start" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontFamily: HANKEN, fontWeight: 700, fontSize: 16, color: 'var(--ember-deep)', background: 'transparent', border: '1px solid var(--ember-tint-border)', borderRadius: 999, padding: '15px 28px', textDecoration: 'none' }}>
                  🎬 Prøv uten konto
                </Link>
                <a href="#features" className="cf-btn-ghost" style={{ display: 'inline-flex', alignItems: 'center', fontFamily: HANKEN, fontWeight: 600, fontSize: 16, color: 'var(--ink)', background: 'transparent', border: '1px solid #D2C7B2', borderRadius: 999, padding: '15px 26px', textDecoration: 'none' }}>
                  {t('cta_secondary')}
                </a>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 38 }}>
                {stats.map((s, i) => (
                  <div key={i} style={{ minWidth: 80 }}>
                    <div style={{ fontFamily: SERIF, fontWeight: 400, fontSize: 32, lineHeight: 1, color: 'var(--ink)' }}>{s.v}</div>
                    <div style={{ fontFamily: MONO, fontSize: 10.5, fontWeight: 500, letterSpacing: '0.13em', textTransform: 'uppercase', color: '#978B79', marginTop: 6 }}>{s.l}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Right column — forge visualization */}
            <div style={{ flex: '1 1 380px', minWidth: 320, position: 'relative' }}>
              <div aria-hidden="true" style={{ position: 'absolute', inset: '-8% -6%', background: 'radial-gradient(50% 44% at 50% 40%,rgba(217,82,28,0.16),transparent 70%)', pointerEvents: 'none' }} />
              <div style={{ position: 'relative', background: '#FFFDF8', border: '1px solid #E6DDCC', borderRadius: 22, padding: 22, boxShadow: '0 40px 70px -45px rgba(70,45,20,0.4)' }}>

                <div style={{ fontFamily: MONO, fontSize: 10.5, fontWeight: 500, letterSpacing: '0.16em', color: '#978B79', marginBottom: 8 }}>{t('brief_label')}</div>
                <div style={{ background: '#F7F1E6', border: '1px solid #E6DDCC', borderRadius: 12, padding: '13px 15px', fontFamily: HANKEN, color: '#3A352C', fontSize: 13.5, lineHeight: 1.5 }}>
                  {t('brief_text')}
                  <span className="cf-anim-blink" style={{ display: 'inline-block', width: 2, height: 14, background: 'var(--ember)', marginLeft: 3, verticalAlign: -2 }} />
                </div>

                <div style={{ position: 'relative', height: 30, display: 'flex', justifyContent: 'center' }}>
                  <div style={{ width: 2, height: '100%', background: 'linear-gradient(rgba(217,82,28,0.12),rgba(217,82,28,0.6))' }} />
                  <div className="cf-anim-spark" style={{ position: 'absolute', left: '50%', marginLeft: -3, width: 6, height: 6, borderRadius: '50%', background: '#F0954E', boxShadow: '0 0 9px 2px rgba(217,82,28,0.6)' }} />
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 9 }}>
                  <div style={{ position: 'relative', width: 64, height: 64, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div className="cf-anim-glow" style={{ position: 'absolute', inset: -15, borderRadius: '50%', background: 'radial-gradient(circle,rgba(217,82,28,0.4),transparent 66%)' }} />
                    <div className="cf-anim-pulse" style={{ position: 'relative', width: 64, height: 64, borderRadius: '50%', background: 'radial-gradient(circle at 38% 30%,#FFC079,#E8632B 52%,#B8431A)', boxShadow: 'inset 0 0 16px rgba(255,210,150,0.6),0 0 26px rgba(217,82,28,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <svg width="27" height="27" viewBox="0 0 32 32" aria-hidden="true"><path d="M16 5 Q17.8 14.2 27 16 Q17.8 17.8 16 27 Q14.2 17.8 5 16 Q14.2 14.2 16 5 Z" fill="#FFF6E8" /></svg>
                    </div>
                  </div>
                  <div style={{ fontFamily: MONO, fontSize: 10.5, fontWeight: 500, letterSpacing: '0.16em', color: '#C0531F' }}>{t('forge_label')}…</div>
                </div>

                <div style={{ position: 'relative', height: 26, display: 'flex', justifyContent: 'center' }}>
                  <div style={{ width: 2, height: '100%', background: 'linear-gradient(rgba(217,82,28,0.6),rgba(217,82,28,0.1))' }} />
                </div>

                <div style={{ fontFamily: MONO, fontSize: 10.5, fontWeight: 500, letterSpacing: '0.16em', color: '#978B79', marginBottom: 10 }}>{t('output_label')}</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  {[
                    { ratio: '16:9', bg: 'linear-gradient(135deg,#F1DDC4,#E6B58E)' },
                    { ratio: '9:16', bg: 'linear-gradient(135deg,#EFD9CE,#E0A98F)' },
                    { ratio: '1:1', bg: 'linear-gradient(135deg,#EFE1C5,#DFC089)' },
                  ].map((tile) => (
                    <div key={tile.ratio} style={{ position: 'relative', border: '1px solid #E6DDCC', borderRadius: 11, overflow: 'hidden', height: 76, background: tile.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <span style={{ position: 'absolute', top: 7, left: 7, fontFamily: MONO, fontSize: 9, letterSpacing: '0.08em', color: '#5A3B22', background: 'rgba(255,253,248,0.75)', padding: '2px 6px', borderRadius: 5 }}>{tile.ratio}</span>
                      <PlayDot />
                    </div>
                  ))}
                  <div style={{ position: 'relative', border: '1px solid #E6DDCC', borderRadius: 11, overflow: 'hidden', height: 76, background: '#F7F1E6', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 6, padding: '0 14px' }}>
                    <span style={{ position: 'absolute', top: 7, left: 7, fontFamily: MONO, fontSize: 9, letterSpacing: '0.08em', color: '#B8431A', background: '#F3E0D2', padding: '2px 6px', borderRadius: 5 }}>{t('out_article')}</span>
                    <div style={{ height: 5, width: '86%', borderRadius: 3, background: 'rgba(28,26,22,0.16)', marginTop: 14 }} />
                    <div style={{ height: 5, width: '62%', borderRadius: 3, background: 'rgba(28,26,22,0.10)' }} />
                    <div style={{ height: 5, width: '74%', borderRadius: 3, background: 'rgba(28,26,22,0.10)' }} />
                  </div>
                </div>

              </div>
            </div>

          </div>

          {/* Trust strip */}
          <div style={{ marginTop: 'clamp(54px,7vw,84px)', textAlign: 'center' }}>
            <div style={{ fontFamily: MONO, fontSize: 11, fontWeight: 500, letterSpacing: '0.18em', textTransform: 'uppercase', color: '#A89C88', marginBottom: 16 }}>{t('trust')}</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', gap: 14 }}>
              <span style={{ fontFamily: 'var(--font-archivo), sans-serif', fontWeight: 700, fontSize: 18, letterSpacing: '-0.01em', color: '#8A7F6D' }}>Reforhandle</span>
              <span style={{ width: 4, height: 4, borderRadius: '50%', background: '#C8BCA6' }} />
              <span style={{ fontFamily: 'var(--font-archivo), sans-serif', fontWeight: 700, fontSize: 18, letterSpacing: '-0.01em', color: '#8A7F6D' }}>SinglePicker</span>
            </div>
          </div>
        </section>

        {/* Features */}
        <section id="features" style={{ position: 'relative', maxWidth: 1180, margin: '0 auto', padding: 'clamp(56px,8vw,104px) 28px' }}>
          <div style={{ maxWidth: 680, margin: '0 auto clamp(40px,5vw,56px)', textAlign: 'center' }}>
            <h2 style={{ fontFamily: SERIF, fontWeight: 400, fontSize: 'clamp(32px,4.3vw,50px)', lineHeight: 1.06, letterSpacing: '-0.01em', color: 'var(--ink)', margin: '0 0 14px' }}>{t('feat_title')}</h2>
            <p style={{ fontFamily: HANKEN, fontSize: 18, lineHeight: 1.6, color: 'var(--text-muted)', margin: 0 }}>{t('feat_sub')}</p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', gap: 18 }}>
            {[
              {
                t: t('f1_t'), d: t('f1_d'),
                icon: (<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--ember)" strokeWidth="1.7" strokeLinejoin="round" strokeLinecap="round"><rect x="3" y="6" width="18" height="14" rx="2.5" /><path d="M3 10 H21" /><path d="M7 6 L9 10 M12 6 L14 10 M16.5 6 L18.5 10" /><path d="M10.4 13 L14.6 15.5 L10.4 18 Z" fill="var(--ember)" stroke="none" /></svg>),
              },
              {
                t: t('f2_t'), d: t('f2_d'),
                icon: (<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--ember)" strokeWidth="1.7" strokeLinejoin="round" strokeLinecap="round"><path d="M6 3 H14 L18 7 V21 H6 Z" /><path d="M14 3 V7 H18" /><path d="M9 12 H15 M9 15.5 H15 M9 8.5 H11.5" /></svg>),
              },
              {
                t: t('f3_t'), d: t('f3_d'),
                icon: (<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--ember)" strokeWidth="1.7" strokeLinejoin="round" strokeLinecap="round"><path d="M12 3 L19 5.6 V11 C19 15.6 16 19 12 21 C8 19 5 15.6 5 11 V5.6 Z" /><path d="M9 11.6 L11.2 13.8 L15.4 9.2" /></svg>),
              },
            ].map((f) => (
              <div key={f.t} className="cf-card" style={{ position: 'relative', background: '#FFFDF8', border: '1px solid #E6DDCC', borderRadius: 18, padding: 30, overflow: 'hidden', boxShadow: '0 1px 2px rgba(70,45,20,0.04)' }}>
                <div aria-hidden="true" style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: 'linear-gradient(90deg,transparent,rgba(217,82,28,0.5),transparent)' }} />
                <div style={{ width: 48, height: 48, borderRadius: 13, background: 'var(--ember-tint-bg)', border: '1px solid var(--ember-tint-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 22 }}>{f.icon}</div>
                <h3 style={{ fontFamily: HANKEN, fontWeight: 700, fontSize: 21, letterSpacing: '-0.01em', color: 'var(--ink)', margin: '0 0 11px' }}>{f.t}</h3>
                <p style={{ fontFamily: HANKEN, fontSize: 15.5, lineHeight: 1.6, color: '#6B6358', margin: 0 }}>{f.d}</p>
              </div>
            ))}
          </div>
          <div style={{ textAlign: 'center', marginTop: 'clamp(40px,5vw,52px)' }}>
            <Link href="/register" className="cf-btn-ink" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontFamily: HANKEN, fontWeight: 700, fontSize: 16, color: '#F4EEE2', background: '#1C1A16', borderRadius: 999, padding: '15px 30px', textDecoration: 'none', boxShadow: '0 12px 30px -12px rgba(28,26,22,0.5)' }}>
              {t('mid_cta')} →
            </Link>
          </div>
        </section>

        {/* Pricing */}
        {showPricing && (
        <section id="priser" style={{ position: 'relative', background: '#ECE3D2', borderTop: '1px solid #E0D7C6', borderBottom: '1px solid #E0D7C6' }}>
          <div style={{ maxWidth: 1180, margin: '0 auto', padding: 'clamp(56px,8vw,104px) 28px' }}>
            <div style={{ maxWidth: 680, margin: '0 auto clamp(40px,5vw,56px)', textAlign: 'center' }}>
              <h2 style={{ fontFamily: SERIF, fontWeight: 400, fontSize: 'clamp(32px,4.3vw,50px)', lineHeight: 1.06, letterSpacing: '-0.01em', color: 'var(--ink)', margin: '0 0 14px' }}>{t('price_title')}</h2>
              <p style={{ fontFamily: HANKEN, fontSize: 18, lineHeight: 1.6, color: 'var(--text-muted)', margin: 0 }}>{t('price_sub')}</p>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(270px,1fr))', gap: 18, alignItems: 'start', maxWidth: 1000, margin: '0 auto' }}>
              {tiers.map((tier) => (
                <div key={tier.name} style={{ position: 'relative', background: '#FFFDF8', border: '1px solid #E6DDCC', borderRadius: 20, padding: '30px 28px', boxShadow: '0 2px 6px rgba(70,45,20,0.05)' }}>
                  {tier.popular && (
                    <>
                      <div aria-hidden="true" style={{ position: 'absolute', inset: -1, borderRadius: 20, border: '1.5px solid #E0742F', boxShadow: '0 0 40px -10px rgba(217,82,28,0.4)', pointerEvents: 'none' }} />
                      <div style={{ position: 'absolute', top: -13, left: '50%', transform: 'translateX(-50%)', fontFamily: MONO, fontSize: 10, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#FFF4E8', background: 'linear-gradient(135deg,#E8632B,var(--ember-deep))', padding: '5px 13px', borderRadius: 999, whiteSpace: 'nowrap' }}>{t('popular')}</div>
                    </>
                  )}
                  <div style={{ position: 'relative' }}>
                    <div style={{ fontFamily: HANKEN, fontWeight: 700, fontSize: 18, letterSpacing: '0.01em', color: 'var(--ink)', marginBottom: 14 }}>{tier.name}</div>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 5, marginBottom: 22 }}>
                      <span style={{ fontFamily: SERIF, fontWeight: 400, fontSize: 42, lineHeight: 1, color: 'var(--ink)' }}>{tier.price}</span>
                      <span style={{ fontFamily: HANKEN, fontSize: 15, color: '#978B79' }}>{t('per')}</span>
                    </div>
                    <div style={{ height: 1, background: '#E6DDCC', marginBottom: 20 }} />
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 13, marginBottom: 28 }}>
                      {tier.feats.map((f) => (
                        <div key={f} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="var(--ember)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ flex: 'none', marginTop: 1 }}><path d="M5 12.5 L10 17 L19 6.5" /></svg>
                          <span style={{ fontFamily: HANKEN, fontSize: 15, lineHeight: 1.4, color: '#4A4438' }}>{f}</span>
                        </div>
                      ))}
                    </div>
                    <Link href="/register" className="cf-price-cta" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: HANKEN, fontWeight: 700, fontSize: 15.5, color: 'var(--ember-deep)', background: 'transparent', border: '1px solid #E3A883', borderRadius: 999, padding: '13px 20px', textDecoration: 'none' }}>{t('price_cta')}</Link>
                  </div>
                </div>
              ))}
            </div>
            <p style={{ textAlign: 'center', fontFamily: HANKEN, fontSize: 14, color: '#978B79', margin: '32px 0 0' }}>{t('fine')}</p>
          </div>
        </section>
        )}

        {/* Footer */}
        <footer style={{ position: 'relative', zIndex: 2, maxWidth: 1180, margin: '0 auto', padding: 'clamp(48px,6vw,72px) 28px 48px' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 24 }}>
            <div style={{ maxWidth: 340 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 11, marginBottom: 12 }}>
                <CenterForgeMark size={26} />
                <span style={{ fontFamily: 'var(--font-archivo), sans-serif', fontWeight: 800, fontSize: 18, letterSpacing: '-0.02em', color: 'var(--ink)' }}>CenterForge</span>
              </div>
              <p style={{ fontFamily: HANKEN, fontSize: 14, lineHeight: 1.5, color: '#978B79', margin: 0 }}>{t('foot_tag')}</p>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <Link href="/white-label" className="cf-nav-link" style={{ fontFamily: HANKEN, fontSize: 14, color: '#6B6358', textDecoration: 'none' }}>{t('foot_whitelabel')}</Link>
              <Link href="/privacy" className="cf-nav-link" style={{ fontFamily: HANKEN, fontSize: 14, color: '#6B6358', textDecoration: 'none' }}>{t('foot_privacy')}</Link>
              <Link href="/terms" className="cf-nav-link" style={{ fontFamily: HANKEN, fontSize: 14, color: '#6B6358', textDecoration: 'none' }}>{t('foot_terms')}</Link>
            </div>
          </div>
          <div style={{ height: 1, background: '#E0D7C6', margin: '28px 0 18px' }} />
          <div style={{ fontFamily: MONO, fontSize: 11.5, letterSpacing: '0.04em', color: '#A89C88' }}>{t('footer', { year: new Date().getFullYear() })}</div>
        </footer>

      </main>
    </div>
  )
}
