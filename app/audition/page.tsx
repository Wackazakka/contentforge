'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import Link from 'next/link'
import { useAuth } from '@/lib/authContext'

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

interface Kandidat { id: string; name: string; isDemo: boolean; photo: string | null }
interface Take { id: string; actor_id: string; stage: string; still_url: string | null; video_url: string | null; feil: string | null }

const REGI: Array<[string, string]> = [
  ['noytral', 'Nøytral'],
  ['varm', 'Varm'],
  ['entusiastisk', 'Entusiastisk'],
  ['rolig', 'Rolig'],
  ['trist', 'Trist'],
  ['dramatisk', 'Dramatisk'],
]

const STEG: Record<string, string> = {
  queued: 'I kø', still: 'Lager bildet', voice: 'Leser replikken', video: 'Rendrer', done: 'Ferdig', failed: 'Feilet',
}

export default function AuditionPage() {
  // Auth-konteksten, ikke getSession() direkte: ved foerste rendring er
  // sesjonen ikke hydrert ennaa, og et kall da ser ut som «ikke innlogget».
  const { session, loading: authLoading } = useAuth()
  const [kandidater, setKandidater] = useState<Kandidat[]>([])
  const [prisPerTake, setPrisPerTake] = useState(0)
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
    const t = session?.access_token
    if (!t) throw new Error('Ikke innlogget')
    return t
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
        if (!res.ok) { setError(d.error || 'Kunne ikke hente skuespillerne'); return }
        setKandidater(d.actors || [])
        setPrisPerTake(Number(d.prisPerTake) || 0)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Ukjent feil')
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, session])

  const poll = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/auditions?id=${id}`, { headers: { Authorization: `Bearer ${await token()}` } })
      const d = await res.json()
      if (!res.ok) return
      setTakes(d.takes || [])
      if (d.audition?.line) setRundeLine(d.audition.line)
      if (d.ferdig) {
        setFerdig(true)
        if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
      }
    } catch { /* prøver igjen ved neste poll */ }
  }, [])

  useEffect(() => {
    if (!auditionId || ferdig) return
    poll(auditionId)
    pollRef.current = setInterval(() => poll(auditionId), 5000)
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [auditionId, ferdig, poll])

  const kjor = async () => {
    setBusy(true); setError(null)
    try {
      const res = await fetch('/api/auditions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${await token()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ line, direction, scenePrompt: scene, actorIds: valgte, title: tittel || null }),
      })
      const d = await res.json()
      if (!res.ok) { setError(d.error || 'Kunne ikke starte'); return }
      setAuditionId(d.id); setTakes([]); setFerdig(false)
    } finally { setBusy(false) }
  }

  const navn = (id: string) => kandidater.find((k) => k.id === id)?.name || 'Ukjent'
  const pris = valgte.length * prisPerTake

  return (
    <div className="min-h-screen bg-[var(--paper)] text-[var(--ink,#1C1A16)]">
      <div className="max-w-5xl mx-auto px-6 py-10">
        <Link href="/stemmer" className="text-sm text-[var(--ember-deep)] hover:underline">← Stemmer og ansikter</Link>
        <h1 className="text-4xl font-bold mt-3 mb-2" style={{ letterSpacing: '-0.02em' }}>Audition</h1>
        <p className="text-lg text-[var(--ink-soft,#4A443B)] max-w-2xl mb-8">
          Skriv replikken én gang, velg hvem som skal lese den, og se dem ved siden av hverandre.
          Alt unntatt skuespilleren er likt — det er det som gjør at du sammenlikner mennesker og ikke bilder.
        </p>

        {error && <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

        {/* Utlogget er en TILSTAND, ikke en feil. En rød boks som sier «Ikke
            innlogget» ser ut som noe er i stuss; en lenke sier hva man gjør. */}
        {!authLoading && !session && (
          <div className="rounded-xl border p-6" style={{ background: 'var(--paper-raised)', borderColor: 'var(--ds-border, #E2D9C8)' }}>
            <h2 className="font-semibold text-lg mb-1">Logg inn for å kjøre en audition</h2>
            <p className="text-sm text-[var(--ink-soft,#4A443B)] mb-4 max-w-md">
              Auditions koster penger og betaler skuespillerne, så de føres på en konto.
            </p>
            <Link href="/login" className="px-5 py-2.5 rounded-lg font-semibold text-[var(--on-ember)] bg-[var(--ember-deep)] hover:opacity-90 inline-block">
              Logg inn
            </Link>
          </div>
        )}

        {authLoading && <p className="text-sm text-[var(--text-muted,#6B6358)]">Laster …</p>}

        {!authLoading && session && !auditionId && (
          <div className="rounded-xl border p-6 mb-8" style={{ background: 'var(--paper-raised)', borderColor: 'var(--ds-border, #E2D9C8)' }}>
            <label className="block text-sm font-medium mb-1">Replikken</label>
            <textarea value={line} onChange={(e) => setLine(e.target.value)} rows={2}
              placeholder="Én replikk, slik den står i manus."
              className="w-full px-3 py-2 border rounded-lg text-sm mb-4" style={{ borderColor: 'var(--ds-border, #E2D9C8)' }} />

            <div className="grid sm:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium mb-1">Regi</label>
                <select value={direction} onChange={(e) => setDirection(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg text-sm" style={{ borderColor: 'var(--ds-border, #E2D9C8)' }}>
                  {REGI.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Tittel (valgfritt)</label>
                <input value={tittel} onChange={(e) => setTittel(e.target.value)} placeholder="Scene 14, kjøkkenet"
                  className="w-full px-3 py-2 border rounded-lg text-sm" style={{ borderColor: 'var(--ds-border, #E2D9C8)' }} />
              </div>
            </div>

            <label className="block text-sm font-medium mb-1">Scenen</label>
            <input value={scene} onChange={(e) => setScene(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg text-sm mb-1" style={{ borderColor: 'var(--ds-border, #E2D9C8)' }} />
            <p className="text-xs text-[var(--text-faint,#8A8175)] mb-5">
              Samme scene for alle. Endrer du den, endres den for hele runden — poenget er at bare ansiktet skal variere.
            </p>

            <label className="block text-sm font-medium mb-2">Hvem skal lese den? ({valgte.length} valgt)</label>
            {kandidater.length === 0 ? (
              <p className="text-sm text-[var(--text-muted,#6B6358)] mb-4">
                Ingen er klare ennå. En audition krever at skuespilleren har både stemme og ansiktsmodell.
              </p>
            ) : (
              <div className="grid gap-3 mb-5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))' }}>
                {kandidater.map((k) => {
                  const paa = valgte.includes(k.id)
                  return (
                    <button key={k.id}
                      onClick={() => setValgte((v) => paa ? v.filter((x) => x !== k.id) : [...v, k.id])}
                      className="rounded-xl border overflow-hidden text-left transition-colors"
                      style={{ borderColor: paa ? 'var(--ember-deep)' : 'var(--ds-border, #E2D9C8)', borderWidth: paa ? 2 : 1 }}>
                      {k.photo
                        // eslint-disable-next-line @next/next/no-img-element
                        ? <img src={k.photo} alt="" className="w-full aspect-[4/3] object-cover object-top" />
                        : <div className="w-full aspect-[4/3]" style={{ background: 'var(--ember-tint-bg)' }} />}
                      <div className="px-3 py-2 text-sm font-medium flex items-center gap-2">
                        {k.name}
                        {k.isDemo && <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded-full border"
                          style={{ borderColor: 'var(--ds-border, #E2D9C8)', color: 'var(--text-muted, #6B6358)' }}>Test</span>}
                      </div>
                    </button>
                  )
                })}
              </div>
            )}

            <div className="flex items-center gap-4 flex-wrap">
              <button onClick={kjor} disabled={busy || !line.trim() || valgte.length === 0}
                className="px-5 py-2.5 rounded-lg font-semibold text-[var(--on-ember)] bg-[var(--ember-deep)] hover:opacity-90 disabled:opacity-50">
                {busy ? 'Starter …' : `Kjør audition${pris ? ` — ${pris} kr` : ''}`}
              </button>
              {valgte.length > 0 && (
                <span className="text-sm text-[var(--text-muted,#6B6358)]">
                  {valgte.length} × {prisPerTake} kr. Skuespillerne får betalt for prøven.
                </span>
              )}
            </div>
          </div>
        )}

        {auditionId && (
          <>
            <div className="flex items-baseline justify-between gap-4 flex-wrap mb-4">
              <h2 className="font-semibold text-lg">{rundeLine ? `«${rundeLine}»` : 'Henter runden …'}</h2>
              <span className="text-sm text-[var(--text-muted,#6B6358)]">
                {ferdig ? 'Ferdig' : `${takes.filter((t) => t.stage === 'done').length} av ${takes.length} klare`}
              </span>
            </div>
            <div className="grid gap-5 mb-8" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
              {takes.map((t) => (
                <div key={t.id} className="rounded-xl border overflow-hidden"
                  style={{ background: 'var(--paper-raised)', borderColor: 'var(--ds-border, #E2D9C8)' }}>
                  {t.video_url ? (
                    <video controls preload="metadata" playsInline src={t.video_url} className="w-full" style={{ background: '#000' }} />
                  ) : t.still_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={t.still_url} alt="" className="w-full aspect-video object-cover object-top opacity-70" />
                  ) : (
                    <div className="w-full aspect-video" style={{ background: 'var(--ember-tint-bg)' }} />
                  )}
                  <div className="px-4 py-3 flex items-center justify-between gap-3">
                    <span className="font-medium">{navn(t.actor_id)}</span>
                    <span className="text-xs text-[var(--text-muted,#6B6358)]">
                      {t.stage === 'failed' ? (t.feil || 'Feilet') : STEG[t.stage] || t.stage}
                    </span>
                  </div>
                </div>
              ))}
            </div>
            <p className="text-xs text-[var(--text-faint,#8A8175)] mb-4">
              Del runden: <code>{typeof window !== 'undefined' ? `${window.location.origin}/audition?id=${auditionId}` : ''}</code>
            </p>
            <button onClick={() => { setAuditionId(null); setTakes([]); setFerdig(false); window.history.replaceState(null, '', '/audition') }}
              className="px-5 py-2.5 rounded-lg font-semibold border hover:border-[var(--ember-deep)]"
              style={{ borderColor: 'var(--ds-border, #E2D9C8)' }}>
              Ny audition
            </button>
          </>
        )}
      </div>
    </div>
  )
}
