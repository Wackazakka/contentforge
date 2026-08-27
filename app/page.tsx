'use client'

import Link from 'next/link'
import { useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { CenterForgeMark, CenterForgeLogo } from '@/components/CenterForgeLogo'
import BombazaLanding from '@/components/BombazaLanding'
import BadeOgLanding from '@/components/BadeOgLanding'
import VoiceBankLanding from '@/components/VoiceBankLanding'
import StandardRopertLanding from '@/components/StandardRopertLanding'
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
        background: 'color-mix(in srgb, var(--paper-raised) 78%, transparent)', border: '1px solid rgba(var(--glow,217,82,28),0.35)',
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
  // Artist-tenanter (IndigoBoom, Isabel) selger promo til band — ikke
  // skuespillerstemmer, artikler eller radiospoter
  const erArtist = tenant.vertical === 'music'
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
  // Både Og: stemmeforvaltning i front (badeog.no-uttrykket), ikke innholdsproduksjon
  if (tenant.slug === 'badeog') return <BadeOgLanding />
  // VoiceBank: rettighetsforvaltning i front. Malgruppen er BYRAER som skal
  // lisensiere plattformen, ikke sluttkunder — de ser byraets merke, ikke dette.
  if (tenant.slug === 'voicebank') return <VoiceBankLanding />
  // Standard Ropert: Standard Festmagasins white-label av Studio — invitasjoner,
  // gratulasjoner og kunngjoeringer. Kun produksjon; stemmebanken er skjult
  // via twinledger_enabled=false paa tenant-raden.
  if (tenant.slug === 'standardropert') return <StandardRopertLanding />

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
          background: 'color-mix(in srgb, var(--paper) 80%, transparent)', borderBottom: '1px solid #E2D9C8',
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
            {/* Skjules paa tjenester som bare tilbyr ett spraak (Lars 3/8) */}
            {tenant.show_language_toggle !== false && <LangToggle />}
            <Link
              href="/login"
              className="cf-btn-ink"
              style={{ fontFamily: HANKEN, fontSize: 15, fontWeight: 600, color: 'var(--paper)', textDecoration: 'none', background: 'var(--ink)', borderRadius: 999, padding: '10px 18px' }}
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
                <span style={{ fontFamily: MONO, fontSize: 11.5, fontWeight: 500, letterSpacing: '0.12em', color: 'var(--orb-lo,var(--orb-lo))' }}>{t('badge')}</span>
              </div>
              <h1 style={{ fontFamily: SERIF, fontWeight: 400, fontSize: 'clamp(42px,5.8vw,70px)', lineHeight: 1.04, letterSpacing: '-0.01em', color: 'var(--ink)', overflowWrap: 'break-word', margin: '0 0 20px' }}>
                {t('hero_a')}<span style={{ fontStyle: 'italic', color: 'var(--ember)' }}>{t('hero_em')}</span>
              </h1>
              <p style={{ fontFamily: HANKEN, fontSize: 'clamp(17px,1.4vw,19px)', lineHeight: 1.6, color: 'var(--text-muted)', maxWidth: 470, margin: '0 0 32px' }}>{t('hero_sub')}</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 13, marginBottom: 46 }}>
                <Link href="/register" className="cf-btn-ink" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontFamily: HANKEN, fontWeight: 700, fontSize: 16, color: 'var(--paper)', background: 'var(--ink)', borderRadius: 999, padding: '15px 28px', textDecoration: 'none', boxShadow: '0 12px 30px -12px color-mix(in srgb, var(--ink) 50%, transparent)' }}>
                  {t('cta_primary')} →
                </Link>
                {/* «Prøv uten konto» hører bare hjemme på CenterForge selv (David
                    3/8). /start legger anonyme produksjoner under CenterForges
                    sentinel-produkt, så på en white-label sender knappen kunden ut
                    av merkevaren de nettopp kom til. Teksten var dessuten hardkodet
                    norsk og sto uoversatt på Isabels engelske side. */}
                {isDirect && (
                <Link href="/start" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontFamily: HANKEN, fontWeight: 700, fontSize: 16, color: 'var(--ember-deep)', background: 'transparent', border: '1px solid var(--ember-tint-border)', borderRadius: 999, padding: '15px 28px', textDecoration: 'none' }}>
                  🎬 Prøv uten konto
                </Link>
                )}
                <a href="#features" className="cf-btn-ghost" style={{ display: 'inline-flex', alignItems: 'center', fontFamily: HANKEN, fontWeight: 600, fontSize: 16, color: 'var(--ink)', background: 'transparent', border: '1px solid #D2C7B2', borderRadius: 999, padding: '15px 26px', textDecoration: 'none' }}>
                  {t('cta_secondary')}
                </a>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 38 }}>
                {stats.map((s, i) => (
                  <div key={i} style={{ minWidth: 80 }}>
                    <div style={{ fontFamily: SERIF, fontWeight: 400, fontSize: 32, lineHeight: 1, color: 'var(--ink)' }}>{s.v}</div>
                    <div style={{ fontFamily: MONO, fontSize: 10.5, fontWeight: 500, letterSpacing: '0.13em', textTransform: 'uppercase', color: 'var(--text-faint)', marginTop: 6 }}>{s.l}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Right column — godkjenningskortet m/taxameter-lapp (ClaudeDesign, valgt variant) */}
            <div className="vb-illu" style={{ flex: '1 1 380px', minWidth: 320, position: 'relative' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 18, padding: 28, background: 'var(--paper-raised)', border: '1px solid #E4DCCC', borderRadius: 24, boxShadow: '0 24px 60px -30px rgba(20,17,15,0.28)' }}>

                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                  <span style={{ fontFamily: MONO, fontSize: 11, letterSpacing: '0.14em', color: '#8A8478' }}>{t('ill2_head')}</span>
                  <span style={{ fontFamily: MONO, fontSize: 11, letterSpacing: '0.14em', color: '#6B655C' }}>{t('ill2_seg')}</span>
                </div>

                <div style={{ display: 'flex', gap: 20 }}>
                  <div className="vb-slides" style={{ width: '38%', maxWidth: 190, flexShrink: 0, aspectRatio: '9 / 16', borderRadius: 14, position: 'relative', overflow: 'hidden' }}>
                  {erArtist ? (<>
                    {/* Artist-varianten (Lars 3/8): karusellen viste avatar og
                        en artikkel med tekstlinjer - to ting artisten ikke
                        faar. Naa: promoen, laata under, coveret og reelen. */}
                    <div className="vb-slide" style={{ background: 'linear-gradient(165deg, #2B2140, #140E22)' }}>
                      {/* Vokalist i spotlight — logoen hennes har band i linsa,
                          saa silhuetter er allerede merkevarens spraak (Lars 3/8) */}
                      <svg viewBox="0 0 100 160" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} aria-hidden="true">
                        <defs>
                          <linearGradient id="spotA" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0" stopColor="#C9B3EC" stopOpacity="0.42" />
                            <stop offset="1" stopColor="#C9B3EC" stopOpacity="0" />
                          </linearGradient>
                        </defs>
                        <path d="M50 0 L84 150 L16 150 Z" fill="url(#spotA)" />
                        <g fill="#0E0918">
                          <circle cx="50" cy="66" r="12" />
                          <path d="M32 150 C32 118 38 100 50 100 C62 100 68 118 68 150 Z" />
                          <path d="M62 104 C72 100 76 92 74 84" stroke="#0E0918" strokeWidth="5" fill="none" strokeLinecap="round" />
                        </g>
                        <circle cx="74" cy="80" r="6" fill="#0E0918" />
                        <circle cx="74" cy="79" r="2.6" fill="#C9B3EC" opacity="0.75" />
                      </svg>
                      <span style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 42, height: 42, borderRadius: 999, background: 'rgba(255,255,255,0.92)', color: '#1B1226', fontSize: 14, marginTop: 54 }}>&#9654;</span>
                      <span className="vb-slide-cap" style={{ color: '#C4AEEA' }}>{t('ill2_s_video')}</span>
                    </div>
                    <div className="vb-slide" style={{ background: '#14110F', gap: 3 }}>
                      <i style={{ width: 4, height: '38%', borderRadius: 3, background: '#7848C0' }} /><i style={{ width: 4, height: '72%', borderRadius: 3, background: '#8B5AD0' }} /><i style={{ width: 4, height: '94%', borderRadius: 3, background: '#9060C0' }} /><i style={{ width: 4, height: '56%', borderRadius: 3, background: '#A97FE0' }} /><i style={{ width: 4, height: '84%', borderRadius: 3, background: '#8B5AD0' }} /><i style={{ width: 4, height: '44%', borderRadius: 3, background: '#7848C0' }} /><i style={{ width: 4, height: '66%', borderRadius: 3, background: '#9060C0' }} />
                      <span className="vb-slide-cap" style={{ color: '#C4AEEA' }}>{t('ill2_s_radio')}</span>
                    </div>
                    <div className="vb-slide" style={{ background: 'linear-gradient(165deg, #3A2456, #1E1330)' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 74, height: 74, borderRadius: 999, background: 'radial-gradient(circle at 50% 50%, #C9B3EC 0 12%, #3B2A57 12% 46%, #55407A 46% 100%)' }}>
                        <span style={{ width: 10, height: 10, borderRadius: 999, background: '#F3ECFB' }} />
                      </span>
                      <span className="vb-slide-cap" style={{ color: '#C4AEEA' }}>{t('ill2_s_avatar')}</span>
                    </div>
                    <div className="vb-slide" style={{ background: 'linear-gradient(165deg, #241A38, #100B1C)' }}>
                      {/* Band paa scene — samme motiv som i logoens linse */}
                      <svg viewBox="0 0 100 160" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} aria-hidden="true">
                        <defs>
                          <linearGradient id="beamA" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0" stopColor="#A97FE0" stopOpacity="0.5" />
                            <stop offset="1" stopColor="#A97FE0" stopOpacity="0" />
                          </linearGradient>
                        </defs>
                        <path d="M22 0 L40 128 L4 128 Z" fill="url(#beamA)" />
                        <path d="M78 0 L96 128 L60 128 Z" fill="url(#beamA)" />
                        <path d="M50 0 L64 128 L36 128 Z" fill="url(#beamA)" opacity="0.7" />
                        <g fill="#0B0714">
                          <circle cx="26" cy="86" r="7" />
                          <path d="M15 128 C15 106 19 96 26 96 C33 96 37 106 37 128 Z" />
                          <path d="M20 112 L40 104" stroke="#0B0714" strokeWidth="4" strokeLinecap="round" />
                          <circle cx="50" cy="92" r="6.5" />
                          <path d="M40 128 C40 110 44 101 50 101 C56 101 60 110 60 128 Z" />
                          <rect x="42" y="116" width="16" height="12" rx="2" />
                          <circle cx="74" cy="86" r="7" />
                          <path d="M63 128 C63 106 67 96 74 96 C81 96 85 106 85 128 Z" />
                          <path d="M68 110 L88 118" stroke="#0B0714" strokeWidth="4" strokeLinecap="round" />
                          <rect x="0" y="128" width="100" height="32" />
                        </g>
                      </svg>
                      <span className="vb-slide-cap" style={{ color: '#C4AEEA' }}>{t('ill2_s_article')}</span>
                    </div>
                  </>) : (<>
                    <div className="vb-slide" style={{ background: 'linear-gradient(165deg, #DFE3F7, #D7D5F0)' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 46, height: 46, borderRadius: 999, background: 'color-mix(in srgb, var(--paper-raised) 90%, transparent)', color: 'var(--ink)', fontSize: 15 }}>▶</span>
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
                  </>)}
                  </div>
                  <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <span style={{ fontFamily: MONO, fontSize: 11, letterSpacing: '0.14em', color: '#8A8478' }}>{t('ill2_vo')}</span>
                    <div style={{ border: '1px solid #E8E0CE', borderRadius: 16, padding: '16px 18px', fontFamily: HANKEN, fontSize: 17, lineHeight: 1.45, color: 'var(--ink)' }}>
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
                  <span style={{ padding: '9px 16px', borderRadius: 999, border: '1px solid #C9D9F4', background: '#E7EEFB', fontFamily: HANKEN, fontSize: 15, color: 'var(--ink)' }}>{t('ill2_talk')} <span style={{ color: '#3B5FA8', fontWeight: 600 }}>{t('ill2_talk_price')}</span></span>
                </div>

                <div className="vb-strip" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px', borderRadius: 14, background: '#14110F' }}>
                  <span aria-hidden="true" style={{ color: '#7FE0A8', fontSize: 13 }}>✓</span>
                  <span style={{ fontFamily: HANKEN, fontSize: 13.5, color: '#F6F1E7', whiteSpace: 'nowrap' }}>{t('ill2_approve')}</span>
                </div>

              </div>

              {/* Taxameter-lappen — utenfor nedre høyre hjørne */}
              <div className="vb-taxi" style={{ background: 'var(--paper-raised)', border: '1px solid #EDE5D6', borderRadius: 20, padding: '18px 22px', boxShadow: '0 24px 60px -30px rgba(20,17,15,0.35)' }}>
                <div style={{ fontFamily: MONO, fontSize: 11, letterSpacing: '0.14em', color: '#8A8478', marginBottom: 10 }}>{t('ill2_taxi')}</div>
                {[
                  { l: t('ill2_paalopt'), v: t('ill2_paalopt_v') },
                  { l: t('ill2_snakk'), v: t('ill2_snakk_v') },
                  { l: t('ill2_bev'), v: t('ill2_bev_v') },
                ].map((r) => (
                  <div key={r.l} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '5px 0', fontFamily: HANKEN, fontSize: 15.5, color: 'var(--ink-soft)' }}>
                    <span>{r.l}</span>
                    <span style={{ fontVariantNumeric: 'tabular-nums' }}>{r.v}</span>
                  </div>
                ))}
                <div style={{ height: 1, background: '#E8E0CE', margin: '10px 0' }} />
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <span style={{ fontFamily: HANKEN, fontSize: 16, color: 'var(--ink)' }}>{t('ill2_next')}</span>
                  <span style={{ fontFamily: SERIF, fontSize: 26, color: 'var(--ink)', fontVariantNumeric: 'tabular-nums' }}>{t('ill2_next_v')}</span>
                </div>
              </div>
            </div>

          </div>

          {isDirect && (<>
          {/* Trust strip */}
          <div style={{ marginTop: 'clamp(54px,7vw,84px)', textAlign: 'center' }}>
            <div style={{ fontFamily: MONO, fontSize: 11, fontWeight: 500, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--text-faint)', marginBottom: 16 }}>{t('trust')}</div>
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
              <div key={f.t} className="cf-card" style={{ position: 'relative', background: 'var(--paper-raised)', border: '1px solid var(--ds-border)', borderRadius: 18, padding: 30, overflow: 'hidden', boxShadow: '0 1px 2px rgba(70,45,20,0.04)' }}>
                <div aria-hidden="true" style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: 'linear-gradient(90deg,transparent,rgba(var(--glow,217,82,28),0.5),transparent)' }} />
                <div style={{ width: 48, height: 48, borderRadius: 13, background: 'var(--ember-tint-bg)', border: '1px solid var(--ember-tint-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 22 }}>{f.icon}</div>
                <h3 style={{ fontFamily: HANKEN, fontWeight: 700, fontSize: 21, letterSpacing: '-0.01em', color: 'var(--ink)', margin: '0 0 11px' }}>{f.t}</h3>
                <p style={{ fontFamily: HANKEN, fontSize: 15.5, lineHeight: 1.6, color: 'var(--text-muted)', margin: 0 }}>{f.d}</p>
              </div>
            ))}
          </div>
          {/* Ekte produksjon som bevis (Lars 3/8). En mock-up viser hva vi
              lover; denne viser hva som faktisk kom ut. Plakatbilde saa den
              ikke staar som en sort boks, og preload=none saa 11 MB ikke
              lastes for noen som bare skroller forbi. */}
          {erArtist && (
            <div style={{ marginTop: 'clamp(40px,5vw,56px)', textAlign: 'center' }}>
              <h3 style={{ fontFamily: SERIF, fontWeight: 400, fontSize: 'clamp(24px,3vw,34px)', lineHeight: 1.1, color: 'var(--ink)', margin: '0 0 10px' }}>{t('demo_t')}</h3>
              <p style={{ fontFamily: HANKEN, fontSize: 16, lineHeight: 1.6, color: 'var(--text-muted)', margin: '0 auto 22px', maxWidth: 560 }}>{t('demo_d')}</p>
              <video
                src="https://pub-5dcdfe9305a740febc87568c9ccb40a6.r2.dev/assets/demo-artist-promo.mp4"
                poster="https://pub-5dcdfe9305a740febc87568c9ccb40a6.r2.dev/assets/demo-artist-promo.jpg"
                controls
                playsInline
                preload="none"
                style={{ width: 'min(300px, 78vw)', aspectRatio: '9 / 16', borderRadius: 18, background: '#000', border: '1px solid var(--ds-border)', display: 'block', margin: '0 auto' }}
              />
            </div>
          )}

          <div style={{ textAlign: 'center', marginTop: 'clamp(40px,5vw,52px)' }}>
            <Link href="/register" className="cf-btn-ink" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontFamily: HANKEN, fontWeight: 700, fontSize: 16, color: 'var(--paper)', background: 'var(--ink)', borderRadius: 999, padding: '15px 30px', textDecoration: 'none', boxShadow: '0 12px 30px -12px color-mix(in srgb, var(--ink) 50%, transparent)' }}>
              {t('mid_cta')} →
            </Link>
          </div>
        </section>

        {/* Stemmebanken — skuespiller-royalty er ikke tema for artist-tenanter
            (Lars 1/8 skjulte den i menyen; 3/8 stod den fortsatt paa forsiden
            til Isabel og solgte noe hun ikke tilbyr). Rammefargene var
            dessuten hardkodet beige og lyste opp paa moerk drakt. */}
        {!erArtist && (
        <section id="stemmebank" style={{ position: 'relative', background: 'var(--band)', borderTop: '1px solid var(--ds-border)', borderBottom: '1px solid var(--ds-border)' }}>
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
                <div key={f.t} style={{ background: 'var(--paper-raised)', border: '1px solid var(--ds-border)', borderRadius: 18, padding: '26px 26px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--ember)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ flex: 'none' }}><path d="M5 12.5 L10 17 L19 6.5" /></svg>
                    <h3 style={{ fontFamily: HANKEN, fontWeight: 700, fontSize: 18, letterSpacing: '-0.01em', color: 'var(--ink)', margin: 0 }}>{f.t}</h3>
                  </div>
                  <p style={{ fontFamily: HANKEN, fontSize: 15, lineHeight: 1.6, color: 'var(--text-muted)', margin: 0 }}>{f.d}</p>
                </div>
              ))}
            </div>
            <p style={{ textAlign: 'center', fontFamily: HANKEN, fontSize: 15, color: 'var(--ember-deep)', margin: '30px auto 0', maxWidth: 620 }}>{t('vb_note')}</p>
          </div>
        </section>
        )}

        {/* Plattformen: white-label + API — «bruk stemmene og ansiktene fra
            dine egne systemer», partnerskap og API-noekler. Ikke noe en artist
            skal selges (Lars 3/8: «fjern hele avsnittet med voices and faces»). */}
        {!erArtist && (
        <section id="plattform" style={{ position: 'relative', maxWidth: 1180, margin: '0 auto', padding: 'clamp(56px,8vw,104px) 28px' }}>
          <div style={{ maxWidth: 680, margin: '0 auto clamp(40px,5vw,56px)', textAlign: 'center' }}>
            <h2 style={{ fontFamily: SERIF, fontWeight: 400, fontSize: 'clamp(32px,4.3vw,50px)', lineHeight: 1.06, letterSpacing: '-0.01em', color: 'var(--ink)', margin: '0 0 14px' }}>{t('pf_title')}</h2>
            <p style={{ fontFamily: HANKEN, fontSize: 18, lineHeight: 1.6, color: 'var(--text-muted)', margin: 0 }}>{t('pf_sub', { name: tenant.app_name })}</p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(300px,1fr))', gap: 18, maxWidth: 1000, margin: '0 auto' }}>
            <div className="cf-card" style={{ position: 'relative', background: 'var(--paper-raised)', border: '1px solid var(--ds-border)', borderRadius: 18, padding: 32, overflow: 'hidden' }}>
              <div aria-hidden="true" style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: 'linear-gradient(90deg,transparent,rgba(var(--glow,217,82,28),0.5),transparent)' }} />
              <h3 style={{ fontFamily: HANKEN, fontWeight: 700, fontSize: 21, letterSpacing: '-0.01em', color: 'var(--ink)', margin: '0 0 11px' }}>{t('pf1_t')}</h3>
              <p style={{ fontFamily: HANKEN, fontSize: 15.5, lineHeight: 1.6, color: 'var(--text-muted)', margin: '0 0 22px' }}>{isDirect ? t('pf1_d') : t('pf1_d_partner')}</p>
              <Link href="/white-label" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontFamily: HANKEN, fontWeight: 700, fontSize: 15.5, color: 'var(--ember-deep)', border: '1px solid var(--ember-tint-border)', background: 'var(--ember-tint-bg)', borderRadius: 999, padding: '12px 22px', textDecoration: 'none' }}>{t('pf1_cta')} →</Link>
            </div>
            <div className="cf-card" style={{ position: 'relative', background: 'var(--paper-raised)', border: '1px solid var(--ds-border)', borderRadius: 18, padding: 32, overflow: 'hidden' }}>
              <div aria-hidden="true" style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: 'linear-gradient(90deg,transparent,rgba(var(--glow,217,82,28),0.5),transparent)' }} />
              <h3 style={{ fontFamily: HANKEN, fontWeight: 700, fontSize: 21, letterSpacing: '-0.01em', color: 'var(--ink)', margin: '0 0 11px' }}>{t('pf2_t')}</h3>
              <p style={{ fontFamily: HANKEN, fontSize: 15.5, lineHeight: 1.6, color: 'var(--text-muted)', margin: '0 0 18px' }}>{t('pf2_d')}</p>
              <code style={{ display: 'block', fontFamily: MONO, fontSize: 12.5, lineHeight: 1.7, color: '#4A4438', background: 'var(--paper-sunken)', border: '1px solid var(--ds-border)', borderRadius: 10, padding: '12px 14px', overflowX: 'auto', whiteSpace: 'pre' }}>{'POST /gateway/v1/speech\n{ "assetId": "ast_kari", "text": "…" }'}</code>
            </div>
          </div>
        </section>
        )}

        {/* Footer */}
        <footer style={{ position: 'relative', zIndex: 2, maxWidth: 1180, margin: '0 auto', padding: 'clamp(48px,6vw,72px) 28px 48px' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 24 }}>
            <div style={{ maxWidth: 340 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 11, marginBottom: 12 }}>
                <CenterForgeLogo size={22} wordmarkSize={17} />
              </div>
              <p style={{ fontFamily: HANKEN, fontSize: 14, lineHeight: 1.5, color: 'var(--text-faint)', margin: 0 }}>{t('foot_tag')}</p>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {/* «Bli white-label-partner» selger plattformen fra artistens egen
                  fot (Lars 3/8). Hoerer hjemme paa CenterForge, ikke hos Isabel. */}
              {!erArtist && (
                <Link href="/white-label" className="cf-nav-link" style={{ fontFamily: HANKEN, fontSize: 14, color: 'var(--text-muted)', textDecoration: 'none' }}>{t('foot_whitelabel')}</Link>
              )}
              <Link href="/privacy" className="cf-nav-link" style={{ fontFamily: HANKEN, fontSize: 14, color: 'var(--text-muted)', textDecoration: 'none' }}>{t('foot_privacy')}</Link>
              <Link href="/terms" className="cf-nav-link" style={{ fontFamily: HANKEN, fontSize: 14, color: 'var(--text-muted)', textDecoration: 'none' }}>{t('foot_terms')}</Link>
            </div>
          </div>
          <div style={{ height: 1, background: '#E0D7C6', margin: '28px 0 18px' }} />
          <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: 8, fontFamily: MONO, fontSize: 11.5, letterSpacing: '0.04em', color: 'var(--text-faint)' }}>
            <span>{t('footer', { year: new Date().getFullYear(), name: tenant.app_name })}</span>
            {tenant.billing_mode === 'invoice' && <span>Powered by Norditech</span>}
          </div>
        </footer>

      </main>
    </div>
  )
}
