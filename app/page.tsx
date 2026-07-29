'use client'

import Link from 'next/link'
import { useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { CenterForgeMark, CenterForgeLogo } from '@/components/CenterForgeLogo'
import BombazaLanding from '@/components/BombazaLanding'
import { LangToggle } from '@/components/LangToggle'
import { useTenant } from '@/lib/tenantContext'

const MONO = "var(--font-cfmono), monospace"
const SERIF = "var(--font-serif), serif"
const HANKEN = "var(--font-hanken), sans-serif"

type Stat = { v: string; l: string }

function PlayDot() {
  return (
    <div
      style={{
        width: 30, height: 30, borderRadius: '50%',
        background: 'rgba(255,253,248,0.78)', border: '1px solid rgba(var(--glow,217,82,28),0.35)',
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
  const isDirect = tenant.billing_mode !== 'invoice'
  const stats = t.raw('stats') as Stat[]
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [voicePlaying, setVoicePlaying] = useState(false)
  const toggleVoice = () => {
    if (!audioRef.current) {
      audioRef.current = new Audio(t('ill2_audio'))
      audioRef.current.onended = () => setVoicePlaying(false)
    }
    if (voicePlaying) {
      audioRef.current.pause()
      audioRef.current.currentTime = 0
      setVoicePlaying(false)
    } else {
      audioRef.current.play().then(() => setVoicePlaying(true)).catch(() => {})
    }
  }

  // Bombaza: håndverker-vertikalen ER merket — egen forside i stedet for plattform-landingen
  if (tenant.slug === 'bombaza') return <BombazaLanding />

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
              background: 'radial-gradient(48% 50% at 50% 34%,rgba(var(--glow,217,82,28),0.13),rgba(var(--glow,217,82,28),0.03) 55%,transparent 72%)',
              pointerEvents: 'none',
            }}
          />
          <div style={{ position: 'relative', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 'clamp(40px,5vw,72px)' }}>

            {/* Left column */}
            <div style={{ flex: '1.1 1 380px', minWidth: 300 }}>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 13px', border: '1px solid var(--ember-tint-border)', borderRadius: 999, background: 'var(--ember-tint-bg)', marginBottom: 24 }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--ember)' }} />
                <span style={{ fontFamily: MONO, fontSize: 11.5, fontWeight: 500, letterSpacing: '0.12em', color: 'var(--orb-lo,#B8431A)' }}>{t('badge')}</span>
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

            {/* Right column — godkjenningskortet m/taxameter-lapp (ClaudeDesign, valgt variant) */}
            <div className="vb-illu" style={{ flex: '1 1 380px', minWidth: 320, position: 'relative' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 18, padding: 28, background: '#FFFDF8', border: '1px solid #E4DCCC', borderRadius: 24, boxShadow: '0 24px 60px -30px rgba(20,17,15,0.28)' }}>

                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                  <span style={{ fontFamily: MONO, fontSize: 11, letterSpacing: '0.14em', color: '#8A8478' }}>{t('ill2_head')}</span>
                  <span style={{ fontFamily: MONO, fontSize: 11, letterSpacing: '0.14em', color: '#6B655C' }}>{t('ill2_seg')}</span>
                </div>

                <div style={{ display: 'flex', gap: 20 }}>
                  <div className="vb-slides" style={{ width: '38%', maxWidth: 190, flexShrink: 0, aspectRatio: '9 / 16', borderRadius: 14, position: 'relative', overflow: 'hidden' }}>
                    <div className="vb-slide" style={{ background: 'linear-gradient(165deg, #DFE3F7, #D7D5F0)' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 46, height: 46, borderRadius: 999, background: 'rgba(255,253,248,0.9)', color: '#1C1A16', fontSize: 15 }}>▶</span>
                      <span className="vb-slide-cap" style={{ color: '#6A6C95' }}>{t('ill2_s_video')}</span>
                    </div>
                    <div className="vb-slide" style={{ background: 'linear-gradient(165deg, #F0E4FA, #E2D3F4)', flexDirection: 'column', gap: 8 }}>
                      <span style={{ width: 52, height: 52, borderRadius: 999, background: '#B092DC' }} />
                      <span style={{ width: 92, height: 40, borderRadius: '20px 20px 8px 8px', background: '#C4ABE6' }} />
                      <span className="vb-slide-cap" style={{ color: '#7A5EA8' }}>{t('ill2_s_avatar')}</span>
                    </div>
                    <div className="vb-slide" style={{ background: '#14110F', gap: 3 }}>
                      <i style={{ width: 4, height: '38%', borderRadius: 3, background: '#2A93E0' }} /><i style={{ width: 4, height: '66%', borderRadius: 3, background: '#3A85E4' }} /><i style={{ width: 4, height: '92%', borderRadius: 3, background: '#5273E6' }} /><i style={{ width: 4, height: '58%', borderRadius: 3, background: '#7658E9' }} /><i style={{ width: 4, height: '80%', borderRadius: 3, background: '#8B49E8' }} /><i style={{ width: 4, height: '46%', borderRadius: 3, background: '#7658E9' }} /><i style={{ width: 4, height: '62%', borderRadius: 3, background: '#5273E6' }} />
                      <span className="vb-slide-cap" style={{ color: '#9FC9F5' }}>{t('ill2_s_radio')}</span>
                    </div>
                    <div className="vb-slide" style={{ background: '#F1EBDF', flexDirection: 'column', gap: 7 }}>
                      <span style={{ width: '64%', height: 5, borderRadius: 3, background: '#C9BFA9' }} />
                      <span style={{ width: '72%', height: 4, borderRadius: 3, background: '#DDD5C6' }} />
                      <span style={{ width: '58%', height: 4, borderRadius: 3, background: '#DDD5C6' }} />
                      <span style={{ width: '66%', height: 4, borderRadius: 3, background: '#DDD5C6' }} />
                      <span className="vb-slide-cap" style={{ color: '#6B655C' }}>{t('ill2_s_article')}</span>
                    </div>
                  </div>
                  <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <span style={{ fontFamily: MONO, fontSize: 11, letterSpacing: '0.14em', color: '#8A8478' }}>{t('ill2_vo')}</span>
                    <div style={{ border: '1px solid #E8E0CE', borderRadius: 16, padding: '16px 18px', fontFamily: HANKEN, fontSize: 17, lineHeight: 1.45, color: '#1C1A16' }}>
                      {t('ill2_text')}
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                      <button onClick={toggleVoice} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '9px 16px', borderRadius: 999, border: 'none', cursor: 'pointer', background: voicePlaying ? '#DCC9F5' : '#EDE4FA', fontFamily: HANKEN, fontSize: 15, fontWeight: 600, color: '#6B3FB0' }}>{voicePlaying ? '⏸' : '▶'} {t('ill2_play')}</button>
                      <span style={{ display: 'inline-flex', alignItems: 'center', padding: '9px 16px', borderRadius: 999, background: '#F9F0D4', fontFamily: MONO, fontSize: 11.5, letterSpacing: '0.08em', color: '#9A7B18' }}>{t('ill2_wait')}</span>
                    </div>
                  </div>
                </div>

                <div style={{ height: 1, background: '#E8E0CE' }} />

                <span style={{ fontFamily: MONO, fontSize: 11, letterSpacing: '0.14em', color: '#8A8478' }}>{t('ill2_motion')}</span>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                  <span style={{ padding: '9px 16px', borderRadius: 999, border: '1px solid #DDD5C6', fontFamily: HANKEN, fontSize: 15, color: '#6B655C' }}>{t('ill2_still')}</span>
                  <span style={{ padding: '9px 16px', borderRadius: 999, border: '1px solid #DDD5C6', fontFamily: HANKEN, fontSize: 15, color: '#6B655C' }}>{t('ill2_move')}</span>
                  <span style={{ padding: '9px 16px', borderRadius: 999, border: '1px solid #C9D9F4', background: '#E7EEFB', fontFamily: HANKEN, fontSize: 15, color: '#1C1A16' }}>{t('ill2_talk')} <span style={{ color: '#3B5FA8', fontWeight: 600 }}>{t('ill2_talk_price')}</span></span>
                </div>

                <div className="vb-strip" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px', borderRadius: 14, background: '#14110F' }}>
                  <span aria-hidden="true" style={{ color: '#7FE0A8', fontSize: 13 }}>✓</span>
                  <span style={{ fontFamily: HANKEN, fontSize: 13.5, color: '#F6F1E7', whiteSpace: 'nowrap' }}>{t('ill2_approve')}</span>
                </div>

              </div>

              {/* Taxameter-lappen — utenfor nedre høyre hjørne */}
              <div className="vb-taxi" style={{ background: '#FFFDF8', border: '1px solid #EDE5D6', borderRadius: 20, padding: '18px 22px', boxShadow: '0 24px 60px -30px rgba(20,17,15,0.35)' }}>
                <div style={{ fontFamily: MONO, fontSize: 11, letterSpacing: '0.14em', color: '#8A8478', marginBottom: 10 }}>{t('ill2_taxi')}</div>
                {[
                  { l: t('ill2_paalopt'), v: t('ill2_paalopt_v') },
                  { l: t('ill2_snakk'), v: t('ill2_snakk_v') },
                  { l: t('ill2_bev'), v: t('ill2_bev_v') },
                ].map((r) => (
                  <div key={r.l} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '5px 0', fontFamily: HANKEN, fontSize: 15.5, color: '#3A352C' }}>
                    <span>{r.l}</span>
                    <span style={{ fontVariantNumeric: 'tabular-nums' }}>{r.v}</span>
                  </div>
                ))}
                <div style={{ height: 1, background: '#E8E0CE', margin: '10px 0' }} />
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <span style={{ fontFamily: HANKEN, fontSize: 16, color: '#1C1A16' }}>{t('ill2_next')}</span>
                  <span style={{ fontFamily: SERIF, fontSize: 26, color: '#1C1A16', fontVariantNumeric: 'tabular-nums' }}>{t('ill2_next_v')}</span>
                </div>
              </div>
            </div>

          </div>

          {isDirect && (<>
          {/* Trust strip */}
          <div style={{ marginTop: 'clamp(54px,7vw,84px)', textAlign: 'center' }}>
            <div style={{ fontFamily: MONO, fontSize: 11, fontWeight: 500, letterSpacing: '0.18em', textTransform: 'uppercase', color: '#A89C88', marginBottom: 16 }}>{t('trust')}</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', gap: 14 }}>
              <span style={{ fontFamily: 'var(--font-archivo), sans-serif', fontWeight: 700, fontSize: 18, letterSpacing: '-0.01em', color: '#8A7F6D' }}>Reforhandle</span>
              <span style={{ width: 4, height: 4, borderRadius: '50%', background: '#C8BCA6' }} />
              <span style={{ fontFamily: 'var(--font-archivo), sans-serif', fontWeight: 700, fontSize: 18, letterSpacing: '-0.01em', color: '#8A7F6D' }}>SinglePicker</span>
            </div>
          </div>
          </>)}
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
                icon: (<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--ember)" strokeWidth="1.7" strokeLinejoin="round" strokeLinecap="round"><rect x="3" y="6" width="18" height="14" rx="2.5" /><path d="M3 10 H21" /><path d="M10.4 13 L14.6 15.5 L10.4 18 Z" fill="var(--ember)" stroke="none" /></svg>),
              },
              {
                t: t('f2_t'), d: t('f2_d'),
                icon: (<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--ember)" strokeWidth="1.7" strokeLinejoin="round" strokeLinecap="round"><path d="M6 3 H14 L18 7 V21 H6 Z" /><path d="M14 3 V7 H18" /><path d="M9 12 H15 M9 15.5 H15 M9 8.5 H11.5" /></svg>),
              },
              {
                t: t('f3_t'), d: t('f3_d'),
                icon: (<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--ember)" strokeWidth="1.7" strokeLinejoin="round" strokeLinecap="round"><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11 C5 15 8 17.5 12 17.5 C16 17.5 19 15 19 11" /><path d="M12 17.5 V21" /></svg>),
              },
              {
                t: t('f4_t'), d: t('f4_d'),
                icon: (<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--ember)" strokeWidth="1.7" strokeLinejoin="round" strokeLinecap="round"><circle cx="12" cy="8.5" r="3.5" /><path d="M5 20 C5 16 8 14 12 14 C16 14 19 16 19 20" /></svg>),
              },
              {
                t: t('f5_t'), d: t('f5_d'),
                icon: (<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--ember)" strokeWidth="1.7" strokeLinejoin="round" strokeLinecap="round"><path d="M4 14 A8 8 0 0 1 20 14" /><path d="M12 14 L16 9" /><path d="M4 18 H20" /></svg>),
              },
              {
                t: t('f6_t'), d: t('f6_d'),
                icon: (<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--ember)" strokeWidth="1.7" strokeLinejoin="round" strokeLinecap="round"><rect x="3.5" y="3.5" width="7.5" height="7.5" rx="2" /><rect x="13" y="3.5" width="7.5" height="7.5" rx="2" /><rect x="3.5" y="13" width="7.5" height="7.5" rx="2" /><rect x="13" y="13" width="7.5" height="7.5" rx="2" /></svg>),
              },
            ].map((f) => (
              <div key={f.t} className="cf-card" style={{ position: 'relative', background: '#FFFDF8', border: '1px solid #E6DDCC', borderRadius: 18, padding: 30, overflow: 'hidden', boxShadow: '0 1px 2px rgba(70,45,20,0.04)' }}>
                <div aria-hidden="true" style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: 'linear-gradient(90deg,transparent,rgba(var(--glow,217,82,28),0.5),transparent)' }} />
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

        {/* Stemmebanken */}
        <section id="stemmebank" style={{ position: 'relative', background: '#ECE3D2', borderTop: '1px solid #E0D7C6', borderBottom: '1px solid #E0D7C6' }}>
          <div style={{ maxWidth: 1180, margin: '0 auto', padding: 'clamp(56px,8vw,104px) 28px' }}>
            <div style={{ maxWidth: 720, margin: '0 auto clamp(40px,5vw,56px)', textAlign: 'center' }}>
              <h2 style={{ fontFamily: SERIF, fontWeight: 400, fontSize: 'clamp(32px,4.3vw,50px)', lineHeight: 1.06, letterSpacing: '-0.01em', color: 'var(--ink)', margin: '0 0 14px' }}>{t('vb_title')}</h2>
              <p style={{ fontFamily: HANKEN, fontSize: 18, lineHeight: 1.6, color: 'var(--text-muted)', margin: 0 }}>{t('vb_sub')}</p>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(250px,1fr))', gap: 18, maxWidth: 1100, margin: '0 auto' }}>
              {[
                { t: t('vb1_t'), d: t('vb1_d') },
                { t: t('vb2_t'), d: t('vb2_d') },
                { t: t('vb3_t'), d: t('vb3_d') },
                { t: t('vb4_t'), d: t('vb4_d') },
              ].map((f) => (
                <div key={f.t} style={{ background: '#FFFDF8', border: '1px solid #E6DDCC', borderRadius: 18, padding: '26px 26px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--ember)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ flex: 'none' }}><path d="M5 12.5 L10 17 L19 6.5" /></svg>
                    <h3 style={{ fontFamily: HANKEN, fontWeight: 700, fontSize: 18, letterSpacing: '-0.01em', color: 'var(--ink)', margin: 0 }}>{f.t}</h3>
                  </div>
                  <p style={{ fontFamily: HANKEN, fontSize: 15, lineHeight: 1.6, color: '#6B6358', margin: 0 }}>{f.d}</p>
                </div>
              ))}
            </div>
            <p style={{ textAlign: 'center', fontFamily: HANKEN, fontSize: 15, color: 'var(--ember-deep)', margin: '30px auto 0', maxWidth: 620 }}>{t('vb_note')}</p>
          </div>
        </section>

        {/* Plattformen: white-label + API */}
        <section id="plattform" style={{ position: 'relative', maxWidth: 1180, margin: '0 auto', padding: 'clamp(56px,8vw,104px) 28px' }}>
          <div style={{ maxWidth: 680, margin: '0 auto clamp(40px,5vw,56px)', textAlign: 'center' }}>
            <h2 style={{ fontFamily: SERIF, fontWeight: 400, fontSize: 'clamp(32px,4.3vw,50px)', lineHeight: 1.06, letterSpacing: '-0.01em', color: 'var(--ink)', margin: '0 0 14px' }}>{t('pf_title')}</h2>
            <p style={{ fontFamily: HANKEN, fontSize: 18, lineHeight: 1.6, color: 'var(--text-muted)', margin: 0 }}>{t('pf_sub', { name: tenant.app_name })}</p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(300px,1fr))', gap: 18, maxWidth: 1000, margin: '0 auto' }}>
            <div className="cf-card" style={{ position: 'relative', background: '#FFFDF8', border: '1px solid #E6DDCC', borderRadius: 18, padding: 32, overflow: 'hidden' }}>
              <div aria-hidden="true" style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: 'linear-gradient(90deg,transparent,rgba(var(--glow,217,82,28),0.5),transparent)' }} />
              <h3 style={{ fontFamily: HANKEN, fontWeight: 700, fontSize: 21, letterSpacing: '-0.01em', color: 'var(--ink)', margin: '0 0 11px' }}>{t('pf1_t')}</h3>
              <p style={{ fontFamily: HANKEN, fontSize: 15.5, lineHeight: 1.6, color: '#6B6358', margin: '0 0 22px' }}>{isDirect ? t('pf1_d') : t('pf1_d_partner')}</p>
              <Link href="/white-label" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontFamily: HANKEN, fontWeight: 700, fontSize: 15.5, color: 'var(--ember-deep)', border: '1px solid var(--ember-tint-border)', background: 'var(--ember-tint-bg)', borderRadius: 999, padding: '12px 22px', textDecoration: 'none' }}>{t('pf1_cta')} →</Link>
            </div>
            <div className="cf-card" style={{ position: 'relative', background: '#FFFDF8', border: '1px solid #E6DDCC', borderRadius: 18, padding: 32, overflow: 'hidden' }}>
              <div aria-hidden="true" style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: 'linear-gradient(90deg,transparent,rgba(var(--glow,217,82,28),0.5),transparent)' }} />
              <h3 style={{ fontFamily: HANKEN, fontWeight: 700, fontSize: 21, letterSpacing: '-0.01em', color: 'var(--ink)', margin: '0 0 11px' }}>{t('pf2_t')}</h3>
              <p style={{ fontFamily: HANKEN, fontSize: 15.5, lineHeight: 1.6, color: '#6B6358', margin: '0 0 18px' }}>{t('pf2_d')}</p>
              <code style={{ display: 'block', fontFamily: MONO, fontSize: 12.5, lineHeight: 1.7, color: '#4A4438', background: '#F7F1E6', border: '1px solid #E6DDCC', borderRadius: 10, padding: '12px 14px', overflowX: 'auto', whiteSpace: 'pre' }}>{'POST /gateway/v1/speech\n{ "assetId": "ast_kari", "text": "…" }'}</code>
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer style={{ position: 'relative', zIndex: 2, maxWidth: 1180, margin: '0 auto', padding: 'clamp(48px,6vw,72px) 28px 48px' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 24 }}>
            <div style={{ maxWidth: 340 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 11, marginBottom: 12 }}>
                <CenterForgeLogo size={22} wordmarkSize={17} />
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
          <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: 8, fontFamily: MONO, fontSize: 11.5, letterSpacing: '0.04em', color: '#A89C88' }}>
            <span>{t('footer', { year: new Date().getFullYear(), name: tenant.app_name })}</span>
            {tenant.billing_mode === 'invoice' && <span>Powered by Norditech</span>}
          </div>
        </footer>

      </main>
    </div>
  )
}
