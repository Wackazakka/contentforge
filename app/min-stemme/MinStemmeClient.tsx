'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useAuth } from '@/lib/authContext'
import { CenterForgeLogo } from '@/components/CenterForgeLogo'

// Rettighetshaverens hovedbok. Alt her er hentet fra /api/voice-bank/me, som
// avgjør identitet fra den innloggede e-posten — ikke fra noe på siden.
// Kundepris og kundenavn sendes ikke fra serveren, og vises derfor ikke.

interface Payout { id: string; periode_fra: string; periode_til: string; amount_nok: number; betalt_dato: string; note: string | null }
interface Usage { id: number; at: string; kind: string; chars: number | null; assetType: string; usedBy: string; toYouNok: number }
interface Actor {
  id: string; name: string; hasVoice: boolean; hasFace: boolean; isActive: boolean; isExclusive: boolean
  defaultRateNok: number; rates: Record<string, number>; previewRatePer1000: number; since: string; managedBy: string
  uses: number; earnedNok: number; meterNok: number; licenceNok: number; paidNok: number; dueNok: number
  payouts: Payout[]; events: Usage[]; licences: Licence[]
}

interface Fradrag { label: string; pct: number | null; amountNok: number }
interface Steg { trigger: string; label: string | null; status: string; toYouNok: number }
interface Licence {
  id: string; kind: 'campaign' | 'work'; assetType: string; status: string
  workTitle: string | null; productionTier: string | null; roleScope: string | null
  mediaClass: string | null; territory: string | null
  termStart: string | null; termEnd: string | null; exclusivity: string
  grossNok: number; deductions: Fradrag[]; netNok: number; steps: Steg[]
}

const nok = (n: number) => `${(Math.round(n * 100) / 100).toLocaleString('nb-NO')} kr`
const dato = (s: string) => new Date(s).toLocaleDateString('nb-NO', { day: 'numeric', month: 'short', year: 'numeric' })
const KIND: Record<string, string> = { video: 'Video', avatar: 'Avatar', radio: 'Radio', face: 'Ansikt', preview: 'Prøvelytt', ukjent: 'Annet' }
const MEDIA_T: Record<string, string> = { internal: 'Intern bruk', online: 'Online og sosialt', broadcast: 'Kringkasting og utendørs' }
const TERR_T: Record<string, string> = { no: 'Norge', nordic: 'Norden', world: 'Verden' }
const TIER_T: Record<string, string> = { short: 'Kortfilm / lavbudsjett', national: 'Norsk spillefilm eller serie', major: 'Stor produksjon', international: 'Internasjonal produksjon' }
const ROLE_T: Record<string, string> = { line: 'Enkeltreplikk', supporting: 'Birolle', lead: 'Hovedrolle' }
const LIC_STATUS: Record<string, string> = { quote: 'Tilbud', active: 'Aktiv', expired: 'Utløpt' }
const STEG_T: Record<string, string> = { theatrical_release: 'Kinopremiere', international_sale: 'Internasjonalt salg', streamer_pickup: 'Strømmepickup', custom: 'Annet' }

export default function MinStemmeClient({ appName }: { appName: string }) {
  const { session, loading: authLoading, signOut } = useAuth()
  const [fetched, setFetched] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [actors, setActors] = useState<Actor[]>([])
  // Utledet, ikke satt synkront i effekten: uten sesjon er det ingenting å vente på.
  const loading = authLoading || (!!session && !fetched)

  useEffect(() => {
    const token = session?.access_token
    if (!token) return
    fetch('/api/voice-bank/me', { headers: { Authorization: `Bearer ${token}` } })
      .then(async (r) => {
        const d = await r.json()
        if (!r.ok) throw new Error(d.error || 'Kunne ikke hente hovedboken')
        setActors(d.actors || [])
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Kunne ikke hente hovedboken'))
      .finally(() => setFetched(true))
  }, [session])

  const email = session?.user?.email

  return (
    <div className="min-h-screen bg-[var(--paper)] text-[var(--ink,#1C1A16)]">
      <header className="max-w-4xl mx-auto px-6 pt-6 pb-5 flex items-center gap-4 flex-wrap">
        <CenterForgeLogo size={28} wordmarkSize={18} />
        <span className="text-xs font-semibold tracking-[0.14em] uppercase text-gray-500">Din hovedbok</span>
        <div className="ml-auto flex items-center gap-4 text-sm">
          {email && <span className="text-gray-500 hidden sm:inline">{email}</span>}
          {session ? (
            <>
              {/* Kontoen (passordbytte) — det eneste utenom hovedboken en ren
                  rettighetshaver trenger. */}
              <Link href="/dashboard/konto" className="text-gray-600 hover:text-[var(--ink,#1C1A16)]">Konto</Link>
              <button onClick={() => signOut()} className="text-gray-600 hover:text-[var(--ink,#1C1A16)]">Logg ut</button>
            </>
          ) : (
            <Link href="/login" className="text-gray-600 hover:text-[var(--ink,#1C1A16)]">Logg inn</Link>
          )}
        </div>
      </header>
      <hr className="border-gray-200" />

      <main className="max-w-4xl mx-auto px-6 py-10">
        {loading && <p className="text-gray-500">Henter …</p>}

        {!loading && !session && (
          <div className="max-w-lg">
            <h1 className="text-2xl font-bold mb-3">Se hva stemmen din har tjent</h1>
            <p className="text-gray-600 mb-6">
              Logg inn med den e-postadressen du oppga da vi inngikk avtalen. Da ser du hver eneste
              gang stemmen eller ansiktet ditt er brukt, hva det ga, og hva som er utbetalt.
            </p>
            <div className="flex gap-3 flex-wrap">
              <Link href="/login" className="px-5 py-2.5 rounded-lg font-semibold text-[var(--on-ember)] bg-[var(--ember-deep)] hover:opacity-90">Logg inn</Link>
              <Link href="/register" className="px-5 py-2.5 rounded-lg font-semibold border border-gray-300 hover:border-gray-400">Opprett konto</Link>
            </div>
            <p className="text-xs text-gray-400 mt-4">Har du ikke konto ennå? Opprett én med samme e-post som står i avtalen — så kobles den automatisk.</p>
          </div>
        )}

        {!loading && session && error && <p className="text-red-600">{error}</p>}

        {!loading && session && !error && actors.length === 0 && (
          <div className="max-w-lg">
            <h1 className="text-2xl font-bold mb-3">Ingen avtale er knyttet til {email}</h1>
            <p className="text-gray-600">
              Hovedboken kobles til e-postadressen i forvaltningsavtalen din. Logget du inn med en annen
              adresse enn den du ga {appName}? Logg ut og prøv den — eller ta kontakt, så retter vi det.
            </p>
          </div>
        )}

        {!loading && actors.map((a) => (
          <section key={a.id} className="mb-14">
            <div className="flex items-start gap-3 flex-wrap mb-1">
              <h1 className="text-2xl font-bold">
                {a.hasVoice && '🎙️'}{a.hasFace && '🧑'} {a.name}
              </h1>
              <span className={`text-xs px-2 py-1 rounded-full mt-1.5 ${a.isActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'}`}>
                {a.isActive ? 'Aktiv' : 'Ikke aktiv ennå'}
              </span>
            </div>
            <p className="text-sm text-gray-500 mb-6">
              Forvaltes av {a.managedBy} · avtale siden {dato(a.since)}
              {a.hasVoice && a.hasFace ? ' · stemme og ansikt' : a.hasFace ? ' · ansikt' : ' · stemme'}
            </p>

            {/* Oppgjøret — det viktigste først */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
              {[
                { label: 'Ganger brukt', value: String(a.uses) },
                { label: 'Opptjent totalt', value: nok(a.earnedNok) },
                { label: 'Utbetalt', value: nok(a.paidNok) },
                { label: 'Til gode', value: nok(a.dueNok), strong: true },
              ].map((c) => (
                <div key={c.label} className={`rounded-lg border p-4 ${c.strong ? 'bg-[var(--ember-tint-bg,#FFF4EC)] border-[var(--ember-tint-border,#F1D9C8)]' : 'bg-[var(--paper-raised,#fff)] border-gray-200'}`}>
                  <div className="text-xs text-gray-500 mb-1">{c.label}</div>
                  <div className="text-xl font-bold">{c.value}</div>
                </div>
              ))}
            </div>
            {/* De to leddene betyr helt ulike ting: måleren er småpenger per
                generering, lisensen er honoraret. Slått sammen i ett tall ville
                de store pengene vært usynlige. */}
            {a.licenceNok > 0 && (
              <p className="text-sm text-gray-500 -mt-6 mb-8">
                Av det opptjente er <strong className="text-[var(--ink,#1C1A16)]">{nok(a.licenceNok)}</strong> lisenser (bruksrett)
                og <strong className="text-[var(--ink,#1C1A16)]">{nok(a.meterNok)}</strong> betaling per gang stemmen er brukt.
              </p>
            )}

            {/* Lisensene — bruksretten. For en filmavtale er det HER honoraret
                ligger; måleren under er småpenger per generering. Rettighets-
                haveren får se omfanget (man kan ikke ha samtykket til en film
                uten å vite hvilken) og sin egen side av pengene, inkludert
                fradrag som tas AV honoraret. */}
            {(a.licences || []).length > 0 && (
              <>
                <h2 className="font-semibold mb-2">Lisenser — hva stemmen din er klarert til</h2>
                <div className="space-y-3 mb-8">
                  {a.licences.map((l) => {
                    const omfang = l.kind === 'campaign'
                      ? [MEDIA_T[l.mediaClass || ''], TERR_T[l.territory || ''],
                         l.termEnd ? `til ${dato(l.termEnd)}` : 'uten sluttdato',
                         l.exclusivity === 'category' ? 'kategori-eksklusivt' : l.exclusivity === 'full' ? 'full buyout' : null]
                      : [TIER_T[l.productionTier || ''], ROLE_T[l.roleScope || ''], 'evig, bundet til verket']
                    return (
                      <div key={l.id} className="bg-[var(--paper-raised,#fff)] rounded-lg border border-gray-200 p-4 text-sm">
                        <div className="flex items-start justify-between gap-4 flex-wrap">
                          <div>
                            <div className="font-medium">
                              {l.kind === 'work' ? (l.workTitle || 'Verk') : 'Kampanje'}
                              <span className="ml-2 text-xs font-normal text-gray-500">{LIC_STATUS[l.status] || l.status}</span>
                            </div>
                            <div className="text-gray-600 mt-0.5">{omfang.filter(Boolean).join(' · ')}</div>
                          </div>
                          <div className="text-right">
                            <div className="font-bold">{nok(l.netNok)}</div>
                            <div className="text-xs text-gray-500">til deg</div>
                          </div>
                        </div>
                        {l.deductions.length > 0 && (
                          <div className="mt-3 pt-2 border-t border-gray-100 text-xs text-gray-600">
                            <span className="text-gray-500">Av honoraret ({nok(l.grossNok)}) er trukket: </span>
                            {l.deductions.map((d, i) => (
                              <span key={i}>{i > 0 && ', '}{d.label}{d.pct != null ? ` ${d.pct} %` : ''} — {nok(d.amountNok)}</span>
                            ))}
                          </div>
                        )}
                        {l.steps.length > 0 && (
                          <div className="mt-2 text-xs text-gray-600">
                            <span className="text-gray-500">Etterbetaling hvis det skjer: </span>
                            {l.steps.map((s, i) => (
                              <span key={i}>{i > 0 && ', '}{s.label || STEG_T[s.trigger] || s.trigger} — {nok(s.toYouNok)}
                                {s.status !== 'pending' && ` (${s.status})`}</span>
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </>
            )}

            {/* Satser — bare rettighetshaverens egen side */}
            <h2 className="font-semibold mb-2">Det du får per bruk</h2>
            <div className="bg-[var(--paper-raised,#fff)] rounded-lg border border-gray-200 p-4 mb-8 text-sm">
              <div className="flex flex-wrap gap-x-6 gap-y-1">
                <span><span className="text-gray-500">Standard:</span> <strong>{nok(a.defaultRateNok)}</strong></span>
                {Object.entries(a.rates).map(([k, v]) => (
                  <span key={k}><span className="text-gray-500">{KIND[k] || k}:</span> <strong>{nok(v)}</strong></span>
                ))}
                <span><span className="text-gray-500">Prøvelytt:</span> <strong>{nok(a.previewRatePer1000)}</strong> <span className="text-gray-500">per 1000 tegn</span></span>
              </div>
              <p className="text-xs text-gray-400 mt-2">
                Prøvelytt er når en kunde tester stemmen din på en tekst før de bestiller — hver test gir en liten
                sum etter tekstlengden. Satsen som gjaldt da bruken skjedde, er den som står i boka — endringer virker bare framover.
              </p>
            </div>

            {/* Utbetalinger */}
            <h2 className="font-semibold mb-2">Utbetalinger</h2>
            {a.payouts.length === 0 ? (
              <p className="text-sm text-gray-500 mb-8">Ingen utbetalinger ennå.</p>
            ) : (
              <div className="bg-[var(--paper-raised,#fff)] rounded-lg border border-gray-200 overflow-x-auto mb-8">
                <table className="w-full text-sm">
                  <thead><tr className="text-left text-xs text-gray-500 border-b border-gray-200">
                    <th className="px-4 py-2">Periode</th><th className="px-4 py-2">Betalt</th><th className="px-4 py-2 text-right">Beløp</th><th className="px-4 py-2">Notat</th>
                  </tr></thead>
                  <tbody>
                    {a.payouts.map((p) => (
                      <tr key={p.id} className="border-b border-gray-100 last:border-0">
                        <td className="px-4 py-2 whitespace-nowrap">{dato(p.periode_fra)} – {dato(p.periode_til)}</td>
                        <td className="px-4 py-2 whitespace-nowrap">{dato(p.betalt_dato)}</td>
                        <td className="px-4 py-2 text-right font-medium tabular-nums">{nok(p.amount_nok)}</td>
                        <td className="px-4 py-2 text-gray-500">{p.note || ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Hver bruk — hovedboken */}
            <h2 className="font-semibold mb-2">Hver gang {a.hasFace && !a.hasVoice ? 'ansiktet' : 'stemmen'} din er brukt</h2>
            {a.events.length === 0 ? (
              <p className="text-sm text-gray-500">
                Ikke brukt ennå. Hver bruk kommer hit i samme sekund den skjer — ikke rekonstruert i etterkant.
              </p>
            ) : (
              <div className="bg-[var(--paper-raised,#fff)] rounded-lg border border-gray-200 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="text-left text-xs text-gray-500 border-b border-gray-200">
                    <th className="px-4 py-2">Når</th><th className="px-4 py-2">Hva</th><th className="px-4 py-2">Brukt av</th><th className="px-4 py-2 text-right">Til deg</th>
                  </tr></thead>
                  <tbody>
                    {a.events.map((e) => (
                      <tr key={e.id} className="border-b border-gray-100 last:border-0">
                        <td className="px-4 py-2 whitespace-nowrap text-gray-600">{dato(e.at)}</td>
                        <td className="px-4 py-2">{KIND[e.kind] || e.kind}{e.kind === 'preview' && e.chars ? <span className="text-gray-400"> · {e.chars} tegn</span> : null}</td>
                        <td className="px-4 py-2">{e.usedBy}</td>
                        <td className="px-4 py-2 text-right font-medium tabular-nums">{nok(e.toYouNok)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {a.events.length >= 200 && <p className="text-xs text-gray-400 px-4 py-2">Viser de 200 siste. Totalene øverst dekker alt.</p>}
              </div>
            )}

            <p className="text-xs text-gray-400 mt-6">
              Beløpene er det du får, før skatt. Utbetaling skjer fra {a.managedBy}. Spørsmål om en linje? Ta kontakt med dem.
            </p>
          </section>
        ))}
      </main>
    </div>
  )
}
