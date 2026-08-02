'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { getSupabase } from '@/lib/supabaseClient'
import { fmtNok } from '@/lib/costs'

// Avregning (Lars 1/8): hva er opptjent i en periode, og hvor mye skal
// white-labelen ha? Følger FORBRUK, ikke kredittsalg — en artist som kjøper i
// januar og produserer i mars, tjenes inn i mars, for det er da kostnadene
// påløper. Hvert ledd ser sin egen avregning.

interface Avregning {
  tenant: { id: string; navn: string }
  periode: { fra: string; til: string }
  antallHendelser: number
  omsetningNok: number
  tilContentForgeNok: number
  tilWhiteLabelNok: number
  perType: Record<string, { antall: number; omsetning: number; engros: number }>
}

const TYPE_NAVN: Record<string, string> = {
  video_production: 'Videoproduksjoner',
  image: 'Bilder',
  voiceover: 'Stemmer',
  avatar: 'Avatar-videoer',
  radio: 'Radiospoter',
  animation: 'Animasjoner (forhåndsvisning)',
}

function maanedStart(d: Date) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1))
}

export default function AvregningPage() {
  const [data, setData] = useState<Avregning | null>(null)
  const [laster, setLaster] = useState(true)
  const [feil, setFeil] = useState<string | null>(null)
  // Månedsvelger: 0 = inneværende, 1 = forrige, …
  const [maanedTilbake, setMaanedTilbake] = useState(0)

  const hent = async (tilbake: number) => {
    setLaster(true)
    setFeil(null)
    try {
      const { data: sess } = await getSupabase().auth.getSession()
      const token = sess?.session?.access_token
      if (!token) throw new Error('Du må være innlogget')
      const naa = new Date()
      const fra = maanedStart(new Date(Date.UTC(naa.getUTCFullYear(), naa.getUTCMonth() - tilbake, 1)))
      const til = tilbake === 0
        ? new Date()
        : new Date(Date.UTC(fra.getUTCFullYear(), fra.getUTCMonth() + 1, 1) - 1)
      const res = await fetch(`/api/settlement?fra=${fra.toISOString()}&til=${til.toISOString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'Kunne ikke hente avregningen')
      setData(d)
    } catch (err) {
      setFeil(err instanceof Error ? err.message : 'Noe gikk galt')
    } finally {
      setLaster(false)
    }
  }

  useEffect(() => { hent(maanedTilbake) }, [maanedTilbake])

  const maanedNavn = (tilbake: number) => {
    const naa = new Date()
    const d = new Date(Date.UTC(naa.getUTCFullYear(), naa.getUTCMonth() - tilbake, 1))
    return d.toLocaleDateString('nb-NO', { month: 'long', year: 'numeric', timeZone: 'UTC' })
  }

  return (
    <div className="min-h-screen bg-[var(--paper)]">
      <div className="max-w-4xl mx-auto px-4 sm:px-8 py-10">
        <Link href="/dashboard" className="text-[13px] text-gray-500 hover:text-[var(--ink)]">
          ← Tilbake til oversikten
        </Link>
        <h1 className="mt-4 text-3xl font-bold text-gray-900">Avregning</h1>
        <p className="mt-2 text-[15px] text-gray-500 max-w-[60ch]">
          Hva kundene deres har brukt i perioden, og hvor mye som tilfaller dere.
          Avregningen følger forbruket — kreditter som er kjøpt, men ikke brukt, teller ikke ennå.
        </p>

        <div className="mt-6 flex flex-wrap items-center gap-2">
          {[0, 1, 2].map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setMaanedTilbake(t)}
              className={`px-3.5 py-2 rounded-lg border text-[13px] font-medium capitalize ${
                maanedTilbake === t
                  ? 'bg-[var(--ember-deep)] text-white border-[var(--ember-deep)]'
                  : 'bg-white text-gray-600 border-gray-300 hover:border-gray-400'
              }`}
            >
              {t === 0 ? 'Denne måneden' : maanedNavn(t)}
            </button>
          ))}
        </div>

        {laster && (
          <div className="mt-8 flex justify-center">
            <div className="w-7 h-7 border-4 border-[var(--ember-deep)] border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {feil && !laster && (
          <div className="mt-8 bg-white border border-red-200 rounded-2xl p-5 text-red-700 text-sm">{feil}</div>
        )}

        {data && !laster && (
          <>
            <div className="mt-8 grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="bg-white rounded-2xl border border-gray-200 px-5 py-4">
                <p className="text-[12px] uppercase tracking-widest text-gray-400">Omsetning</p>
                <p className="mt-1 text-2xl font-semibold text-gray-900 tabular-nums">{fmtNok(data.omsetningNok)}</p>
                <p className="mt-1 text-[12px] text-gray-400">Det kundene har brukt</p>
              </div>
              <div className="bg-white rounded-2xl border border-gray-200 px-5 py-4">
                <p className="text-[12px] uppercase tracking-widest text-gray-400">Til ContentForge</p>
                <p className="mt-1 text-2xl font-semibold text-gray-900 tabular-nums">{fmtNok(data.tilContentForgeNok)}</p>
                <p className="mt-1 text-[12px] text-gray-400">Produksjonspris + påslag</p>
              </div>
              <div className="bg-white rounded-2xl border-2 border-[var(--ember-deep)] px-5 py-4">
                <p className="text-[12px] uppercase tracking-widest text-[var(--ember-deep)]">Til dere</p>
                <p className="mt-1 text-2xl font-semibold text-gray-900 tabular-nums">{fmtNok(data.tilWhiteLabelNok)}</p>
                <p className="mt-1 text-[12px] text-gray-400">Utbetales mot faktura</p>
              </div>
            </div>

            <div className="mt-5 bg-white rounded-2xl border border-gray-200 overflow-hidden">
              <div className="px-5 py-3.5 border-b border-gray-100 flex items-baseline justify-between gap-3">
                <h2 className="text-base font-semibold text-gray-900">Fordeling</h2>
                <span className="text-[12.5px] text-gray-400">{data.antallHendelser} hendelser</span>
              </div>
              {Object.keys(data.perType).length === 0 ? (
                <p className="px-5 py-6 text-[13.5px] text-gray-500">
                  Ingen bruk registrert i denne perioden.
                </p>
              ) : (
                <table className="w-full text-[13.5px]">
                  <thead>
                    <tr className="text-left text-gray-400 text-[12px] uppercase tracking-widest">
                      <th className="px-5 py-2 font-normal">Type</th>
                      <th className="px-5 py-2 font-normal text-right">Antall</th>
                      <th className="px-5 py-2 font-normal text-right">Omsetning</th>
                      <th className="px-5 py-2 font-normal text-right">Til dere</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(data.perType)
                      .sort((a, b) => b[1].omsetning - a[1].omsetning)
                      .map(([type, v]) => (
                        <tr key={type} className="border-t border-gray-100">
                          <td className="px-5 py-2.5 text-gray-900">{TYPE_NAVN[type] || type}</td>
                          <td className="px-5 py-2.5 text-right text-gray-600 tabular-nums">{v.antall}</td>
                          <td className="px-5 py-2.5 text-right text-gray-600 tabular-nums">{fmtNok(v.omsetning)}</td>
                          <td className="px-5 py-2.5 text-right text-gray-900 font-medium tabular-nums">
                            {fmtNok(Math.max(0, v.omsetning - v.engros))}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              )}
            </div>

            <p className="mt-4 text-[12.5px] text-gray-400 max-w-[70ch]">
              Tallene er eksklusive merverdiavgift. Kreditter kjøpt på forskudd blir stående
              som ubrukt saldo til de faktisk brukes — derfor kan omsetningen her være lavere
              enn det som er kjøpt inn i perioden.
            </p>
          </>
        )}
      </div>
    </div>
  )
}
