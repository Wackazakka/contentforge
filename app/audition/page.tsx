'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { useAuth } from '@/lib/authContext'
import Plukker from './Plukker'
import type { Kandidat } from '@/lib/castingAttributes'

// Audition: samme scene, samme replikk, ulike skuespillere.
//
// 🔑 Designregelen som gjør dette til et castingverktøy og ikke en
// showreel-maskin: alt unntatt skuespilleren er identisk. Derfor står replikk,
// regi og scene ÉN gang, over hele utvalget — ikke per skuespiller. Varierer
// rammen, sammenlikner regissøren bilder; er rammen lik, sammenlikner hen
// skuespillere.
//
// Flaten poller selv. Ingen forespørsel venter på en render: hver poll skyver
// hvert take ett steg videre (se lib/auditions.ts).

interface Read { id: string; take_id: string; audio_url: string | null; direction: string | null; is_chosen: boolean }
interface Take { id: string; actor_id: string; stage: string; still_url: string | null; video_url: string | null; feil: string | null; cost_nok: number | null; reads: Read[] }

// Bare verdiene ligger i koden; etikettene hentes per språk. Verdiene er
// API-kontrakt (de går til ElevenLabs-presetene og til basen) og skal aldri
// oversettes — det er derfor de står adskilt fra teksten.
const REGI = ['noytral', 'varm', 'entusiastisk', 'rolig', 'trist', 'dramatisk'] as const
const STEG = ['queued', 'ready', 'still', 'video', 'done', 'failed'] as const

export default function AuditionPage() {
  const t = useTranslations('audition')
  // Auth-konteksten, ikke getSession() direkte: ved foerste rendring er
  // sesjonen ikke hydrert ennaa, og et kall da ser ut som «ikke innlogget».
  const { session, loading: authLoading } = useAuth()
  const [kandidater, setKandidater] = useState<Kandidat[]>([])
  const [totalt, setTotalt] = useState(0)
  const [avkuttet, setAvkuttet] = useState(false)
  const [prisFilm, setPrisFilm] = useState(0)
  const [prisLesning, setPrisLesning] = useState(0)
  const [jobber, setJobber] = useState<string | null>(null)
  const [valgte, setValgte] = useState<string[]>([])
  const [line, setLine] = useState('')
  const [direction, setDirection] = useState('noytral')
  const [scene, setScene] = useState('a quiet room with soft daylight, plain background, facing the camera')
  const [tittel, setTittel] = useState('')
  const [auditionId, setAuditionId] = useState<string | null>(null)
  const [takes, setTakes] = useState<Take[]>([])
  const [ferdig, setFerdig] = useState(false)
  // Runden sin EGEN replikk. Åpnes en delt lenke, er skjemaet tomt — da må
  // overskriften komme fra auditionen og ikke fra det man selv har skrevet.
  const [rundeLine, setRundeLine] = useState('')
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
    // Vent til sesjonen er avklart. Uten dette kjoerer foerste hent foer
    // hydreringen og feiler med «Ikke innlogget» selv naar man ER innlogget.
    if (authLoading || !session) return
    ;(async () => {
      try {
        const res = await fetch('/api/auditions', { headers: { Authorization: `Bearer ${await token()}` } })
        const d = await res.json()
        if (!res.ok) { setError(d.error || t('err_actors')); return }
        setKandidater(d.actors || [])
        setTotalt(Number(d.totalt) || (d.actors || []).length)
        setAvkuttet(d.avkuttet === true)
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
      // Fase 1 starter av seg selv: en lesning per plass, slik at regissøren
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
  const pris = valgte.length * prisLesning

  return (
    <div className="min-h-screen bg-[var(--paper)] text-[var(--ink,#1C1A16)]">
      <div className="max-w-5xl mx-auto px-6 py-10">
        <Link href="/stemmer" className="text-sm text-[var(--ember-deep)] hover:underline">{t('back')}</Link>
        <h1 className="text-4xl font-bold mt-3 mb-2" style={{ letterSpacing: '-0.02em' }}>{t('title')}</h1>
        <p className="text-lg text-[var(--ink-soft,#4A443B)] max-w-2xl mb-8">
          {t('intro')}
        </p>

        {error && <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

        {/* Utlogget er en TILSTAND, ikke en feil. En rød boks som sier «Ikke
            innlogget» ser ut som noe er i stuss; en lenke sier hva man gjør. */}
        {!authLoading && !session && (
          <div className="rounded-xl border p-6" style={{ background: 'var(--paper-raised)', borderColor: 'var(--ds-border, #E2D9C8)' }}>
            <h2 className="font-semibold text-lg mb-1">{t('login_title')}</h2>
            <p className="text-sm text-[var(--ink-soft,#4A443B)] mb-4 max-w-md">
              {t('login_body')}
            </p>
            <Link href="/login" className="px-5 py-2.5 rounded-lg font-semibold text-[var(--on-ember)] bg-[var(--ember-deep)] hover:opacity-90 inline-block">
              {t('login_cta')}
            </Link>
          </div>
        )}

        {authLoading && <p className="text-sm text-[var(--text-muted,#6B6358)]">{t('loading')}</p>}

        {!authLoading && session && !auditionId && (
          <div className="rounded-xl border p-6 mb-8" style={{ background: 'var(--paper-raised)', borderColor: 'var(--ds-border, #E2D9C8)' }}>
            <label className="block text-sm font-medium mb-1">{t('field_line')}</label>
            <textarea value={line} onChange={(e) => setLine(e.target.value)} rows={2}
              placeholder={t('line_placeholder')}
              className="w-full px-3 py-2 border rounded-lg text-sm mb-4" style={{ borderColor: 'var(--ds-border, #E2D9C8)' }} />

            <div className="grid sm:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium mb-1">{t('field_direction')}</label>
                <select value={direction} onChange={(e) => setDirection(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg text-sm" style={{ borderColor: 'var(--ds-border, #E2D9C8)' }}>
                  {REGI.map((v) => <option key={v} value={v}>{t(`dir_${v}`)}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">{t('field_title')}</label>
                <input value={tittel} onChange={(e) => setTittel(e.target.value)} placeholder={t('title_placeholder')}
                  className="w-full px-3 py-2 border rounded-lg text-sm" style={{ borderColor: 'var(--ds-border, #E2D9C8)' }} />
              </div>
            </div>

            <label className="block text-sm font-medium mb-1">{t('field_scene')}</label>
            <input value={scene} onChange={(e) => setScene(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg text-sm mb-1" style={{ borderColor: 'var(--ds-border, #E2D9C8)' }} />
            <p className="text-xs text-[var(--text-faint,#8A8175)] mb-5">
              {t('scene_note')}
            </p>

            {/* Valget av skuespillere gikk fra et rutenett til castingplukkeren
                (Lars 20/9): «Når vi har flere hundre å velge mellom må vi ha
                mulighet til å søke.» Maks åtte per runde — samme grense som
                POST-ruta håndhever. */}
            <label className="block text-sm font-medium mb-2">{t('who', { n: valgte.length })}</label>
            {kandidater.length === 0 ? (
              <p className="text-sm text-[var(--text-muted,#6B6358)] mb-4">
                {t('none_ready')}
              </p>
            ) : (
              <Plukker kandidater={kandidater} valgte={valgte} setValgte={setValgte}
                totalt={totalt} avkuttet={avkuttet} maks={8} />
            )}

            <div className="flex items-center gap-4 flex-wrap">
              <button onClick={kjor} disabled={busy || !line.trim() || valgte.length === 0}
                className="px-5 py-2.5 rounded-lg font-semibold text-[var(--on-ember)] bg-[var(--ember-deep)] hover:opacity-90 disabled:opacity-50">
                {busy ? t('starting') : (pris ? t('hear_them_price', { pris }) : t('hear_them'))}
              </button>
              {valgte.length > 0 && (
                <span className="text-sm text-[var(--text-muted,#6B6358)]">
                  {t('price_note', { lesning: prisLesning, film: prisFilm })}
                </span>
              )}
            </div>
          </div>
        )}

        {!authLoading && session && auditionId && (
          <>
            <div className="flex items-baseline justify-between gap-4 flex-wrap mb-4">
              <h2 className="font-semibold text-lg">{rundeLine ? `«${rundeLine}»` : t('fetching_round')}</h2>
              <span className="text-sm text-[var(--text-muted,#6B6358)]">
                {ferdig ? t('stage_done') : t('progress', { done: takes.filter((x) => x.stage === 'done').length, total: takes.length })}
              </span>
            </div>
            <div className="grid gap-5 mb-8" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
              {takes.map((take) => {
                const valgtLesning = take.reads?.find((r) => r.is_chosen) || null
                const iFase2 = ['still', 'video', 'done'].includes(take.stage)
                return (
                  <div key={take.id} className="rounded-xl border overflow-hidden"
                    style={{ background: 'var(--paper-raised)', borderColor: 'var(--ds-border, #E2D9C8)' }}>
                    {take.video_url ? (
                      <video controls preload="metadata" playsInline src={take.video_url} className="w-full" style={{ background: '#000' }} />
                    ) : take.still_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={take.still_url} alt="" className="w-full aspect-video object-cover object-top opacity-70" />
                    ) : null}

                    <div className="px-4 py-3">
                      <div className="flex items-center justify-between gap-3 mb-2">
                        <span className="font-medium">{navn(take.actor_id)}</span>
                        <span className="text-xs text-[var(--text-muted,#6B6358)]">
                          {take.stage === 'failed' ? (take.feil || t('stage_failed'))
                            : (STEG as readonly string[]).includes(take.stage) ? t(`stage_${take.stage}`) : take.stage}
                        </span>
                      </div>

                      {/* FASE 1 — lesningene. Flere takes per skuespiller, fordi
                          modellen ikke er deterministisk: samme regi gir ulike
                          lesninger, og «en take til» er en regihandling. */}
                      {!iFase2 && (
                        <>
                          <div className="space-y-2 mb-3">
                            {(take.reads || []).map((r, i) => (
                              <div key={r.id} className="flex items-center gap-2">
                                <span className="text-xs text-[var(--text-faint,#8A8175)] w-14 flex-none">{t('take_n', { n: i + 1 })}</span>
                                {r.audio_url && <audio controls preload="none" src={r.audio_url} className="flex-1 h-9" />}
                                <button onClick={() => handling({ action: 'choose', readId: r.id }, r.id)}
                                  disabled={jobber === r.id}
                                  className="text-xs font-semibold px-2.5 py-1.5 rounded-lg border flex-none"
                                  style={r.is_chosen
                                    ? { borderColor: 'var(--ember-deep)', color: 'var(--ember-deep)', background: 'var(--ember-tint-bg)' }
                                    : { borderColor: 'var(--ds-border, #E2D9C8)' }}>
                                  {r.is_chosen ? t('chosen') : t('choose')}
                                </button>
                              </div>
                            ))}
                            {(take.reads || []).length === 0 && (
                              <p className="text-xs text-[var(--text-faint,#8A8175)]">{t('no_read')}</p>
                            )}
                          </div>
                          <div className="flex gap-2 flex-wrap">
                            <button onClick={() => handling({ action: 'read', takeId: take.id }, take.id + 'r')}
                              disabled={jobber === take.id + 'r'}
                              className="text-sm font-semibold px-3 py-2 rounded-lg border disabled:opacity-50"
                              style={{ borderColor: 'var(--ds-border, #E2D9C8)' }}>
                              {jobber === take.id + 'r' ? t('reading') : t('one_more')}
                            </button>
                            <button onClick={() => handling({ action: 'film', takeId: take.id }, take.id + 'f')}
                              disabled={!valgtLesning || jobber === take.id + 'f'}
                              className="text-sm font-semibold px-3 py-2 rounded-lg text-[var(--on-ember)] bg-[var(--ember-deep)] disabled:opacity-50">
                              {jobber === take.id + 'f' ? t('starting') : t('make_film', { pris: take.cost_nok ?? prisFilm })}
                            </button>
                          </div>
                          {!valgtLesning && (take.reads || []).length > 0 && (
                            <p className="text-xs text-[var(--text-faint,#8A8175)] mt-2">
                              {t('choose_first')}
                            </p>
                          )}
                        </>
                      )}

                      {/* FASE 2 — filmen bygges på den valgte lesningen. */}
                      {iFase2 && valgtLesning?.audio_url && take.stage !== 'done' && (
                        <audio controls preload="none" src={valgtLesning.audio_url} className="w-full h-9" />
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
            <p className="text-xs text-[var(--text-faint,#8A8175)] mb-4">
              {t('share')} <code>{typeof window !== 'undefined' ? `${window.location.origin}/audition?id=${auditionId}` : ''}</code>
            </p>
            <button onClick={() => { setAuditionId(null); setTakes([]); setFerdig(false); window.history.replaceState(null, '', '/audition') }}
              className="px-5 py-2.5 rounded-lg font-semibold border hover:border-[var(--ember-deep)]"
              style={{ borderColor: 'var(--ds-border, #E2D9C8)' }}>
              {t('new_round')}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
