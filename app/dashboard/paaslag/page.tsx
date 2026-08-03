'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { getSupabase } from '@/lib/supabaseClient'
import { COSTS_NOK, fmtNok } from '@/lib/costs'

// Partnerens eget påslag (Lars 3/8). Prosent, ikke kroner — ContentForge kan
// endre innprisen når som helst, og da skal påslaget følge med av seg selv i
// stedet for å bli et tall som stille blir feil.
//
// Eksempelet under regner likevel om til kroner mens du skriver, for «200 %»
// sier ingenting før man ser hva artisten faktisk betaler.

// Typisk 20-sekunders promo: 4 animerte scener + 4 innlesninger
const EKSEMPEL_INNPRIS = COSTS_NOK.animate5s * 4 + COSTS_NOK.voiceoverPreview * 4

export default function PaaslagPage() {
  const [navn, setNavn] = useState<string>('')
  const [verdi, setVerdi] = useState<string>('')
  const [lagret, setLagret] = useState<number | null>(null)
  // Rot-leddet setter VAART paaslag paa raakosten (= innprisen til partnerne),
  // partnerne setter sitt eget paa toppen av innprisen (Lars 3/8)
  const [erPlattform, setErPlattform] = useState(false)
  const [laster, setLaster] = useState(true)
  const [lagrer, setLagrer] = useState(false)
  const [feil, setFeil] = useState<string | null>(null)
  const [kvittering, setKvittering] = useState(false)

  const token = async () => (await getSupabase().auth.getSession()).data.session?.access_token || ''

  useEffect(() => {
    ;(async () => {
      try {
        const res = await fetch('/api/my-markup', { headers: { Authorization: `Bearer ${await token()}` } })
        const d = await res.json()
        if (!res.ok) throw new Error(d.error || 'Kunne ikke hente påslaget')
        setNavn(d.navn || '')
        setErPlattform(d.erPlattform === true)
        setVerdi(String(d.markupPercent))
        setLagret(Number(d.markupPercent))
      } catch (err) {
        setFeil(err instanceof Error ? err.message : 'Noe gikk galt')
      } finally {
        setLaster(false)
      }
    })()
  }, [])

  const lagre = async () => {
    setLagrer(true); setFeil(null); setKvittering(false)
    try {
      const res = await fetch('/api/my-markup', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await token()}` },
        body: JSON.stringify({ markupPercent: Number(verdi) }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'Lagring feilet')
      setLagret(Number(d.markupPercent))
      setVerdi(String(d.markupPercent))
      setKvittering(true)
    } catch (err) {
      setFeil(err instanceof Error ? err.message : 'Lagring feilet')
    } finally {
      setLagrer(false)
    }
  }

  const tall = Number(verdi)
  const gyldig = Number.isFinite(tall) && tall >= 0 && tall <= 500
  // COSTS_NOK er raakost x 2, saa raakosten er halvparten
  const RAAKOST = EKSEMPEL_INNPRIS / 2
  const grunnlag = erPlattform ? RAAKOST : EKSEMPEL_INNPRIS
  const utpris = gyldig ? grunnlag * (1 + tall / 100) : 0
  const margin = utpris - grunnlag
  const endret = lagret !== null && gyldig && tall !== lagret

  return (
    <div className="min-h-screen bg-[var(--paper)]">
      <div className="max-w-2xl mx-auto px-4 sm:px-8 py-10">
        <Link href="/dashboard" className="text-[13px] text-gray-500 hover:text-[var(--ink)]">
          ← Tilbake til oversikten
        </Link>
        <h1 className="mt-4 text-3xl font-bold text-gray-900">
          {erPlattform ? 'Vårt påslag' : 'Påslaget deres'}
        </h1>
        <p className="mt-2 text-[15px] text-gray-500 max-w-[60ch]">
          {erPlattform
            ? 'Påslaget vi tar på råkosten. Det setter innprisen alle partnere faktureres. Partnernes egne påslag står urørt — de regnes av innprisen, så kundeprisene følger etter av seg selv.'
            : 'Hva kundene deres betaler over innprisen. Innprisen er den samme uansett hva dere velger — påslaget er deres egen fortjeneste, og deres beslutning.'}
        </p>

        {laster && (
          <div className="mt-8 flex justify-center">
            <div className="w-7 h-7 border-4 border-[var(--ember-deep)] border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {feil && !laster && (
          <div className="mt-6 bg-white border border-red-200 rounded-2xl p-4 text-red-700 text-sm">{feil}</div>
        )}

        {!laster && lagret !== null && (
          <>
            <div className="mt-6 bg-white rounded-2xl border border-gray-200 px-5 py-5">
              {navn && <p className="text-[12px] uppercase tracking-widest text-gray-400 mb-3">{navn}</p>}
              <label className="block text-sm font-medium text-gray-700 mb-1">Påslag i prosent</label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={0}
                  max={500}
                  step={5}
                  value={verdi}
                  onChange={(e) => setVerdi(e.target.value)}
                  className="w-32 px-3 py-2 border border-gray-300 rounded-lg text-lg tabular-nums focus:outline-none focus:ring-2 focus:ring-[var(--ember-deep)]"
                />
                <span className="text-gray-500">%</span>
              </div>
              {!gyldig && verdi !== '' && (
                <p className="mt-2 text-[12.5px] text-red-600">
                  Må være mellom 0 og 500. Under 0 ville dere solgt med tap.
                </p>
              )}

              {/* Prosent er tallet som lagres, men ingen forstår prosent uten
                  et beløp ved siden av */}
              <div className="mt-4 rounded-xl bg-gray-50 border border-gray-100 px-4 py-3 text-[13.5px]">
                <p className="text-gray-500 mb-2">
                  En vanlig promovideo — 20 sekunder, fire animerte scener med tale:
                </p>
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-gray-600">{erPlattform ? 'Vår råkost' : 'Innprisen deres'}</span>
                  <span className="tabular-nums text-gray-900">{fmtNok(grunnlag)}</span>
                </div>
                <div className="flex items-baseline justify-between gap-3 mt-1">
                  <span className="text-gray-600">{erPlattform ? 'Innpris til partnerne' : 'Kunden betaler'}</span>
                  <span className="tabular-nums font-semibold text-gray-900">{gyldig ? fmtNok(utpris) : '—'}</span>
                </div>
                <div className="flex items-baseline justify-between gap-3 mt-1 pt-2 border-t border-gray-200">
                  <span className="text-[var(--ember-deep)]">{erPlattform ? 'Vi sitter igjen med' : 'Dere sitter igjen med'}</span>
                  <span className="tabular-nums font-semibold text-[var(--ember-deep)]">{gyldig ? fmtNok(margin) : '—'}</span>
                </div>
                {gyldig && tall === 0 && (
                  <p className="mt-2 text-[12.5px] text-gray-500">
                    Med 0 % selger dere til innpris. Da tjener dere ingenting på produksjonene —
                    det kan være et bevisst valg hvis dere tjener pengene et annet sted.
                  </p>
                )}
              </div>

              <button
                type="button"
                onClick={lagre}
                disabled={!endret || lagrer}
                className="mt-4 w-full px-4 py-2.5 rounded-lg bg-[var(--ember-deep)] text-white font-medium disabled:opacity-40"
              >
                {lagrer ? 'Lagrer…' : endret ? 'Lagre påslaget' : 'Lagret'}
              </button>
              {kvittering && (
                <p className="mt-2 text-[13px] text-green-700">
                  ✅ Lagret. Nye priser gjelder fra neste produksjon — det som allerede er kjørt,
                  beholder prisen det ble kjørt til.
                </p>
              )}
            </div>

            <p className="mt-4 text-[12.5px] text-gray-400 leading-relaxed">
              Vi oppgir påslaget i prosent, ikke kroner, fordi innprisen kan endre seg.
              Da følger påslaget med av seg selv i stedet for å bli stående som et beløp som stille blir feil.
              Hva dere faktisk har tjent, står på <Link href="/dashboard/avregning" className="underline">avregningssiden</Link>.
            </p>
          </>
        )}
      </div>
    </div>
  )
}
