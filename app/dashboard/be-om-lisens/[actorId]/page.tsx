'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { getSupabase } from '@/lib/supabaseClient'

// Kundens dør til en lisens (migrasjon 090).
//
// 🔑 HVORFOR SIDA FINNES. Produksjonsflaten stenger «Produser» uten hjemmel og
// lenket til «Opprett lisens» — inn i ADMIN. En ekte kunde fikk 403 og en tom
// flate. Porten var riktig; døra på utsiden av den fantes ikke.
//
// 🔑 SKJEMAET SPØR OM TAKSTKORTETS AKSER, ikke fritekst. Den som har fylt ut
// dette har i praksis fylt ut halve lisensen, og forespørselen kan mates rett
// inn i tilbudsgeneratoren. Fritekst finnes bare i notatet — det kunden vet
// som vi ikke visste å spørre om.
//
// Kunden kan IKKE lage lisensen selv, og sida later ikke som noe annet.
// Takstkortet er en tilbudsgenerator: satsene forhandles fra verk til verk.

const AKSER = {
  assetType: {
    etikett: 'Hva skal brukes',
    valg: [
      ['voice', 'Stemmen'],
      ['face', 'Ansiktet'],
      ['both', 'Begge deler'],
    ],
  },
  mediaClass: {
    etikett: 'Hvor skal det vises',
    valg: [
      ['internal', 'Internt — opplæring, presentasjoner, ikke offentlig'],
      ['online', 'Nett og sosiale medier'],
      ['broadcast', 'Kringkasting — TV, radio, kino'],
    ],
  },
  territory: {
    etikett: 'Hvor i verden',
    valg: [
      ['no', 'Norge'],
      ['nordic', 'Norden'],
      ['world', 'Hele verden'],
    ],
  },
  exclusivity: {
    etikett: 'Eksklusivitet',
    valg: [
      ['none', 'Ingen — rettighetshaveren kan si ja til andre'],
      ['category', 'I vår kategori — ikke til konkurrenter'],
      ['full', 'Full — ingen andre i perioden'],
    ],
  },
} as const

const PERIODER: Array<[number, string]> = [
  [3, '3 måneder'],
  [12, '12 måneder'],
  [0, 'Uten sluttdato'],
]

type Svar = { assetType: string; mediaClass: string; territory: string; exclusivity: string }

interface Forespoersel {
  id: string
  actor_id: string
  asset_type: string
  media_class: string
  territory: string
  term_months: number
  exclusivity: string
  status: string
  created_at: string
}

export default function BeOmLisensPage() {
  const actorId = String(useParams().actorId || '')
  const [navn, setNavn] = useState<string | null>(null)
  const [svar, setSvar] = useState<Svar>({ assetType: 'voice', mediaClass: 'online', territory: 'no', exclusivity: 'none' })
  const [termMonths, setTermMonths] = useState(12)
  const [note, setNote] = useState('')
  const [mine, setMine] = useState<Forespoersel[]>([])
  // Admin ser en snarvei inn i banken: samme doer betjener begge roller, og
  // produksjonsflaten slipper to ekstra nettverkskall for aa vite hvem som ser.
  const [erAdmin, setErAdmin] = useState(false)
  const [busy, setBusy] = useState(false)
  const [sendt, setSendt] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const headers = useCallback(async (): Promise<Record<string, string>> => {
    const { data } = await getSupabase().auth.getSession()
    const token = data?.session?.access_token
    return token ? { Authorization: `Bearer ${token}` } : {}
  }, [])

  const hent = useCallback(async () => {
    const h = await headers()
    try {
      const k = await fetch('/api/voice-bank/catalog', { headers: h }).then((r) => r.json())
      const a = (k.actors || []).find((x: { id: string }) => x.id === actorId)
      if (a?.name) setNavn(a.name)
    } catch { /* navnet er pynt; skjemaet virker uten */ }
    try {
      const d = await fetch(`/api/licence-requests?actorId=${encodeURIComponent(actorId)}`, { headers: h }).then((r) => r.json())
      setMine(d.requests || [])
      setErAdmin(!!d.isAdmin)
    } catch { /* ingen tidligere å vise */ }
  }, [actorId, headers])

  useEffect(() => { hent() }, [hent])

  const send = async () => {
    setError(null); setBusy(true)
    try {
      const res = await fetch('/api/licence-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await headers()) },
        body: JSON.stringify({ actorId, ...svar, termMonths, note: note || null }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'Forespørselen kom ikke fram')
      setSendt(true)
      await hent()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  const aapen = mine.find((m) => m.status === 'open')

  return (
    <div className="min-h-screen bg-[var(--paper)]">
      <div className="max-w-2xl mx-auto px-4 py-8">
        <Link href="/dashboard" className="text-[var(--ember-deep)] hover:text-[var(--ink)] mb-4 inline-block">← Tilbake</Link>
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          Be om lisens{navn ? ` på ${navn}` : ''}
        </h1>
        <p className="text-gray-600 mb-8">
          Bruksretten avtales fra gang til gang — derfor spør vi om hva den skal dekke,
          og kommer tilbake med et tilbud. Du blir ikke belastet for noe her.
        </p>

        {erAdmin && (
          <div className="mb-6 p-3 rounded-lg border border-gray-300 text-sm text-gray-700">
            Du er admin i denne banken og kan opprette lisensen direkte:{' '}
            <Link href={`/dashboard/voice-bank/${actorId}/lisenser`} className="font-semibold text-[var(--ember-deep)] hover:underline">
              Åpne lisenser →
            </Link>
          </div>
        )}

        {(sendt || aapen) && (
          <div className="mb-8 p-4 rounded-lg" style={{ background: 'var(--ember-tint-bg)', border: '2px solid var(--ember-deep)' }}>
            <p className="text-sm text-gray-900 m-0">
              <strong>Forespørselen er mottatt.</strong> Vi kommer tilbake med et tilbud på
              bruksretten. Fram til den er på plass er produksjon med denne rettighetshaveren stengt.
            </p>
            {aapen && (
              <p className="text-xs text-gray-600 mt-2 mb-0">
                Sendt {new Date(aapen.created_at).toLocaleDateString('nb-NO')}.
              </p>
            )}
          </div>
        )}

        {!aapen && !sendt && (
          <div className="bg-[var(--paper-raised)] rounded-lg border border-gray-200 p-6 mb-8">
            {(Object.entries(AKSER) as Array<[keyof Svar, typeof AKSER[keyof typeof AKSER]]>).map(([felt, spec]) => (
              <fieldset key={felt} className="mb-5">
                <legend className="text-sm font-medium text-gray-700 mb-2">{spec.etikett}</legend>
                {spec.valg.map(([verdi, tekst]) => (
                  <label key={verdi} className="flex items-start gap-2 mb-1.5 text-sm text-gray-700 cursor-pointer">
                    <input type="radio" name={felt} checked={svar[felt] === verdi}
                      onChange={() => setSvar((s) => ({ ...s, [felt]: verdi }))} className="mt-0.5 h-4 w-4" />
                    <span>{tekst}</span>
                  </label>
                ))}
              </fieldset>
            ))}

            <fieldset className="mb-5">
              <legend className="text-sm font-medium text-gray-700 mb-2">Hvor lenge</legend>
              {PERIODER.map(([v, tekst]) => (
                <label key={v} className="flex items-start gap-2 mb-1.5 text-sm text-gray-700 cursor-pointer">
                  <input type="radio" name="termMonths" checked={termMonths === v}
                    onChange={() => setTermMonths(v)} className="mt-0.5 h-4 w-4" />
                  <span>{tekst}</span>
                </label>
              ))}
            </fieldset>

            <label className="block text-sm font-medium text-gray-700 mb-1">Hva skal det brukes til? (valgfritt)</label>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3}
              placeholder="F.eks. «Kampanje for ny tjeneste, tre filmer på 20 sekunder, lansering i november.»"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm mb-2" />
            <p className="text-xs text-gray-400 mb-4">
              Jo mer konkret, jo raskere får du et tilbud som stemmer.
            </p>

            {error && <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">{error}</div>}

            <button onClick={send} disabled={busy}
              className="px-5 py-2.5 rounded-lg font-semibold text-[var(--on-ember)] bg-[var(--ember-deep)] hover:bg-[var(--ink)] disabled:opacity-50 transition-colors">
              {busy ? 'Sender…' : 'Send forespørsel'}
            </button>
          </div>
        )}

        {mine.length > 0 && (
          <>
            <h2 className="font-semibold text-gray-900 mb-3">Dine forespørsler</h2>
            <div className="space-y-2">
              {mine.map((m) => (
                <div key={m.id} className="flex items-center justify-between bg-[var(--paper-raised)] border border-gray-200 rounded-lg px-4 py-3">
                  <div className="text-sm text-gray-700">
                    {new Date(m.created_at).toLocaleDateString('nb-NO')} — {m.media_class} · {m.territory} · {m.term_months === 0 ? 'uten sluttdato' : `${m.term_months} mnd`}
                  </div>
                  <span className="text-xs px-3 py-1 rounded-full font-medium bg-gray-100 text-gray-700">
                    {m.status === 'open' ? 'Venter på tilbud' : m.status === 'quoted' ? 'Tilbud sendt' : 'Avsluttet'}
                  </span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
