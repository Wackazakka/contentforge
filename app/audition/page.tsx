'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { useAuth } from '@/lib/authContext'
import { TwinLedgerLogo } from '@/components/TwinLedgerLogo'
import { LangToggle } from '@/components/LangToggle'
import Plukker from './Plukker'
import type { Kandidat } from '@/lib/castingAttributes'

// Audition: samme scene, samme replikk, ulike skuespillere.
//
// 🔑 DESIGNREGELEN SOM GJØR DETTE TIL ET CASTINGVERKTØY OG IKKE EN
// SHOWREEL-MASKIN: alt unntatt skuespilleren er identisk. Derfor står replikk,
// regi og scene ÉN gang, over hele utvalget — ikke per skuespiller.
//
// ═══ REDESIGN 21.09.2026 (Claude Design 6A–6C) ═══
//
// Den forrige runden brøt med sin egen regel: takene lå i
// `repeat(auto-fill, minmax(280px, 1fr))` med kort av ULIK HØYDE, så øyet
// sammenliknet kortstørrelser før stemmer. Nå er runden et FAST RUTENETT —
// `120px repeat(n, 1fr)`, radetikett til venstre, én kolonne per skuespiller,
// like rader på tvers. Take 1 ligger ved siden av take 1.
//
// Replikken står i en mørk stripe over rutenettet, ÉN gang. Den er rundens
// eneste konstant, og skal ikke gjentas per kolonne.
//
// Flaten poller selv. Ingen forespørsel venter på en render: hver poll skyver
// hvert take ett steg videre (se lib/auditions.ts).

interface Read { id: string; take_id: string; audio_url: string | null; direction: string | null; is_chosen: boolean; model: string | null; tag: string | null }
interface Take { id: string; actor_id: string; stage: string; still_url: string | null; video_url: string | null; feil: string | null; cost_nok: number | null; reads: Read[] }

// Bare verdiene ligger i koden; etikettene hentes per språk. Verdiene er
// API-kontrakt (de går til ElevenLabs-presetene og til basen).
const REGI = ['noytral', 'varm', 'entusiastisk', 'rolig', 'trist', 'dramatisk'] as const
const STEG = ['queued', 'reading', 'ready', 'still', 'video', 'done', 'failed'] as const

const MONO = 'var(--font-cfmono), ui-monospace, monospace'
const DISPLAY = 'var(--font-archivo), system-ui, sans-serif'
const SANS = 'var(--font-hanken), system-ui, sans-serif'
const GUTTER = 'clamp(20px, 4vw, 56px)'
const MAKS = 8

const felt: React.CSSProperties = {
  width: '100%', padding: '12px 14px', fontSize: 15, fontFamily: 'inherit',
  border: '1px solid var(--ds-border-strong)', background: 'var(--paper-raised)', color: 'var(--ink)',
}

function Etikett({ children }: { children: React.ReactNode }) {
  return (
    <span style={{ display: 'block', fontFamily: MONO, fontSize: 10.5, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--text-faint)', marginBottom: 7 }}>
      {children}
    </span>
  )
}

export default function AuditionPage() {
  const t = useTranslations('audition')
  const tc = useTranslations('casting')
  // Auth-konteksten, ikke getSession() direkte: ved første rendring er
  // sesjonen ikke hydrert ennå, og et kall da ser ut som «ikke innlogget».
  const { session, loading: authLoading } = useAuth()
  const [kandidater, setKandidater] = useState<Kandidat[]>([])
  const [prisFilm, setPrisFilm] = useState(0)
  const [prisLesning, setPrisLesning] = useState(0)
  const [jobber, setJobber] = useState<string | null>(null)
  const [valgte, setValgte] = useState<string[]>([])
  const [line, setLine] = useState('')
  const [direction, setDirection] = useState<string>('noytral')
  const [scene, setScene] = useState('a quiet room with soft daylight, plain background, facing the camera')
  const [tittel, setTittel] = useState('')
  const [auditionId, setAuditionId] = useState<string | null>(null)
  const [takes, setTakes] = useState<Take[]>([])
  const [ferdig, setFerdig] = useState(false)
  // Runden sin EGEN replikk. Åpnes en delt lenke, er skjemaet tomt — da må
  // overskriften komme fra auditionen og ikke fra det man selv har skrevet.
  const [rundeLine, setRundeLine] = useState('')
  const [rundeTittel, setRundeTittel] = useState('')
  const [rundeRegi, setRundeRegi] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const token = async () => {
    const tok = session?.access_token
    if (!tok) throw new Error(t('err_not_logged_in'))
    return tok
  }

  // En audition skal kunne DELES. En casting-ansvarlig sender runden til
  // produsenten, og da må lenken åpne den samme runden — ikke et tomt skjema.
  useEffect(() => {
    const fra = new URLSearchParams(window.location.search).get('id')
    if (fra) setAuditionId(fra)
  }, [])

  useEffect(() => {
    if (authLoading || !session) return
    ;(async () => {
      try {
        const res = await fetch('/api/auditions', { headers: { Authorization: `Bearer ${await token()}` } })
        const d = await res.json()
        if (!res.ok) { setError(d.error || t('err_actors')); return }
        setKandidater(d.actors || [])
        setPrisFilm(Number(d.prisPerFilm) || 0)
        setPrisLesning(Number(d.prisPerLesning) || 0)
      } catch (e) {
        setError(e instanceof Error ? e.message : t('err_unknown'))
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, session])

  const poll = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/auditions?id=${id}`, { headers: { Authorization: `Bearer ${await token()}` } })
      const d = await res.json()
      if (!res.ok) {
        setError(d.error || t('err_round_status', { status: res.status }))
        if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
        return
      }
      setError(null)
      setTakes(d.takes || [])
      if (d.audition?.line) setRundeLine(d.audition.line)
      if (d.audition?.title) setRundeTittel(d.audition.title)
      if (d.audition?.direction) setRundeRegi(d.audition.direction)
      if (d.ferdig) {
        setFerdig(true)
        if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : t('err_round'))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session])

  useEffect(() => {
    if (!auditionId || ferdig || authLoading || !session) return
    poll(auditionId)
    pollRef.current = setInterval(() => poll(auditionId), 5000)
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [auditionId, ferdig, poll, authLoading, session])

  const kjor = async () => {
    setBusy(true); setError(null)
    try {
      const res = await fetch('/api/auditions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${await token()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ line, direction, scenePrompt: scene, actorIds: valgte, title: tittel || null }),
      })
      const d = await res.json()
      if (!res.ok) { setError(d.error || t('err_start')); return }
      setAuditionId(d.id); setTakes([]); setFerdig(false)
      // Fase 1 starter av seg selv: én lesning per plass, slik at regissøren
      // har noe å høre på med én gang. Videre takes er hens valg.
      const r = await fetch(`/api/auditions?id=${d.id}`, { headers: { Authorization: `Bearer ${await token()}` } })
      const st = await r.json()
      for (const take of (st.takes || [])) {
        await fetch('/api/auditions', {
          method: 'PUT',
          headers: { Authorization: `Bearer ${await token()}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'read', takeId: take.id }),
        })
      }
      await poll(d.id)
    } finally { setBusy(false) }
  }

  const handling = async (body: Record<string, unknown>, merke: string) => {
    setJobber(merke); setError(null)
    try {
      const res = await fetch('/api/auditions', {
        method: 'PUT',
        headers: { Authorization: `Bearer ${await token()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const d = await res.json()
      if (!res.ok) { setError(d.error || t('err_generic')); return }
      if (auditionId) await poll(auditionId)
    } catch (e) {
      setError(e instanceof Error ? e.message : t('err_generic'))
    } finally { setJobber(null) }
  }

  const navn = (id: string) => kandidater.find((k) => k.id === id)?.name || t('unknown_actor')
  const kandidat = (id: string) => kandidater.find((k) => k.id === id)
  const fornavn = (id: string) => navn(id).split(' ')[0]
  const pris = valgte.length * prisLesning
  const tilRettighetshavere = Math.round(pris * 0.3)

  // Hvor mange take-rader rutenettet trenger. Regissøren kan be om flere
  // lesninger per skuespiller, og rutenettet skal vokse med den som har flest.
  const radAntall = useMemo(
    () => Math.max(1, ...takes.map((x) => (x.reads || []).length)),
    [takes])
  const harFilm = takes.some((x) => x.video_url)

  const ramme = (
    <>
      <style>{`
        .au-grid { display: grid; border-left: 1px solid var(--ds-border-strong); overflow-x: auto; }
        .au-cell { border-right: 1px solid var(--ds-border-strong); border-bottom: 1px solid var(--ds-border); padding: 12px 14px; min-height: 64px; display: flex; flex-direction: column; justify-content: center; gap: 6px; }
        .au-rowlabel { border-right: 1px solid var(--ds-border-strong); border-bottom: 1px solid var(--ds-border); padding: 12px 14px; display: flex; align-items: center; font-family: ${MONO}; font-size: 10.5px; font-weight: 600; letter-spacing: 0.14em; text-transform: uppercase; color: var(--text-faint); background: var(--paper-sunken); }
        .au-films { display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); border-left: 1px solid var(--ds-border-strong); }
        .au-films > div { border-right: 1px solid var(--ds-border-strong); border-bottom: 1px solid var(--ds-border-strong); border-top: 1px solid var(--ds-border-strong); background: var(--paper-raised); }
        .au-play { width: 26px; height: 26px; border-radius: 50%; background: var(--ember-deep); color: var(--on-ember); border: 0; cursor: pointer; font-size: 10px; flex: none; display: flex; align-items: center; justify-content: center; }
      `}</style>

      <header style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', padding: `18px ${GUTTER}`, background: 'var(--paper-raised)', borderBottom: '1px solid var(--ds-border)' }}>
        <Link href="/" style={{ textDecoration: 'none' }}><TwinLedgerLogo size={22} /></Link>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '10px 18px', flexWrap: 'wrap', fontSize: 15 }}>
          <Link href="/stemmer" style={{ color: 'var(--ink-soft)', textDecoration: 'none' }}>{t('back')}</Link>
          <LangToggle />
        </div>
      </header>
    </>
  )

  // Utlogget er en TILSTAND, ikke en feil. En rød boks som sier «Ikke
  // innlogget» ser ut som noe er i stuss; en lenke sier hva man gjør.
  if (!authLoading && !session) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--paper)', color: 'var(--ink)', fontFamily: SANS }}>
        {ramme}
        <div style={{ padding: `clamp(40px, 6vw, 72px) ${GUTTER}`, maxWidth: 520 }}>
          <h1 style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 26, letterSpacing: '-0.03em', margin: '0 0 10px' }}>{t('login_title')}</h1>
          <p style={{ fontSize: 15, lineHeight: 1.55, color: 'var(--ink-soft)', margin: '0 0 22px' }}>{t('login_body')}</p>
          <Link href="/login" style={{ display: 'inline-block', padding: '13px 24px', fontFamily: DISPLAY, fontWeight: 700, fontSize: 15, background: 'var(--ember-deep)', color: 'var(--on-ember)', textDecoration: 'none' }}>{t('login_cta')}</Link>
        </div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--paper)', color: 'var(--ink)', fontFamily: SANS }}>
      {ramme}

      <div style={{ padding: `clamp(28px, 4vw, 48px) ${GUTTER} 64px` }}>
        {error && (
          <div style={{ border: '1px solid var(--ember-tint-border)', background: 'var(--ember-tint-bg)', color: 'var(--ember-deep)', padding: '12px 14px', fontSize: 14, marginBottom: 20 }}>{error}</div>
        )}
        {authLoading && <p style={{ color: 'var(--text-muted)' }}>{t('loading')}</p>}

        {/* ══ 6A: OPPSETT ══ */}
        {!authLoading && session && !auditionId && (
          <>
            <p style={{ fontFamily: MONO, fontSize: 11.5, fontWeight: 600, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--text-faint)', margin: '0 0 12px' }}>{t('title')}</p>
            <h1 style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 'clamp(28px, 3.4vw, 40px)', letterSpacing: '-0.035em', lineHeight: 1.08, margin: '0 0 12px', maxWidth: '18em' }}>{t('h2')}</h1>
            <p style={{ fontSize: 16.5, lineHeight: 1.55, color: 'var(--ink-soft)', margin: '0 0 32px', maxWidth: '38em' }}>{t('intro')}</p>

            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 360px', gap: 28, alignItems: 'start' }} className="au-setup">
              <div>
                {/* Replikken er rundens viktigste innhold, og ser ut som det. */}
                <div style={{ marginBottom: 22 }}>
                  <Etikett>{t('field_line')}</Etikett>
                  <textarea value={line} onChange={(e) => setLine(e.target.value)} rows={2} placeholder={t('line_ph')}
                    style={{ ...felt, fontFamily: DISPLAY, fontWeight: 700, fontSize: 24, lineHeight: 1.25, letterSpacing: '-0.02em', border: '1px solid var(--ink)', resize: 'vertical' }} />
                  <p style={{ fontSize: 12.5, color: 'var(--text-faint)', margin: '7px 0 0' }}>{t('line_hint')}</p>
                </div>

                <div style={{ marginBottom: 22 }}>
                  <Etikett>{t('field_direction')}</Etikett>
                  <div style={{ display: 'flex', flexWrap: 'wrap', border: '1px solid var(--ds-border-strong)' }}>
                    {REGI.map((v, i) => {
                      const paa = direction === v
                      return (
                        <button key={v} type="button" onClick={() => setDirection(v)} aria-pressed={paa}
                          style={{
                            flex: '1 1 90px', padding: '11px 8px', fontSize: 14, cursor: 'pointer',
                            fontFamily: DISPLAY, fontWeight: paa ? 700 : 500, border: 'none',
                            borderLeft: i === 0 ? 'none' : '1px solid var(--ds-border-strong)',
                            background: paa ? 'var(--ink)' : 'var(--paper-raised)',
                            color: paa ? 'var(--paper)' : 'var(--ink-soft)',
                          }}>{t(`dir_${v}`)}</button>
                      )
                    })}
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 18, marginBottom: 28 }}>
                  <label>
                    <Etikett>{t('field_title')}</Etikett>
                    <input value={tittel} onChange={(e) => setTittel(e.target.value)} placeholder={t('title_placeholder')} style={felt} />
                  </label>
                  <label>
                    <Etikett>{t('field_scene')}</Etikett>
                    <input value={scene} onChange={(e) => setScene(e.target.value)} style={felt} />
                  </label>
                </div>
                <p style={{ fontSize: 12.5, lineHeight: 1.5, color: 'var(--text-faint)', margin: '-18px 0 28px' }}>{t('scene_hint_short')}</p>

                {kandidater.length === 0 ? (
                  <p style={{ fontSize: 14.5, color: 'var(--text-muted)' }}>{t('none_ready')}</p>
                ) : (
                  <Plukker kandidater={kandidater} valgte={valgte} setValgte={setValgte} maks={MAKS} />
                )}
              </div>

              {/* Prissammendraget med DOBBELTSTREK på summen — samme tegn som i
                  logoen, og av samme grunn: en sum som er gjort opp. */}
              <aside style={{ border: '1px solid var(--ds-border-strong)', background: 'var(--paper-raised)', padding: 22, position: 'sticky', top: 20 }}>
                <p style={{ fontFamily: MONO, fontSize: 10.5, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--text-faint)', margin: '0 0 16px' }}>{t('summary_h')}</p>
                <Rad k={t('sum_reads')} v={`${valgte.length} × ${prisLesning}`} />
                <Rad k={t('sum_film_each')} v={String(prisFilm)} />
                <Rad k={t('sum_to_holders')} v={String(tilRettighetshavere)} dempet />
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '12px 0 10px', marginTop: 6, borderTop: '1.5px solid var(--ink)', borderBottom: '3px double var(--ember-deep)' }}>
                  <span style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 15 }}>{t('sum_now')}</span>
                  <span style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 15, fontVariantNumeric: 'tabular-nums' }}>{pris}</span>
                </div>
                <button onClick={kjor} disabled={busy || !line.trim() || valgte.length === 0}
                  style={{
                    width: '100%', marginTop: 18, padding: '14px 20px', fontFamily: DISPLAY, fontWeight: 700, fontSize: 15.5,
                    background: 'var(--ember-deep)', color: 'var(--on-ember)', border: 'none',
                    cursor: busy || !line.trim() || valgte.length === 0 ? 'default' : 'pointer',
                    opacity: busy || !line.trim() || valgte.length === 0 ? 0.45 : 1,
                  }}>
                  {busy ? t('starting') : t('hear_them')}
                </button>
                <p style={{ fontSize: 12.5, lineHeight: 1.5, color: 'var(--text-faint)', margin: '12px 0 0' }}>{t('pay_note')}</p>
              </aside>
            </div>
            <style>{`@media (max-width: 899px) { .au-setup { grid-template-columns: 1fr !important; } .au-setup aside { position: static !important; } }`}</style>
          </>
        )}

        {/* ══ 6B/6C: RUNDEN ══ */}
        {!authLoading && session && auditionId && (
          <>
            {/* Replikken i en mørk stripe, ÉN gang. Den er rundens eneste
                konstant og skal ikke gjentas per kolonne. */}
            <div style={{ background: 'var(--ink)', color: 'var(--paper)', padding: '20px 24px', display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'baseline' }}>
              <div style={{ flex: '1 1 340px' }}>
                {(rundeTittel || rundeRegi) && (
                  <p style={{ fontFamily: MONO, fontSize: 10.5, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#90909A', margin: '0 0 8px' }}>
                    {t('round_meta', { title: rundeTittel || t('title'), direction: rundeRegi ? t(`dir_${rundeRegi}`) : '—' })}
                  </p>
                )}
                <p style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 'clamp(19px, 2.2vw, 26px)', letterSpacing: '-0.02em', margin: 0 }}>
                  {rundeLine ? `«${rundeLine}»` : t('fetching_round')}
                </p>
              </div>
              <span style={{ fontFamily: MONO, fontSize: 11.5, color: '#C9C9CE' }}>
                {ferdig ? t('stage_done') : t('progress', { done: takes.filter((x) => x.stage === 'done').length, total: takes.length })}
              </span>
            </div>

            {/* 6C: filmene, alle i samme utsnitt. Under hver står hva den kostet
                og hva som gikk til rettighetshaveren — valget tas med tallet
                synlig. */}
            {harFilm && (
              <div className="au-films" style={{ marginBottom: 28 }}>
                {takes.filter((x) => x.video_url || x.stage === 'still' || x.stage === 'video').map((x) => (
                  <div key={x.id}>
                    {x.video_url ? (
                      <video controls preload="metadata" playsInline src={x.video_url}
                        style={{ width: '100%', aspectRatio: '4/5', objectFit: 'cover', background: 'var(--ink)', display: 'block' }} />
                    ) : (
                      <div style={{ aspectRatio: '4/5', background: '#E4E4E0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <span style={{ fontFamily: MONO, fontSize: 10.5, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-faint)' }}>{t('making_film')}</span>
                      </div>
                    )}
                    <div style={{ padding: '12px 14px 14px' }}>
                      <p style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 15, margin: '0 0 8px', letterSpacing: '-0.01em' }}>{navn(x.actor_id)}</p>
                      <Rad k={t('cost')} v={String(x.cost_nok ?? prisFilm)} liten />
                      <Rad k={t('to_holder_short', { name: fornavn(x.actor_id) })} v={String(Math.round((x.cost_nok ?? prisFilm) * 0.3))} liten dempet />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* 6B: det faste rutenettet. Take 1 ligger ved siden av take 1. */}
            {takes.length > 0 && (
              <div className="au-grid" style={{ gridTemplateColumns: `120px repeat(${takes.length}, minmax(180px, 1fr))` }}>
                <div className="au-rowlabel" style={{ background: 'var(--paper-raised)' }} />
                {takes.map((x) => {
                  const k = kandidat(x.actor_id)
                  return (
                    <div key={`h-${x.id}`} className="au-cell" style={{ background: 'var(--paper-raised)', borderBottomColor: 'var(--ds-border-strong)' }}>
                      <span style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 14.5, letterSpacing: '-0.01em' }}>{navn(x.actor_id)}</span>
                      {k && (
                        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                          {[k.playingAgeFrom != null && k.playingAgeTo != null ? `${k.playingAgeFrom}–${k.playingAgeTo}` : null,
                            (k.attributes.dialects ?? []).map((d) => tc(`dialects_${d}`))[0]].filter(Boolean).join(' · ')}
                        </span>
                      )}
                    </div>
                  )
                })}

                {Array.from({ length: radAntall }).map((_, rad) => (
                  <RadIRutenett key={`r-${rad}`} label={t('take_n', { n: rad + 1 })}>
                    {takes.map((x) => {
                      const r = (x.reads || [])[rad]
                      const iFase2 = ['still', 'video', 'done'].includes(x.stage)
                      if (!r) {
                        // Tom celle: tilby «én take til» bare der det gir mening.
                        const kanBestille = !iFase2 && rad === (x.reads || []).length
                        return (
                          <div key={`${x.id}-${rad}`} className="au-cell">
                            {kanBestille ? (
                              <button onClick={() => handling({ action: 'read', takeId: x.id }, x.id + 'r')} disabled={jobber === x.id + 'r'}
                                style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: '1px dashed var(--ds-border-strong)', padding: '8px 10px', cursor: 'pointer', font: 'inherit', fontSize: 13, color: 'var(--ink-soft)' }}>
                                <span aria-hidden="true">+</span>{jobber === x.id + 'r' ? t('reading') : t('one_more')}
                              </button>
                            ) : (
                              <span style={{ fontSize: 12.5, color: 'var(--text-faint)' }}>
                                {x.stage === 'queued' || x.stage === 'reading' ? t('reading_in') : ''}
                              </span>
                            )}
                          </div>
                        )
                      }
                      return (
                        <div key={r.id} className="au-cell" style={r.is_chosen ? { background: 'var(--ember-tint-bg)' } : undefined}>
                          {r.audio_url ? (
                            <audio controls preload="none" src={r.audio_url} style={{ width: '100%', height: 32 }} />
                          ) : (
                            <span style={{ fontSize: 12.5, color: 'var(--text-faint)' }}>{t('reading_in')}</span>
                          )}
                          <button onClick={() => handling({ action: 'choose', readId: r.id }, r.id)} disabled={jobber === r.id || iFase2}
                            style={{
                              alignSelf: 'flex-start', fontSize: 12, fontFamily: MONO, letterSpacing: '0.08em', textTransform: 'uppercase',
                              padding: '4px 9px', cursor: iFase2 ? 'default' : 'pointer',
                              border: `1px solid ${r.is_chosen ? 'var(--ember-deep)' : 'var(--ds-border-strong)'}`,
                              background: r.is_chosen ? 'var(--ember-deep)' : 'transparent',
                              color: r.is_chosen ? 'var(--on-ember)' : 'var(--ink-soft)',
                            }}>
                            {r.is_chosen ? t('chosen') : t('choose')}
                          </button>
                          {/* Regien kan ha blitt lest av ulike modeller — v3 tar
                              regi som en tagg, turbo kan det ikke. Uten denne
                              linja later to lesninger av SAMME regi ulikt uten
                              at noen kan se hvorfor, og da er ikke Audition
                              lenger en sammenlikning. Vises bare når regien
                              faktisk fikk en tagg; ellers er den støy. */}
                          {r.tag && (
                            <span style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-faint)' }}>
                              {r.tag}
                            </span>
                          )}
                        </div>
                      )
                    })}
                  </RadIRutenett>
                ))}

                <RadIRutenett label={t('row_film')}>
                  {takes.map((x) => {
                    const valgt = (x.reads || []).find((r) => r.is_chosen)
                    const iFase2 = ['still', 'video', 'done'].includes(x.stage)
                    return (
                      <div key={`f-${x.id}`} className="au-cell" style={{ borderBottomColor: 'var(--ds-border-strong)' }}>
                        {iFase2 ? (
                          <span style={{ fontFamily: MONO, fontSize: 11.5, color: 'var(--text-muted)' }}>
                            {x.stage === 'failed' ? (x.feil || t('stage_failed'))
                              : (STEG as readonly string[]).includes(x.stage) ? t(`stage_${x.stage}`) : x.stage}
                          </span>
                        ) : valgt ? (
                          <button onClick={() => handling({ action: 'film', takeId: x.id }, x.id + 'f')} disabled={jobber === x.id + 'f'}
                            style={{ padding: '9px 12px', fontFamily: DISPLAY, fontWeight: 700, fontSize: 13.5, background: 'var(--ember-deep)', color: 'var(--on-ember)', border: 'none', cursor: 'pointer' }}>
                            {jobber === x.id + 'f' ? t('starting') : t('make_film', { pris: x.cost_nok ?? prisFilm })}
                          </button>
                        ) : (
                          <span style={{ fontSize: 12.5, color: 'var(--text-faint)' }}>{t('choose_first_short')}</span>
                        )}
                      </div>
                    )
                  })}
                </RadIRutenett>
              </div>
            )}

            <div style={{ display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap', marginTop: 22 }}>
              <span style={{ fontFamily: MONO, fontSize: 11.5, color: 'var(--text-faint)' }}>
                {t('share')} {typeof window !== 'undefined' ? `${window.location.host}/audition?id=${auditionId}` : ''}
              </span>
              <button onClick={() => { setAuditionId(null); setTakes([]); setFerdig(false); window.history.replaceState(null, '', '/audition') }}
                style={{ marginLeft: 'auto', padding: '11px 20px', fontFamily: DISPLAY, fontWeight: 700, fontSize: 14, background: 'transparent', color: 'var(--ink)', border: '1px solid var(--ds-border-strong)', cursor: 'pointer' }}>
                {t('new_round')}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

/** Én rad i det faste rutenettet: etikett til venstre, én celle per skuespiller. */
function RadIRutenett({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <div className="au-rowlabel">{label}</div>
      {children}
    </>
  )
}

function Rad({ k, v, dempet, liten }: { k: string; v: string; dempet?: boolean; liten?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: liten ? '3px 0' : '7px 0', fontSize: liten ? 12.5 : 14 }}>
      <span style={{ color: dempet ? 'var(--text-faint)' : 'var(--text-muted)' }}>{k}</span>
      <span style={{ color: dempet ? 'var(--text-faint)' : 'var(--ink)', fontVariantNumeric: 'tabular-nums' }}>{v}</span>
    </div>
  )
}
