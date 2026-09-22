'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams } from 'next/navigation'
import { ANBEFALT_BILDER } from '@/lib/levering'

// Leveringssiden (migrasjon 099): bildene til ansiktsmodellen, og opptaket hun
// alt hadde. Hun har ingen konto — lenken er autentiseringen.
//
// 🔑 FILENE GAAR RETT TIL LAGRING. Ruta deler ut en signert lenke per fil,
// nettleseren PUT-er dit, og ruta faar bare stien. Ingen fil passerer en
// Netlify-funksjon (grensen er ~6 MB; bevist 22.09).
//
// 🔑 EN FIL OM GANGEN, MED TELLING. Tjue bilder paa en mobil over 4G tar tid.
// Uten «7 av 20» ser en halvferdig opplasting ut som en henging, og hun
// lukker fanen midt i. Feiler ei fil, fortsetter resten — og hun ser hvilken.

const DISPLAY = 'var(--font-archivo), system-ui, sans-serif'
const SANS = 'var(--font-hanken), system-ui, sans-serif'
const MONO = 'var(--font-cfmono), ui-monospace, monospace'

interface Fil { path: string; navn: string }
interface Status {
  trengerBilder: boolean; trengerOpptak: boolean; venterVeiledetOpptak: boolean
  bilderOk: boolean; opptakOk: boolean; ferdig: boolean
}
interface Svar {
  fornavn: string; avvist: boolean
  bilder: Fil[]; opptak: Fil[]; status: Status
  grenser: { minBilder: number; maksBilder: number; maksFilMb: number }
}

type Kind = 'photo' | 'recording'

export default function LeveringPage() {
  const token = String(useParams().token || '')
  const [d, setD] = useState<Svar | null>(null)
  const [feil, setFeil] = useState<string | null>(null)
  const [laster, setLaster] = useState<{ kind: Kind; n: number; av: number; navn: string } | null>(null)
  const [filFeil, setFilFeil] = useState<string[]>([])
  const bildeInput = useRef<HTMLInputElement>(null)
  const lydInput = useRef<HTMLInputElement>(null)

  const post = useCallback(async (body: Record<string, unknown>) => {
    const r = await fetch('/api/levering', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, ...body }),
    })
    const t = await r.text()
    let j: any = {}
    try { j = t ? JSON.parse(t) : {} } catch { /* tom */ }
    if (!r.ok) throw new Error(j.error || `Feil (${r.status})`)
    return j
  }, [token])

  const hent = useCallback(async () => {
    try {
      const r = await fetch(`/api/levering?token=${encodeURIComponent(token)}`)
      const j = await r.json()
      if (!r.ok) { setFeil(j.error || 'Kunne ikke hente siden'); return }
      setD(j)
    } catch { setFeil('Kunne ikke hente siden') }
  }, [token])

  useEffect(() => { hent() }, [hent])

  const lastOpp = async (kind: Kind, valgte: File[]) => {
    if (valgte.length === 0) return
    setFeil(null); setFilFeil([])
    const feilet: string[] = []
    let siste: Svar | null = null
    for (let i = 0; i < valgte.length; i++) {
      const f = valgte[i]
      setLaster({ kind, n: i + 1, av: valgte.length, navn: f.name })
      try {
        const l = await post({ handling: 'opplastingslenke', kind, contentType: f.type, size: f.size })
        const put = await fetch(l.uploadUrl, { method: 'PUT', body: f, headers: { 'Content-Type': f.type } })
        if (!put.ok) throw new Error(`opplasting feilet (${put.status})`)
        siste = await post({ handling: 'registrer', kind, path: l.path })
        setD(siste)
      } catch (e) {
        feilet.push(`${f.name}: ${e instanceof Error ? e.message : 'feil'}`)
      }
    }
    setLaster(null)
    setFilFeil(feilet)
    if (!siste) await hent()
  }

  const fjern = async (kind: Kind, path: string) => {
    setFeil(null)
    try { setD(await post({ handling: 'fjern', kind, path })) }
    catch (e) { setFeil(e instanceof Error ? e.message : 'Kunne ikke fjerne') }
  }

  if (feil && !d) {
    return (
      <Ramme>
        <h1 style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 24, margin: '0 0 8px' }}>Lenken virker ikke</h1>
        <p style={{ color: 'var(--ink-soft)', margin: 0 }}>{feil}</p>
      </Ramme>
    )
  }
  if (!d) return <Ramme><p style={{ color: 'var(--text-muted)', margin: 0 }}>Henter…</p></Ramme>

  if (d.avvist) {
    return (
      <Ramme>
        <h1 style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 24, margin: '0 0 8px' }}>Denne søknaden er avsluttet</h1>
        <p style={{ color: 'var(--ink-soft)', margin: 0 }}>Siden tar ikke imot mer.</p>
      </Ramme>
    )
  }

  const s = d.status
  const ingentingAaLevere = !s.trengerBilder && !s.trengerOpptak

  return (
    <Ramme>
      <h1 style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 26, letterSpacing: '-0.02em', margin: '0 0 6px' }}>
        Hei {d.fornavn} — her leverer du
      </h1>
      <p style={{ fontSize: 15, lineHeight: 1.55, color: 'var(--ink-soft)', margin: '0 0 26px' }}>
        {ingentingAaLevere
          ? 'Vi har alt vi trenger fra deg nå.'
          : 'Du kan komme tilbake til denne siden så mange ganger du vil. Det du har lastet opp, ligger her.'}
      </p>

      {s.ferdig && !ingentingAaLevere && (
        <Boks tone="ok">
          <strong>Alt som kreves er på plass.</strong> Du kan fortsatt legge til flere bilder — {ANBEFALT_BILDER} gir merkbart bedre likhet.
        </Boks>
      )}
      {feil && <Boks tone="feil">{feil}</Boks>}
      {filFeil.length > 0 && (
        <Boks tone="feil">
          <strong>{filFeil.length === 1 ? 'Én fil kom ikke fram:' : `${filFeil.length} filer kom ikke fram:`}</strong>
          <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>{filFeil.map((x) => <li key={x}>{x}</li>)}</ul>
        </Boks>
      )}

      {s.trengerBilder && (
        <Seksjon
          tittel="Bilder til ansiktsmodellen"
          teller={`${d.bilder.length} av minst ${d.grenser.minBilder}`}
          ok={s.bilderOk}>
          <p style={{ fontSize: 14, lineHeight: 1.55, color: 'var(--ink-soft)', margin: '0 0 12px' }}>
            Deg alene. <strong>Ulike vinkler, ulike uttrykk, ulikt lys</strong> — rett forfra, trekvart, profil; smil,
            alvor, latter; inne og ute. Tjue like passbilder gir en modell som bare kan det ene bildet.
            JPG, PNG eller WebP, maks {d.grenser.maksFilMb} MB per fil, inntil {d.grenser.maksBilder} bilder.
          </p>
          <input ref={bildeInput} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden
            onChange={(e) => { lastOpp('photo', Array.from(e.target.files || [])); e.target.value = '' }} />
          <Knapp disabled={!!laster} onClick={() => bildeInput.current?.click()}>
            {laster?.kind === 'photo' ? `Laster opp ${laster.n} av ${laster.av}…` : d.bilder.length ? 'Legg til flere bilder' : 'Velg bilder'}
          </Knapp>
          {laster?.kind === 'photo' && <Framdrift n={laster.n} av={laster.av} navn={laster.navn} />}
          {d.bilder.length > 0 && (
            <Liste filer={d.bilder} onFjern={(p) => fjern('photo', p)} disabled={!!laster} />
          )}
          <p style={{ fontSize: 13, lineHeight: 1.55, color: 'var(--text-muted)', margin: '12px 0 0' }}>
            Når modellen er trent, får du den tilsendt for godkjenning: du ser tre bilder laget med den, og svarer
            ja eller nei. Den kan ikke brukes til noe før du har sagt ja.
          </p>
        </Seksjon>
      )}

      {s.trengerOpptak && (
        <Seksjon
          tittel="Opptaket ditt"
          teller={d.opptak.length ? `${d.opptak.length} ${d.opptak.length === 1 ? 'fil' : 'filer'}` : 'ingenting ennå'}
          ok={s.opptakOk}>
          <p style={{ fontSize: 14, lineHeight: 1.55, color: 'var(--ink-soft)', margin: '0 0 12px' }}>
            Rundt <strong>30 minutter ren tale</strong>, samme mikrofon og samme rom hele veien. Gjerne variert —
            rolig, varmt, med driv, dempet — ikke tretti minutter i én tone. MP3 eller M4A holder fint; er fila
            over {d.grenser.maksFilMb} MB, del den i flere. Ingen musikk under, ingen andre stemmer.
          </p>
          <input ref={lydInput} type="file" accept="audio/*" multiple hidden
            onChange={(e) => { lastOpp('recording', Array.from(e.target.files || [])); e.target.value = '' }} />
          <Knapp disabled={!!laster} onClick={() => lydInput.current?.click()}>
            {laster?.kind === 'recording' ? `Laster opp ${laster.n} av ${laster.av}…` : d.opptak.length ? 'Legg til flere filer' : 'Velg lydfil'}
          </Knapp>
          {laster?.kind === 'recording' && <Framdrift n={laster.n} av={laster.av} navn={laster.navn} />}
          {d.opptak.length > 0 && (
            <Liste filer={d.opptak} onFjern={(p) => fjern('recording', p)} disabled={!!laster} />
          )}
        </Seksjon>
      )}

      {s.venterVeiledetOpptak && (
        <Seksjon tittel="Opptaket" teller="tar vi sammen" ok={false} noytral>
          <p style={{ fontSize: 14, lineHeight: 1.55, color: 'var(--ink-soft)', margin: 0 }}>
            Du sa du ville ha hjelp til opptaket, og det får du: når søknaden er gjennomgått, får du en egen lenke med
            tekster å lese, nivåmåling og veiledning. Rundt 30 minutter, i flere omganger om du vil. Ingenting å gjøre
            her nå.
          </p>
        </Seksjon>
      )}
    </Ramme>
  )
}

function Ramme({ children }: { children: React.ReactNode }) {
  return (
    <main style={{ fontFamily: SANS, maxWidth: 640, margin: '0 auto', padding: 'clamp(24px, 5vw, 56px) 20px 80px', color: 'var(--ink)' }}>
      {children}
    </main>
  )
}

function Boks({ tone, children }: { tone: 'ok' | 'feil'; children: React.ReactNode }) {
  const ok = tone === 'ok'
  return (
    <div style={{
      border: `1px solid ${ok ? 'var(--ds-border-strong)' : 'var(--ember-tint-border)'}`,
      background: ok ? 'var(--paper-raised)' : 'var(--ember-tint-bg)',
      color: ok ? 'var(--ink)' : 'var(--ember-deep)',
      padding: '12px 14px', fontSize: 14, lineHeight: 1.5, marginBottom: 16,
    }}>{children}</div>
  )
}

function Seksjon({ tittel, teller, ok, noytral, children }: { tittel: string; teller: string; ok: boolean; noytral?: boolean; children: React.ReactNode }) {
  return (
    <section style={{ border: '1px solid var(--ds-border-strong)', background: 'var(--paper-raised)', padding: '20px 22px', marginBottom: 18 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, flexWrap: 'wrap', marginBottom: 10 }}>
        <h2 style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 18, letterSpacing: '-0.01em', margin: 0 }}>{tittel}</h2>
        <span style={{ fontFamily: MONO, fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: noytral ? 'var(--text-muted)' : ok ? 'var(--ink)' : 'var(--ember-deep)' }}>
          {ok && !noytral ? '✓ ' : ''}{teller}
        </span>
      </div>
      {children}
    </section>
  )
}

function Knapp({ disabled, onClick, children }: { disabled?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" disabled={disabled} onClick={onClick}
      style={{ background: disabled ? 'var(--ds-border-strong)' : 'var(--ink)', color: 'var(--paper)', border: 'none', padding: '12px 20px', fontSize: 14.5, fontWeight: 600, cursor: disabled ? 'default' : 'pointer', fontFamily: SANS }}>
      {children}
    </button>
  )
}

function Framdrift({ n, av, navn }: { n: number; av: number; navn: string }) {
  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ height: 4, background: 'var(--ds-border)', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${Math.round(((n - 1) / av) * 100)}%`, background: 'var(--ink)', transition: 'width .2s' }} />
      </div>
      <p style={{ fontFamily: MONO, fontSize: 11, color: 'var(--text-muted)', margin: '6px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{navn}</p>
    </div>
  )
}

function Liste({ filer, onFjern, disabled }: { filer: Fil[]; onFjern: (p: string) => void; disabled: boolean }) {
  return (
    <ul style={{ listStyle: 'none', padding: 0, margin: '14px 0 0', borderTop: '1px solid var(--ds-border)' }}>
      {filer.map((f) => (
        <li key={f.path} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: '8px 0', borderBottom: '1px solid var(--ds-border)', fontSize: 13.5 }}>
          <span style={{ fontFamily: MONO, fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.navn}</span>
          <button type="button" disabled={disabled} onClick={() => onFjern(f.path)}
            style={{ background: 'none', border: 'none', color: 'var(--ember-deep)', cursor: disabled ? 'default' : 'pointer', fontSize: 13, fontFamily: SANS, padding: 0 }}>
            Fjern
          </button>
        </li>
      ))}
    </ul>
  )
}
