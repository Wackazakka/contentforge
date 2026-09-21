'use client'

import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Opptaker, { type OpptakResultat } from '@/components/Opptaker'
import type { Register } from '@/lib/stemmeopptak'

// Skuespillerens opptaksløype for en proffklone (migrasjon 095).
//
// 🔑 ÉN TEKST OM GANGEN, OG VI VELGER DEN. Hun skal ikke måtte styre
// fordelingen mellom registre selv — det er en teknisk avveining hun ikke har
// grunnlag for å ta, og resultatet ville blitt en halvtime nøytral opplesning
// fordi det er lettest. Programmet peker på det som mangler mest.
//
// 🔑 FREMDRIFTEN VISES PER REGISTER, IKKE SOM ÉN TELLER. «41 av 30 minutter»
// ville sagt at hun var ferdig når hun ikke var det. Hun skal se hvilken
// tone som mangler.
//
// Hun har ingen konto. Lenken er autentiseringen.

const DISPLAY = 'var(--font-archivo), system-ui, sans-serif'
const SANS = 'var(--font-hanken), system-ui, sans-serif'
const MONO = 'var(--font-cfmono), ui-monospace, monospace'

interface Oppgave { register: Register; instruks: string; indeks: number; tekst: string }
interface Rad { register: Register; sek: number; maalSek: number; dekket: boolean }
interface Fremdrift { per: Rad[]; totaltSek: number; maalSek: number; ferdig: boolean }

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`

export default function OpptakPage() {
  const token = String(useParams().token || '')
  const [oppgave, setOppgave] = useState<Oppgave | null>(null)
  const [fremdrift, setFremdrift] = useState<Fremdrift | null>(null)
  const [deviceId, setDeviceId] = useState<string | null>(null)
  const [feil, setFeil] = useState<string | null>(null)
  const [lagrer, setLagrer] = useState(false)

  const hent = useCallback(async () => {
    try {
      const d = await fetch(`/api/stemmeopptak?token=${encodeURIComponent(token)}`).then((r) => r.json())
      if (d.error) { setFeil(d.error); return }
      setOppgave(d.oppgave); setFremdrift(d.fremdrift); setDeviceId(d.deviceId ?? null)
    } catch { setFeil('Kunne ikke hente økta') }
  }, [token])

  useEffect(() => { hent() }, [hent])

  const lagre = async (r: OpptakResultat) => {
    if (!oppgave) return
    setLagrer(true); setFeil(null)
    try {
      const l = await fetch('/api/stemmeopptak', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, handling: 'opplastingslenke' }),
      }).then((x) => x.json())
      if (!l.uploadUrl) throw new Error(l.error || 'Fikk ikke opplastingslenke')

      const put = await fetch(l.uploadUrl, { method: 'PUT', body: r.blob })
      if (!put.ok) throw new Error(`Opplasting feilet (${put.status})`)

      const d = await fetch('/api/stemmeopptak', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token, register: oppgave.register, tekstIndeks: oppgave.indeks, path: l.path,
          sekunder: r.sekunder, rmsDb: r.rmsDb, peakDb: r.peakDb, stoeygulvDb: r.stoeygulvDb,
          deviceId: r.deviceId,
        }),
      }).then((x) => x.json())
      if (d.error) throw new Error(d.error)
      await hent()
    } catch (e: any) {
      setFeil(e.message)
    } finally {
      setLagrer(false)
    }
  }

  const ramme = { maxWidth: 760, margin: '0 auto', padding: 'clamp(28px, 5vw, 56px) 20px' }

  if (feil && !oppgave) {
    return <div style={{ minHeight: '100vh', background: 'var(--paper)', fontFamily: SANS }}><div style={ramme}><p>{feil}</p></div></div>
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--paper)', color: 'var(--ink)', fontFamily: SANS }}>
      <div style={ramme}>
        <h1 style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 'clamp(26px, 4vw, 40px)', letterSpacing: '-0.03em', margin: '0 0 10px' }}>
          Stemmen din
        </h1>

        {fremdrift?.ferdig ? (
          <p style={{ fontSize: 17, lineHeight: 1.6 }}>
            Takk — du har lest nok i alle tonene. Vi går gjennom opptakene og sier fra
            hvis noe må tas om igjen. Du trenger ikke gjøre mer nå.
          </p>
        ) : (
          <>
            <p style={{ fontSize: 16, lineHeight: 1.6, color: 'var(--ink-soft)', margin: '0 0 6px' }}>
              Les tekstene høyt, én om gangen. Du kan ta pause og komme tilbake til
              denne siden når som helst — vi husker hvor langt du er kommet.
            </p>
            <p style={{ fontSize: 14.5, lineHeight: 1.6, color: 'var(--text-muted)', margin: '0 0 28px' }}>
              Bruk <strong>samme mikrofon og samme rom</strong> hele veien. Det betyr mer
              for resultatet enn hvor godt utstyret er.
            </p>

            {fremdrift && <Fremdriftsvisning f={fremdrift} />}

            {oppgave && (
              <div style={{ margin: '28px 0 20px', border: '1px solid var(--ds-border-strong)', background: 'var(--paper-raised)' }}>
                <p style={{
                  margin: 0, padding: '12px 18px', background: 'var(--band, #F3EFE7)',
                  borderBottom: '1px solid var(--ds-border-strong)',
                  fontFamily: MONO, fontSize: 11.5, letterSpacing: '0.1em', textTransform: 'uppercase',
                }}>
                  {oppgave.register}
                </p>
                <p style={{ margin: 0, padding: '14px 18px 0', fontSize: 15.5, fontWeight: 600 }}>
                  {oppgave.instruks}
                </p>
                <p style={{ margin: 0, padding: '12px 18px 20px', fontSize: 19, lineHeight: 1.65 }}>
                  {oppgave.tekst}
                </p>
              </div>
            )}

            <Opptaker onFerdig={lagre} laastDeviceId={deviceId} disabled={lagrer || !oppgave} />
            {lagrer && <p style={{ fontSize: 14, color: 'var(--text-muted)' }}>Lagrer opptaket…</p>}
            {feil && <p style={{ fontSize: 14, color: 'var(--ember-deep)' }}>{feil}</p>}
          </>
        )}
      </div>
    </div>
  )
}

function Fremdriftsvisning({ f }: { f: Fremdrift }) {
  return (
    <div style={{ border: '1px solid var(--ds-border-strong)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', borderBottom: '1px solid var(--ds-border-strong)', background: 'var(--paper-raised)' }}>
        <span style={{ fontFamily: MONO, fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-faint)' }}>
          Samlet
        </span>
        <span style={{ fontFamily: MONO, fontSize: 13, fontVariantNumeric: 'tabular-nums' }}>
          {mmss(f.totaltSek)} / {mmss(f.maalSek)}
        </span>
      </div>
      {f.per.map((r) => (
        <div key={r.register} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '7px 14px', borderTop: '1px solid var(--ds-border-faint, #EFE7D8)' }}>
          <span style={{ flex: '0 0 96px', fontSize: 13.5, color: r.dekket ? 'var(--text-muted)' : 'var(--ink)' }}>{r.register}</span>
          <span style={{ flex: 1, height: 6, background: 'var(--paper-sunken, #EFEBE3)', position: 'relative' }}>
            <span style={{
              position: 'absolute', left: 0, top: 0, bottom: 0,
              width: `${Math.min(100, (r.sek / r.maalSek) * 100)}%`,
              background: r.dekket ? 'var(--ink)' : 'var(--ember-deep)', opacity: r.dekket ? 0.35 : 1,
            }} />
          </span>
          <span style={{ flex: '0 0 74px', textAlign: 'right', fontFamily: MONO, fontSize: 11.5, fontVariantNumeric: 'tabular-nums', color: 'var(--text-muted)' }}>
            {mmss(r.sek)}/{mmss(r.maalSek)}
          </span>
        </div>
      ))}
    </div>
  )
}
