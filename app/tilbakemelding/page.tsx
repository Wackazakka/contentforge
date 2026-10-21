'use client'

import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { getSupabase } from '@/lib/supabaseClient'
import { useTenant } from '@/lib/tenantContext'
import { produktnavn } from '@/lib/tenantNames'
import { AuthShell, AuthSubmit, AuthBanner, emberLink } from '@/components/AuthUI'
import { SEKSJONER, fikkVideo, validerSvar, type Svar, type Sporsmal } from '@/lib/tilbakemelding'

// Tilbakemeldingsskjemaet for PromoMaker-testerne (migrasjon 108, Lars 21.10).
// Bonusregelen og spørsmålene bor i lib/tilbakemelding.ts.

const HANKEN = 'var(--font-hanken), sans-serif'
const tekstStil: CSSProperties = { fontFamily: HANKEN, fontSize: 14.5, color: 'var(--ink)', lineHeight: 1.5 }
const hintStil: CSSProperties = { fontFamily: HANKEN, fontSize: 12.5, color: 'var(--text-faint)', margin: '4px 0 0' }
const kreditt = (n: number) => Math.round(n).toLocaleString('nb-NO')

type Status = {
  aktiv: boolean
  saldoKreditter: number | null
  svar: Svar | null
  sistSendt: string | null
  bonus: { tilbys: boolean; gitt: boolean; fristUte: boolean; grense: number; kreditter: number; fristTekst: string }
}

function Valg({ type, valgt, onClick, children }: { type: 'radio' | 'checkbox'; valgt: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      role={type}
      aria-checked={valgt}
      onClick={onClick}
      style={{
        ...tekstStil, display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left',
        padding: '10px 12px', marginTop: 6, borderRadius: 10, cursor: 'pointer',
        border: `1px solid ${valgt ? 'var(--ember-deep)' : 'var(--ds-border, rgba(127,127,127,0.35))'}`,
        background: valgt ? 'var(--ember-tint-bg)' : 'transparent',
      }}
    >
      <span aria-hidden style={{
        width: 16, height: 16, flexShrink: 0, borderRadius: type === 'radio' ? 999 : 4,
        border: `2px solid ${valgt ? 'var(--ember-deep)' : 'var(--text-faint)'}`,
        background: valgt ? 'var(--ember-deep)' : 'transparent',
      }} />
      {children}
    </button>
  )
}

export default function TilbakemeldingPage() {
  const tenant = useTenant()
  const produkt = produktnavn(tenant) || 'PromoMaker'
  const [status, setStatus] = useState<Status | null>(null)
  const [innlogget, setInnlogget] = useState<boolean | null>(null)
  const [svar, setSvar] = useState<Svar>({})
  const [mangler, setMangler] = useState<string[]>([])
  const [sender, setSender] = useState(false)
  const [resultat, setResultat] = useState<{ bonusGitt: boolean; saldoKreditter: number | null } | null>(null)
  const [feil, setFeil] = useState<string | null>(null)
  const refs = useRef<Record<string, HTMLDivElement | null>>({})

  const token = async () => (await getSupabase().auth.getSession()).data?.session?.access_token || null

  useEffect(() => {
    ;(async () => {
      const t = await token()
      if (!t) { setInnlogget(false); return }
      setInnlogget(true)
      const d = await fetch('/api/tilbakemelding', { headers: { Authorization: `Bearer ${t}` } }).then((r) => r.json()).catch(() => null)
      if (d) { setStatus(d); if (d.svar) setSvar(d.svar) }
    })()
  }, [])

  const sett = (id: string, verdi: Svar[string]) => {
    setSvar((s) => ({ ...s, [id]: verdi }))
    setMangler((m) => m.filter((x) => x !== id))
  }

  const sendInn = async (e: React.FormEvent) => {
    e.preventDefault()
    setFeil(null)
    const { mangler: m } = validerSvar(svar)
    if (m.length) {
      setMangler(m)
      refs.current[m[0]]?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      return
    }
    setSender(true)
    try {
      const t = await token()
      const res = await fetch('/api/tilbakemelding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}) },
        body: JSON.stringify({ svar }),
      })
      const d = await res.json().catch(() => null)
      if (!res.ok) {
        if (d?.mangler?.length) { setMangler(d.mangler); refs.current[d.mangler[0]]?.scrollIntoView({ behavior: 'smooth', block: 'center' }) }
        else setFeil(d?.error || 'Noe gikk galt. Prøv igjen.')
        return
      }
      setResultat({ bonusGitt: !!d.bonusGitt, saldoKreditter: d.saldoKreditter ?? null })
      setStatus((s) => (s ? { ...s, saldoKreditter: d.saldoKreditter ?? s.saldoKreditter, bonus: { ...s.bonus, gitt: s.bonus.gitt || !!d.bonusGitt } } : s))
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch {
      setFeil('Noe gikk galt. Prøv igjen.')
    } finally {
      setSender(false)
    }
  }

  if (innlogget === false) {
    return (
      <AuthShell title="Tilbakemelding" subtitle={`Logg inn på ${produkt} for å svare.`}>
        <a href="/login?next=/tilbakemelding" style={emberLink}>Gå til innlogging →</a>
      </AuthShell>
    )
  }
  if (status && !status.aktiv) {
    return <AuthShell title="Tilbakemelding" subtitle="Skjemaet er ikke tilgjengelig her."><span /></AuthShell>
  }

  const b = status?.bonus
  const saldo = status?.saldoKreditter
  const video = fikkVideo(svar)

  const sporsmalUI = (s: Sporsmal) => {
    const markert = mangler.includes(s.id)
    const kreves = 'kreves' in s && (s.kreves === true || (s.kreves === 'hvisVideo' && video))
    return (
      <div key={s.id} ref={(el) => { refs.current[s.id] = el }} style={{ marginBottom: 22, scrollMarginTop: 90 }}>
        <p style={{ ...tekstStil, fontWeight: 600, margin: 0 }}>
          {s.tekst}{!kreves && s.type !== 'feil' ? <span style={{ fontWeight: 400, color: 'var(--text-faint)' }}> (valgfritt)</span> : null}
        </p>
        {'hint' in s && s.hint ? <p style={hintStil}>{s.hint}</p> : null}
        {markert ? <p style={{ ...hintStil, color: 'var(--ember-deep)', fontWeight: 600 }}>Svar på dette spørsmålet</p> : null}

        {s.type === 'ett' && s.valg.map((v) => (
          <Valg key={v} type="radio" valgt={svar[s.id] === v} onClick={() => sett(s.id, v)}>{v}</Valg>
        ))}

        {s.type === 'flere' && (
          <>
            {s.valg.map((v) => {
              const liste = (svar[s.id] as string[] | undefined) || []
              const valgt = liste.includes(v)
              return (
                <Valg key={v} type="checkbox" valgt={valgt} onClick={() => sett(s.id, valgt ? liste.filter((x) => x !== v) : [...liste, v])}>{v}</Valg>
              )
            })}
            {s.annet && (
              <input
                className="cf-input"
                style={{ marginTop: 8 }}
                placeholder="Annet: skriv her"
                value={String(svar[`${s.id}_annet`] ?? '')}
                onChange={(e) => sett(`${s.id}_annet`, e.target.value)}
              />
            )}
          </>
        )}

        {s.type === 'skala' && (
          <div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
              {Array.from({ length: s.til - s.fra + 1 }, (_, i) => s.fra + i).map((n) => {
                const valgt = svar[s.id] === n
                return (
                  <button
                    key={n}
                    type="button"
                    aria-pressed={valgt}
                    onClick={() => sett(s.id, n)}
                    style={{
                      ...tekstStil, minWidth: 40, height: 40, borderRadius: 10, cursor: 'pointer', fontWeight: 600,
                      border: `1px solid ${valgt ? 'var(--ember-deep)' : 'var(--ds-border, rgba(127,127,127,0.35))'}`,
                      background: valgt ? 'var(--ember-deep)' : 'transparent',
                      color: valgt ? 'var(--on-ember, #fff)' : 'var(--ink)',
                    }}
                  >
                    {n}
                  </button>
                )
              })}
            </div>
            <div style={{ ...hintStil, display: 'flex', justifyContent: 'space-between', maxWidth: (s.til - s.fra + 1) * 46 }}>
              <span>{s.fra} = {s.lav}</span><span>{s.til} = {s.hoy}</span>
            </div>
          </div>
        )}

        {s.type === 'tekst' && (
          <textarea
            className="cf-input"
            rows={3}
            style={{ marginTop: 8, resize: 'vertical' }}
            value={String(svar[s.id] ?? '')}
            onChange={(e) => sett(s.id, e.target.value)}
          />
        )}

        {s.type === 'feil' && (() => {
          const f = (svar[s.id] as { ja: boolean; beskrivelse?: string } | undefined)
          return (
            <>
              <Valg type="radio" valgt={f?.ja === false} onClick={() => sett(s.id, { ja: false })}>Nei</Valg>
              <Valg type="radio" valgt={f?.ja === true} onClick={() => sett(s.id, { ja: true, beskrivelse: f?.beskrivelse || '' })}>Ja</Valg>
              {f?.ja && (
                <textarea
                  className="cf-input"
                  rows={3}
                  style={{ marginTop: 8, resize: 'vertical' }}
                  placeholder="Beskriv hva som skjedde, og omtrent når."
                  value={f.beskrivelse || ''}
                  onChange={(e) => sett(s.id, { ja: true, beskrivelse: e.target.value })}
                />
              )}
            </>
          )
        })()}
      </div>
    )
  }

  return (
    <AuthShell title="Hvordan gikk det?" subtitle={`11 korte spørsmål om ${produkt}. Tar 3–4 minutter.`} maxWidth={640}>
      {resultat && (
        <AuthBanner variant="success">
          {resultat.bonusGitt
            ? <>Takk for svaret! <strong>{kreditt(b?.kreditter || 0)} nye kreditter</strong> er lagt til{resultat.saldoKreditter !== null ? <>, og du har nå {kreditt(resultat.saldoKreditter)}</> : null}.</>
            : <>Takk for svaret! Du kan endre det og sende inn på nytt når du vil.</>}
        </AuthBanner>
      )}
      {feil && <AuthBanner variant="error">{feil}</AuthBanner>}

      {b?.tilbys && (
        <div style={{ ...tekstStil, padding: '12px 14px', borderRadius: 11, marginBottom: 22, background: 'var(--ember-tint-bg)', border: '1px solid var(--ember-tint-border, transparent)' }}>
          {b.gitt ? (
            <>🎁 Du har fått bonusen på {kreditt(b.kreditter)} kreditter. Takk!</>
          ) : b.fristUte ? (
            <>Bonusperioden er over, men vi setter like stor pris på svaret ditt.</>
          ) : saldo !== null && saldo !== undefined && saldo < b.grense ? (
            <>🎁 Du har {kreditt(saldo)} kreditter igjen. Send inn skjemaet, så får du <strong>{kreditt(b.kreditter)} nye med en gang</strong>.</>
          ) : (
            <>🎁 Har du under {kreditt(b.grense)} kreditter igjen når du sender inn, får du {kreditt(b.kreditter)} nye med en gang (til og med {b.fristTekst}).
              {saldo !== null && saldo !== undefined ? <> Du har {kreditt(saldo)} igjen nå.</> : null} Du kan godt svare nå og sende inn på nytt senere. Bonusen kommer første gang du har under {kreditt(b.grense)}.</>
          )}
          <p style={{ ...hintStil, marginTop: 8 }}>Bonusen avhenger bare av at du svarer, ikke av hva du svarer. Vær gjerne ærlig, det er det vi trenger.</p>
        </div>
      )}

      <form onSubmit={sendInn}>
        {SEKSJONER.map((sek) => (
          <section key={sek.tittel} style={{ marginBottom: 8 }}>
            <h2 style={{ fontFamily: HANKEN, fontSize: 17, fontWeight: 700, color: 'var(--ink)', margin: '8px 0 14px' }}>{sek.tittel}</h2>
            {sek.sporsmal.map(sporsmalUI)}
          </section>
        ))}
        {mangler.length > 0 && <AuthBanner variant="error">Noen spørsmål mangler svar. De er markert over.</AuthBanner>}
        <AuthSubmit loading={sender} loadingLabel="Sender…">{status?.sistSendt ? 'Send inn på nytt' : 'Send inn'}</AuthSubmit>
      </form>
    </AuthShell>
  )
}
