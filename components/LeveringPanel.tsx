'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { ANBEFALT_BILDER } from '@/lib/levering'

// Leveringen: bilder til ansiktsmodellen, og opptaket hun alt hadde. Delt
// mellom tokensida (/levering/<token>, for de gamle soeknadene) og
// /min-stemme (innlogget, steg 1). Samme skjermbilde, to maater aa si hvem
// hun er paa — `auth` avgjoer hvilken.
//
// 🔑 FILENE GAAR RETT TIL LAGRING. Ruta deler ut en signert lenke per fil,
// nettleseren PUT-er dit, og ruta faar bare stien. Ingen fil passerer en
// Netlify-funksjon (grensen er ~6 MB; bevist 22.09).
//
// 🔑 EN FIL OM GANGEN, MED TELLING. Tjue bilder over 4G tar tid. Uten
// «7 av 20» ser en halvferdig opplasting ut som en henging.

const DISPLAY = 'var(--font-archivo), system-ui, sans-serif'
const SANS = 'var(--font-hanken), system-ui, sans-serif'
const MONO = 'var(--font-cfmono), ui-monospace, monospace'

export interface Fil { path: string; navn?: string }
export interface LeveringsStatus {
  trengerBilder: boolean; trengerOpptak: boolean; venterVeiledetOpptak: boolean
  bilderOk: boolean; opptakOk: boolean; ferdig: boolean
}
export interface Identitet {
  ok: boolean; reason: string | null; photos: number; withFace: number; sameCount: number
  outliers: string[]; noFace: string[]; multiFace: string[]; checkedAt: string | null
}
export interface LeveringsSvar {
  fornavn: string; avvist?: boolean
  bilder: Fil[]; opptak: Fil[]; status: LeveringsStatus
  grenser: { minBilder: number; maksBilder: number; maksFilMb: number }
  identitet?: Identitet | null
}
export type Auth = { token: string } | { bearer: string; actorId: string }
type Kind = 'photo' | 'recording'

export default function LeveringPanel({
  auth, onStartOpptak, kompakt = false,
}: { auth: Auth; onStartOpptak?: () => Promise<void>; kompakt?: boolean }) {
  const [d, setD] = useState<LeveringsSvar | null>(null)
  const [feil, setFeil] = useState<string | null>(null)
  const [laster, setLaster] = useState<{ kind: Kind; n: number; av: number; navn: string } | null>(null)
  const [filFeil, setFilFeil] = useState<string[]>([])
  const [starter, setStarter] = useState(false)
  const bildeInput = useRef<HTMLInputElement>(null)
  const lydInput = useRef<HTMLInputElement>(null)

  const headers = useCallback((): Record<string, string> => {
    const h: Record<string, string> = { 'Content-Type': 'application/json' }
    if ('bearer' in auth) h.Authorization = `Bearer ${auth.bearer}`
    return h
  }, [auth])
  const ident = useCallback(() => ('token' in auth ? { token: auth.token } : { actorId: auth.actorId }), [auth])

  const post = useCallback(async (body: Record<string, unknown>) => {
    const r = await fetch('/api/levering', { method: 'POST', headers: headers(), body: JSON.stringify({ ...ident(), ...body }) })
    const t = await r.text()
    let j: any = {}
    try { j = t ? JSON.parse(t) : {} } catch { /* tom */ }
    if (!r.ok) throw new Error(j.error || `Feil (${r.status})`)
    return j
  }, [headers, ident])

  const hent = useCallback(async () => {
    try {
      const q = 'token' in auth ? `token=${encodeURIComponent(auth.token)}` : `actorId=${encodeURIComponent(auth.actorId)}`
      const r = await fetch(`/api/levering?${q}`, { headers: headers() })
      const j = await r.json()
      if (!r.ok) { setFeil(j.error || 'Kunne ikke hente'); return }
      setD(j)
    } catch { setFeil('Kunne ikke hente') }
  }, [auth, headers])

  useEffect(() => { hent() }, [hent])

  const lastOpp = async (kind: Kind, valgte: File[]) => {
    if (valgte.length === 0) return
    setFeil(null); setFilFeil([])
    const feilet: string[] = []
    let siste: LeveringsSvar | null = null
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
    setLaster(null); setFilFeil(feilet)
    if (!siste) await hent()
  }

  const fjern = async (kind: Kind, path: string) => {
    setFeil(null)
    try { setD(await post({ handling: 'fjern', kind, path })) }
    catch (e) { setFeil(e instanceof Error ? e.message : 'Kunne ikke fjerne') }
  }

  if (feil && !d) return <Boks tone="feil">{feil}</Boks>
  if (!d) return <p style={{ color: 'var(--text-muted)', margin: 0, fontFamily: SANS }}>Henter…</p>
  if (d.avvist) return <Boks tone="feil">Denne søknaden er avsluttet.</Boks>

  const s = d.status
  const ingenting = !s.trengerBilder && !s.trengerOpptak && !s.venterVeiledetOpptak

  return (
    <div style={{ fontFamily: SANS }}>
      {ingenting && <p style={{ color: 'var(--ink-soft)', margin: 0 }}>Vi har alt vi trenger fra deg nå.</p>}
      {s.ferdig && (s.trengerBilder || s.trengerOpptak) && (
        <Boks tone="ok"><strong>Alt som kreves er på plass.</strong> Du kan fortsatt legge til flere bilder — {ANBEFALT_BILDER} gir merkbart bedre likhet.</Boks>
      )}
      {feil && <Boks tone="feil">{feil}</Boks>}
      {filFeil.length > 0 && (
        <Boks tone="feil">
          <strong>{filFeil.length === 1 ? 'Én fil kom ikke fram:' : `${filFeil.length} filer kom ikke fram:`}</strong>
          <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>{filFeil.map((x) => <li key={x}>{x}</li>)}</ul>
        </Boks>
      )}

      {s.trengerBilder && (
        <Seksjon tittel="Bilder til ansiktsmodellen" teller={`${d.bilder.length} av minst ${d.grenser.minBilder}`} ok={s.bilderOk} kompakt={kompakt}>
          <p style={{ fontSize: 14, lineHeight: 1.55, color: 'var(--ink-soft)', margin: '0 0 12px' }}>
            Deg alene. <strong>Ulike vinkler, ulike uttrykk, ulikt lys</strong> — rett forfra, trekvart, profil; smil, alvor, latter;
            inne og ute. Tjue like passbilder gir en modell som bare kan det ene bildet. JPG, PNG eller WebP,
            maks {d.grenser.maksFilMb} MB per fil, inntil {d.grenser.maksBilder} bilder.
          </p>
          <input ref={bildeInput} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden
            onChange={(e) => { lastOpp('photo', Array.from(e.target.files || [])); e.target.value = '' }} />
          <Knapp disabled={!!laster} onClick={() => bildeInput.current?.click()}>
            {laster?.kind === 'photo' ? `Laster opp ${laster.n} av ${laster.av}…` : d.bilder.length ? 'Legg til flere bilder' : 'Velg bilder'}
          </Knapp>
          {laster?.kind === 'photo' && <Framdrift n={laster.n} av={laster.av} navn={laster.navn} />}
          {/* Identitetssjekken (102): regnes naar bildet registreres. Hun ser
              sine egne avvik, aldri hvem hun eventuelt likner paa. */}
          {d.identitet && d.bilder.length > 0 && (
            <p style={{ fontSize: 13.5, lineHeight: 1.55, margin: '12px 0 0', color: d.identitet.ok ? 'var(--ink)' : 'var(--ember-deep)' }}>
              {d.identitet.ok
                ? `✓ Alle ${d.identitet.sameCount} ansiktene ser ut som samme person.`
                : <>
                    <strong>{d.identitet.reason || 'Sjekk bildene'}.</strong>
                    {d.identitet.outliers.length > 0 && <> Skiller seg ut: {d.identitet.outliers.join(', ')} — fjern dem, eller behold hvis du er sikker på at det er deg.</>}
                    {d.identitet.noFace.length > 0 && <> Fant ikke noe ansikt i: {d.identitet.noFace.join(', ')}.</>}
                    {d.identitet.multiFace.length > 0 && <> Flere personer i: {d.identitet.multiFace.join(', ')} — vi bruker det største ansiktet.</>}
                  </>}
            </p>
          )}
          {d.bilder.length > 0 && <Liste filer={d.bilder} onFjern={(p) => fjern('photo', p)} disabled={!!laster}
            merke={(navn) => d.identitet?.outliers.includes(navn) ? 'skiller seg ut' : d.identitet?.noFace.includes(navn) ? 'ingen ansikt' : null} />}
          <p style={{ fontSize: 13, lineHeight: 1.55, color: 'var(--text-muted)', margin: '12px 0 0' }}>
            Når modellen er trent, får du den tilsendt for godkjenning: du ser tre bilder laget med den, og svarer ja eller nei.
            Den kan ikke brukes til noe før du har sagt ja.
          </p>
        </Seksjon>
      )}

      {s.trengerOpptak && (
        <Seksjon tittel="Opptaket ditt" teller={d.opptak.length ? `${d.opptak.length} ${d.opptak.length === 1 ? 'fil' : 'filer'}` : 'ingenting ennå'} ok={s.opptakOk} kompakt={kompakt}>
          <p style={{ fontSize: 14, lineHeight: 1.55, color: 'var(--ink-soft)', margin: '0 0 12px' }}>
            Rundt <strong>30 minutter ren tale</strong>, samme mikrofon og samme rom hele veien. Gjerne variert — rolig, varmt,
            med driv, dempet — ikke tretti minutter i én tone. MP3 eller M4A holder fint; er fila over {d.grenser.maksFilMb} MB,
            del den i flere. Ingen musikk under, ingen andre stemmer.
          </p>
          <input ref={lydInput} type="file" accept="audio/*" multiple hidden
            onChange={(e) => { lastOpp('recording', Array.from(e.target.files || [])); e.target.value = '' }} />
          <Knapp disabled={!!laster} onClick={() => lydInput.current?.click()}>
            {laster?.kind === 'recording' ? `Laster opp ${laster.n} av ${laster.av}…` : d.opptak.length ? 'Legg til flere filer' : 'Velg lydfil'}
          </Knapp>
          {laster?.kind === 'recording' && <Framdrift n={laster.n} av={laster.av} navn={laster.navn} />}
          {d.opptak.length > 0 && <Liste filer={d.opptak} onFjern={(p) => fjern('recording', p)} disabled={!!laster} />}
        </Seksjon>
      )}

      {s.venterVeiledetOpptak && (
        <Seksjon tittel="Opptaket" teller={onStartOpptak ? 'tar vi sammen' : 'kommer'} ok={false} noytral kompakt={kompakt}>
          <p style={{ fontSize: 14, lineHeight: 1.55, color: 'var(--ink-soft)', margin: onStartOpptak ? '0 0 12px' : 0 }}>
            {onStartOpptak
              ? 'Rundt 30 minutter med tekster å lese høyt, én om gangen, med en instruksjon over hver. Du kan ta pauser — vi husker hvor langt du er kommet. Bruk samme mikrofon og samme rom hele veien; et vanlig headset i et stille rom holder fint.'
              : 'Du sa du ville ha hjelp til opptaket. Når søknaden er gjennomgått, får du en egen lenke med tekster, nivåmåling og veiledning.'}
          </p>
          {onStartOpptak && (
            <Knapp disabled={starter} onClick={async () => { setStarter(true); try { await onStartOpptak() } finally { setStarter(false) } }}>
              {starter ? 'Åpner…' : 'Start opptaket'}
            </Knapp>
          )}
        </Seksjon>
      )}
    </div>
  )
}

function Boks({ tone, children }: { tone: 'ok' | 'feil'; children: React.ReactNode }) {
  const ok = tone === 'ok'
  return (
    <div style={{ border: `1px solid ${ok ? 'var(--ds-border-strong)' : 'var(--ember-tint-border)'}`, background: ok ? 'var(--paper-raised)' : 'var(--ember-tint-bg)', color: ok ? 'var(--ink)' : 'var(--ember-deep)', padding: '12px 14px', fontSize: 14, lineHeight: 1.5, marginBottom: 16, fontFamily: SANS }}>
      {children}
    </div>
  )
}

function Seksjon({ tittel, teller, ok, noytral, kompakt, children }: { tittel: string; teller: string; ok: boolean; noytral?: boolean; kompakt?: boolean; children: React.ReactNode }) {
  return (
    <section style={{ border: '1px solid var(--ds-border-strong)', background: 'var(--paper-raised)', padding: kompakt ? '16px 18px' : '20px 22px', marginBottom: kompakt ? 12 : 18 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, flexWrap: 'wrap', marginBottom: 10 }}>
        <h3 style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: kompakt ? 16 : 18, letterSpacing: '-0.01em', margin: 0 }}>{tittel}</h3>
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

function Liste({ filer, onFjern, disabled, merke }: { filer: Fil[]; onFjern: (p: string) => void; disabled: boolean; merke?: (navn: string) => string | null }) {
  return (
    <ul style={{ listStyle: 'none', padding: 0, margin: '14px 0 0', borderTop: '1px solid var(--ds-border)' }}>
      {filer.map((f) => {
        const navn = f.navn || f.path.split('/').pop() || f.path
        const m = merke?.(navn)
        return (
        <li key={f.path} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: '8px 0', borderBottom: '1px solid var(--ds-border)', fontSize: 13.5 }}>
          <span style={{ fontFamily: MONO, fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {navn}{m && <span style={{ marginLeft: 8, fontFamily: SANS, fontSize: 11.5, color: 'var(--ember-deep)', border: '1px solid var(--ember-tint-border)', padding: '1px 6px' }}>{m}</span>}
          </span>
          <button type="button" disabled={disabled} onClick={() => onFjern(f.path)}
            style={{ background: 'none', border: 'none', color: 'var(--ember-deep)', cursor: disabled ? 'default' : 'pointer', fontSize: 13, fontFamily: SANS, padding: 0 }}>
            Fjern
          </button>
        </li>
        )
      })}
    </ul>
  )
}
