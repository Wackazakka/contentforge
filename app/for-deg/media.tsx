'use client'

import { useEffect, useRef, useState } from 'react'
import { HERO, GALLERY, AUDIO_TILE } from './examples'

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    setReduced(mq.matches)
    const onChange = () => setReduced(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  return reduced
}

// Telefonen i heroen. Tekstplata i HTML rendres KUN så lenge det ikke ligger en
// ekte video der (i virkeligheten er teksten brent inn i videoen).
// NB: sitatet i notatkortet er inputen som «ga» videoen — byttes videoen,
// byttes sitatet i samme commit.
export function HeroPhone() {
  const reduced = useReducedMotion()
  const [playing, setPlaying] = useState(false)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const showTextPlate = !HERO.videoUrl

  return (
    <div className="fd-hero-right">
      <div className="fd-phone-wrap">
        <div className="fd-phone">
          <div className="fd-screen">
            {HERO.videoUrl && (
              <video
                ref={videoRef}
                src={HERO.videoUrl}
                poster={HERO.posterUrl ?? undefined}
                autoPlay={!reduced}
                loop
                muted
                playsInline
                preload="metadata"
              />
            )}
            {HERO.videoUrl && reduced && !playing && (
              <button
                type="button"
                className="fd-play-btn"
                aria-label="Spill av eksempelvideo"
                onClick={() => {
                  videoRef.current?.play()
                  setPlaying(true)
                }}
              >
                ▶
              </button>
            )}
            {showTextPlate && (
              <div className="fd-screen-plate">
                <span className="fd-screen-pill">50-ÅRSLAG</span>
                <p className="fd-screen-title">Invitasjon til{'\n'}50-års lag</p>
                <p className="fd-screen-detail">23. oktober kl. 18.00{'\n'}Barveien 17</p>
              </div>
            )}
          </div>
        </div>
        <div className="fd-note-card">
          <p className="fd-note-label">DU SKREV BARE</p>
          <p className="fd-note-quote">
            «Pappa fyller 50! Feiring 23. oktober kl 18 i Barveien 17. Bare møt opp, ingen gaver.»
          </p>
        </div>
        <div className="fd-badge">
          <span className="fd-badge-check" aria-hidden="true">✓</span>
          <span>
            <p className="fd-badge-title">Ferdig etter 4 min</p>
            <p className="fd-badge-sub">Klar for Facebook</p>
          </span>
        </div>
      </div>
    </div>
  )
}

// Galleriet: fire videotiles + lydtilen. Én avspilling med lyd av gangen.
export function Gallery() {
  const reduced = useReducedMotion()
  const [audioPlaying, setAudioPlaying] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  const toggleAudio = () => {
    if (!AUDIO_TILE.audioUrl) return
    if (!audioRef.current) {
      audioRef.current = new Audio(AUDIO_TILE.audioUrl)
      audioRef.current.onended = () => setAudioPlaying(false)
    }
    if (audioPlaying) {
      audioRef.current.pause()
      audioRef.current.currentTime = 0
      setAudioPlaying(false)
    } else {
      audioRef.current.play().then(() => setAudioPlaying(true)).catch(() => {})
    }
  }

  return (
    <div className="fd-gallery">
      {GALLERY.map((ex) => (
        <div key={ex.id} className="fd-tile">
          <div className="fd-tile-media" style={{ background: ex.tint }}>
            {ex.videoUrl ? (
              <video
                src={ex.videoUrl}
                poster={ex.posterUrl ?? undefined}
                autoPlay={!reduced}
                loop
                muted
                playsInline
                preload="metadata"
              />
            ) : (
              <span className="fd-tile-caption">Eksempelvideo kommer</span>
            )}
          </div>
          <span className="fd-tile-title">{ex.title}</span>
          <span className="fd-tile-meta">{ex.meta}</span>
        </div>
      ))}

      <div className="fd-tile">
        <button
          type="button"
          className={`fd-tile-media fd-audio-tile${audioPlaying ? ' fd-playing' : ''}`}
          onClick={toggleAudio}
          aria-label={audioPlaying ? 'Stopp lydhilsenen' : 'Spill av lydhilsenen'}
        >
          <span className="fd-wave" aria-hidden="true">
            {[40, 72, 100, 58, 84, 36, 66].map((h, i) => (
              <span key={i} style={{ height: `${h}%`, animationDelay: `${i * 0.13}s` }} />
            ))}
          </span>
          <span className="fd-audio-title">{AUDIO_TILE.title}</span>
        </button>
        <span className="fd-tile-title">Lydhilsen</span>
        <span className="fd-tile-meta">{AUDIO_TILE.meta}</span>
      </div>
    </div>
  )
}
