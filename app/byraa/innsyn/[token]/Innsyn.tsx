'use client'

import { useEffect, useState } from 'react'

// Byråets innsynsside (127). Norsk alene, som innsigelsessida: byråene er norske.
//
// Grunnlinjen — når tvillingen ble brukt, hva slags bruk, under hvilken lisens
// og hva klienten fikk — ser klienten alltid. Det byrået velger, er hvor mye
// MER: navnet på produksjonen, teksten, og selve resultatet.

type Nivaa = 'production' | 'script' | 'full'
interface Lisens {
  id: string; kind: 'campaign' | 'work'; assetType: string; status: string
  workTitle: string | null; customer: string | null; mediaClass: string | null; territory: string | null
  termStart: string | null; termEnd: string | null; insight: Nivaa
}
interface Svar { agency: { name: string; defaultActorInsight: Nivaa }; clients: Array<{ id: string; name: string; licences: Lisens[] }> }

const NIVAA: Array<{ v: Nivaa; navn: string; forklaring: string }> = [
  { v: 'full', navn: 'Alt, også resultatet', forklaring: 'Navnet på produksjonen, teksten som ble lest og selve lyden, bildet eller filmen.' },
  { v: 'script', navn: 'Produksjonen og teksten', forklaring: 'Navnet på produksjonen og teksten, men ikke resultatet.' },
  { v: 'production', navn: 'Bare navnet på produksjonen', forklaring: 'Hvilken produksjon tvillingen ble brukt i, uten tekst eller resultat.' },
]
const navn = (v: string) => NIVAA.find((n) => n.v === v)?.navn ?? v
const STATUS: Record<string, string> = { quote: 'tilbud', active: 'aktiv', expired: 'utløpt' }
const SORT: Record<string, string> = { voice: 'stemme', face: 'ansikt', both: 'stemme og ansikt' }
const dato = (s: string | null) => (s ? new Date(s).toLocaleDateString('nb-NO', { day: 'numeric', month: 'short', year: 'numeric' }) : '')

export default function Innsyn({ token }: { token: string }) {
  const [svar, setSvar] = useState<Svar | null>(null)
  const [tilstand, setTilstand] = useState<'laster' | 'klar' | 'ukjent'>('laster')
  const [lagrer, setLagrer] = useState(false)
  const [feil, setFeil] = useState<string | null>(null)
  const [lagret, setLagret] = useState(false)

  useEffect(() => {
    fetch(`/api/byraa/innsyn?token=${encodeURIComponent(token)}`)
      .then(async (r) => (r.ok ? (setSvar(await r.json()), setTilstand('klar')) : setTilstand('ukjent')))
      .catch(() => setTilstand('ukjent'))
  }, [token])

  const send = async (felt: Record<string, unknown>, sporsmaal?: string) => {
    if (sporsmaal && !window.confirm(sporsmaal)) return
    setLagrer(true); setFeil(null); setLagret(false)
    try {
      const r = await fetch('/api/byraa/innsyn', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, ...felt }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(j.error || 'Noe gikk galt')
      setSvar(j); setLagret(true); setTimeout(() => setLagret(false), 2000)
    } catch (e) {
      setFeil(e instanceof Error ? e.message : 'Noe gikk galt')
    } finally { setLagrer(false) }
  }

  const h1: React.CSSProperties = { fontSize: 26, fontWeight: 800, letterSpacing: '-0.02em', margin: '0 0 12px' }
  const p: React.CSSProperties = { fontSize: 15, lineHeight: 1.55, color: 'var(--ink-soft)', margin: '0 0 16px' }
  const kort: React.CSSProperties = { background: 'var(--paper-raised, #fff)', border: '1px solid rgba(0,0,0,0.1)', borderRadius: 10, padding: 16, marginBottom: 12 }
  const velg: React.CSSProperties = { padding: '6px 8px', border: '1px solid rgba(0,0,0,0.2)', borderRadius: 8, fontSize: 14, background: 'var(--paper)', color: 'var(--ink)', maxWidth: '100%' }

  if (tilstand === 'laster') return <p style={p}>Henter …</p>
  if (tilstand === 'ukjent' || !svar) {
    return (<><h1 style={h1}>Lenken virker ikke</h1><p style={p}>Lenken er ukjent, eller den er byttet ut med en ny. Be TwinLedger om den gjeldende lenken.</p></>)
  }

  const lisenser = svar.clients.reduce((n, c) => n + c.licences.length, 0)

  return (
    <>
      <h1 style={h1}>Hva klientene til {svar.agency.name} ser</h1>
      <p style={p}>
        Hver gang stemmen eller ansiktet til en klient brukes, føres det i hovedboken deres: når, hva slags bruk, under hvilken lisens og hva de fikk betalt.
        Det ser de alltid. Her bestemmer dere hvor mye mer de skal se.
      </p>
      <ul style={{ ...p, paddingLeft: 20 }}>
        {NIVAA.map((n) => <li key={n.v} style={{ marginBottom: 4 }}><strong>{n.navn}:</strong> {n.forklaring}</li>)}
      </ul>

      <div style={kort}>
        <label style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, fontSize: 15 }}>
          <strong>Standard for nye lisenser:</strong>
          <select value={svar.agency.defaultActorInsight} disabled={lagrer} style={velg}
            onChange={(e) => send({ defaultInsight: e.target.value })}>
            {NIVAA.map((n) => <option key={n.v} value={n.v}>{n.navn}</option>)}
          </select>
        </label>
        <p style={{ ...p, fontSize: 13, margin: '8px 0 0' }}>Gjelder også bruk som ikke hører til noen lisens, for eksempel når en kunde prøvelytter stemmen.</p>
        {lisenser > 0 && (
          <button disabled={lagrer}
            onClick={() => send({ allInsight: svar.agency.defaultActorInsight }, `Sette «${navn(svar.agency.defaultActorInsight)}» på alle ${lisenser} lisensene?`)}
            style={{ marginTop: 12, background: 'transparent', color: 'var(--ink)', border: '1px solid rgba(0,0,0,0.25)', borderRadius: 8, padding: '8px 14px', fontSize: 14, fontWeight: 600, cursor: 'pointer', opacity: lagrer ? 0.6 : 1 }}>
            Bruk standarden på alle lisensene
          </button>
        )}
      </div>

      {feil && <p style={{ ...p, color: '#B42318' }}>{feil}</p>}
      {lagret && <p style={{ ...p, color: 'var(--ink)' }}>Lagret.</p>}

      {svar.clients.length === 0 && <p style={p}>Ingen klienter er kommet inn gjennom påmeldingslenken deres ennå.</p>}

      {svar.clients.map((c) => (
        <div key={c.id} style={{ marginTop: 24 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 8px' }}>{c.name}</h2>
          {c.licences.length === 0 && <p style={{ ...p, fontSize: 14 }}>Ingen lisenser ennå. Når en kommer, får den standarden over.</p>}
          {c.licences.map((l) => (
            <div key={l.id} style={kort}>
              <div style={{ fontWeight: 600 }}>
                {l.kind === 'work' ? (l.workTitle || 'Verk') : 'Kampanje'}
                <span style={{ fontWeight: 400, fontSize: 13, color: 'var(--ink-soft)' }}> · {SORT[l.assetType] ?? l.assetType} · {STATUS[l.status] ?? l.status}</span>
              </div>
              <div style={{ fontSize: 13, color: 'var(--ink-soft)', margin: '2px 0 10px' }}>
                {[l.customer, l.kind === 'campaign' && l.termStart ? `${dato(l.termStart)}–${l.termEnd ? dato(l.termEnd) : 'uten slutt'}` : null].filter(Boolean).join(' · ')}
              </div>
              <label style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, fontSize: 14 }}>
                Klienten ser:
                <select value={l.insight} disabled={lagrer} style={velg} onChange={(e) => send({ licenceId: l.id, insight: e.target.value })}>
                  {NIVAA.map((n) => <option key={n.v} value={n.v}>{n.navn}</option>)}
                </select>
              </label>
            </div>
          ))}
        </div>
      ))}

      <p style={{ ...p, fontSize: 13, marginTop: 28 }}>
        Endringer gjelder med en gang, også for bruk som alt er ført. Lenken er tilgangen deres: del den bare med dem i byrået som skal styre dette.
      </p>
    </>
  )
}
