'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useTranslations, useLocale } from 'next-intl'
import { useAuth } from '@/lib/authContext'
import { CenterForgeLogo } from '@/components/CenterForgeLogo'
import LeveringPanel from '@/components/LeveringPanel'

// Rettighetshaverens hovedbok. Alt her er hentet fra /api/voice-bank/me, som
// avgjør identitet fra den innloggede e-posten — ikke fra noe på siden.
// Kundepris og kundenavn sendes ikke fra serveren, og vises derfor ikke.

interface Payout { id: string; periode_fra: string; periode_til: string; amount_nok: number; betalt_dato: string; note: string | null }
interface Usage { id: number; at: string; kind: string; chars: number | null; assetType: string; usedBy: string; toYouNok: number; licenceId: string | null; licenceLabel: string | null }
interface Actor {
  id: string; name: string; hasVoice: boolean; hasFace: boolean; isActive: boolean; isExclusive: boolean
  defaultRateNok: number; rates: Record<string, number>; previewRatePer1000: number; since: string; managedBy: string
  uses: number; earnedNok: number; meterNok: number; licenceNok: number; royaltyNok: number; paidNok: number; dueNok: number
  payouts: Payout[]; events: Usage[]; licences: Licence[]
  // Paameldingen (101)
  offersVoice: boolean; wantsFace: boolean; hasOwnRecording: boolean | null
  enrolled: boolean; identityBasis: string | null; delivered: boolean
}

interface Fradrag { label: string; pct: number | null; amountNok: number }
interface Steg { trigger: string; label: string | null; status: string; toYouNok: number }
interface Licence {
  id: string; kind: 'campaign' | 'work'; assetType: string; status: string
  workTitle: string | null; productionTier: string | null; roleScope: string | null
  mediaClass: string | null; territory: string | null
  termStart: string | null; termEnd: string | null; exclusivity: string
  grossNok: number; deductions: Fradrag[]; netNok: number; steps: Steg[]
  compModel: 'fee' | 'royalty' | 'hybrid'
  royaltyPct: number | null; releaseChannel: string | null; releaseTitle: string | null
  statements: Avregning[]
}
interface Avregning { periodStart: string; periodEnd: string; source: string | null; basisNok: number; pct: number; toYouNok: number }

// Beløp og datoer er språkavhengige: 1 234,50 kr på norsk, 1,234.50 kr på
// engelsk. Valutaen er NOK uansett språk — det er kroner som utbetales.
const BCP47: Record<string, string> = { no: 'nb-NO', en: 'en-GB' }

export default function MinStemmeClient({ appName }: { appName: string }) {
  const t = useTranslations('myLedger')
  const locale = useLocale()
  const bcp = BCP47[locale] || 'en-GB'
  const nok = (n: number) => `${(Math.round(n * 100) / 100).toLocaleString(bcp)} kr`
  const dato = (s: string) => new Date(s).toLocaleDateString(bcp, { day: 'numeric', month: 'short', year: 'numeric' })
  // Kodeverdiene er API-kontrakt (de kommer fra basen); bare etikettene oversettes.
  const ord = (prefix: string, key: string | null | undefined) =>
    key ? t.has(`${prefix}_${key}`) ? t(`${prefix}_${key}`) : key : ''
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
        if (!r.ok) throw new Error(d.error || t('err_fetch'))
        setActors(d.actors || [])
      })
      .catch((e) => setError(e instanceof Error ? e.message : t('err_fetch')))
      .finally(() => setFetched(true))
  }, [session])

  const email = session?.user?.email

  return (
    <div className="min-h-screen bg-[var(--paper)] text-[var(--ink,#1C1A16)]">
      <header className="max-w-4xl mx-auto px-6 pt-6 pb-5 flex items-center gap-4 flex-wrap">
        <CenterForgeLogo size={28} wordmarkSize={18} />
        <span className="text-xs font-semibold tracking-[0.14em] uppercase text-gray-500">{t('header_label')}</span>
        <div className="ml-auto flex items-center gap-4 text-sm">
          {email && <span className="text-gray-500 hidden sm:inline">{email}</span>}
          {session ? (
            <>
              {/* Kontoen (passordbytte) — det eneste utenom hovedboken en ren
                  rettighetshaver trenger. */}
              <Link href="/dashboard/konto" className="text-gray-600 hover:text-[var(--ink,#1C1A16)]">{t('account')}</Link>
              <button onClick={() => signOut()} className="text-gray-600 hover:text-[var(--ink,#1C1A16)]">{t('log_out')}</button>
            </>
          ) : (
            <Link href="/login" className="text-gray-600 hover:text-[var(--ink,#1C1A16)]">{t('log_in')}</Link>
          )}
        </div>
      </header>
      <hr className="border-gray-200" />

      <main className="max-w-4xl mx-auto px-6 py-10">
        {loading && <p className="text-gray-500">{t('fetching')}</p>}

        {!loading && !session && (
          <div className="max-w-lg">
            <h1 className="text-2xl font-bold mb-3">{t('signed_out_title')}</h1>
            <p className="text-gray-600 mb-6">
              {t('signed_out_body')}
            </p>
            <div className="flex gap-3 flex-wrap">
              <Link href="/login" className="px-5 py-2.5 rounded-lg font-semibold text-[var(--on-ember)] bg-[var(--ember-deep)] hover:opacity-90">{t('log_in')}</Link>
              <Link href="/register" className="px-5 py-2.5 rounded-lg font-semibold border border-gray-300 hover:border-gray-400">{t('create_account')}</Link>
            </div>
            <p className="text-xs text-gray-400 mt-4">{t('signed_out_note')}</p>
          </div>
        )}

        {!loading && session && error && <p className="text-red-600">{error}</p>}

        {!loading && session && !error && actors.length === 0 && (
          <div className="max-w-lg">
            <h1 className="text-2xl font-bold mb-3">{t('no_deal_title', { email: email ?? '' })}</h1>
            <p className="text-gray-600">
              {t('no_deal_body', { tenant: appName })}
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
                {a.isActive ? t('active') : t('not_active')}
              </span>
            </div>
            <p className="text-sm text-gray-500 mb-6">
              {t('managed_since', { tenant: a.managedBy, date: dato(a.since) })}
              {a.hasVoice && a.hasFace ? t('both') : a.hasFace ? t('only_face') : t('only_voice')}
            </p>

            {/* Kom i gang (101): paameldt, ikke aktiv ennaa. Leveringen skjer
                HER, innlogget — ingen tokenlenke, ingen koe. Naar hun er
                aktivert forsvinner blokka av seg selv. */}
            {a.enrolled && !a.isActive && (
              <div className="mb-8">
                <h2 className="font-semibold mb-1">Kom i gang</h2>
                <p className="text-sm text-gray-600 mb-4">
                  Du er påmeldt. Det som gjenstår står under — ingenting publiseres før du har levert og vi har sett gjennom det sammen.
                </p>
                <LeveringPanel
                  kompakt
                  auth={{ bearer: session?.access_token || '', actorId: a.id }}
                  onStartOpptak={a.offersVoice && a.hasOwnRecording !== true ? async () => {
                    const r = await fetch('/api/stemmeopptak/self', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token || ''}` },
                      body: JSON.stringify({ actorId: a.id }),
                    })
                    const j = await r.json()
                    if (!r.ok || !j.lenke) { alert(j.error || 'Kunne ikke starte opptaket'); return }
                    window.location.href = j.lenke
                  } : undefined}
                />
              </div>
            )}

            {/* Oppgjøret — det viktigste først */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
              {[
                { label: t('card_uses'), value: String(a.uses) },
                { label: t('card_earned'), value: nok(a.earnedNok) },
                { label: t('card_paid'), value: nok(a.paidNok) },
                { label: t('card_due'), value: nok(a.dueNok), strong: true },
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
            {(a.licenceNok > 0 || a.royaltyNok > 0) && (
              <p className="text-sm text-gray-500 -mt-6 mb-8">
                {t('split_lead')} <strong className="text-[var(--ink,#1C1A16)]">{nok(a.licenceNok)}</strong> {t('split_licences')}
                {a.royaltyNok > 0 && <>, <strong className="text-[var(--ink,#1C1A16)]">{nok(a.royaltyNok)}</strong> {t('split_royalty')}</>}
                {' '}{t('split_and')} <strong className="text-[var(--ink,#1C1A16)]">{nok(a.meterNok)}</strong> {t('split_meter')}
              </p>
            )}

            {/* Lisensene — bruksretten. For en filmavtale er det HER honoraret
                ligger; måleren under er småpenger per generering. Rettighets-
                haveren får se omfanget (man kan ikke ha samtykket til en film
                uten å vite hvilken) og sin egen side av pengene, inkludert
                fradrag som tas AV honoraret. */}
            {(a.licences || []).length > 0 && (
              <>
                <h2 className="font-semibold mb-2">{t('licences_h2')}</h2>
                <div className="space-y-3 mb-8">
                  {a.licences.map((l) => {
                    const omfang = l.kind === 'campaign'
                      ? [ord('media', l.mediaClass), ord('terr', l.territory),
                         l.termEnd ? t('lic_until', { date: dato(l.termEnd) }) : t('lic_no_end'),
                         l.exclusivity === 'category' ? t('lic_excl_category') : l.exclusivity === 'full' ? t('lic_excl_full') : null]
                      : [ord('tier', l.productionTier), ord('role', l.roleScope), t('lic_perpetual')]
                    return (
                      <div key={l.id} className="bg-[var(--paper-raised,#fff)] rounded-lg border border-gray-200 p-4 text-sm">
                        <div className="flex items-start justify-between gap-4 flex-wrap">
                          <div>
                            <div className="font-medium">
                              {l.kind === 'work' ? (l.workTitle || t('lic_work')) : t('lic_campaign')}
                              <span className="ml-2 text-xs font-normal text-gray-500">{ord('licstatus', l.status) || l.status}</span>
                            </div>
                            <div className="text-gray-600 mt-0.5">{omfang.filter(Boolean).join(' · ')}</div>
                          </div>
                          <div className="text-right">
                            <div className="font-bold">{nok(l.netNok)}</div>
                            <div className="text-xs text-gray-500">{t('to_you')}</div>
                          </div>
                        </div>
                        {l.deductions.length > 0 && (
                          <div className="mt-3 pt-2 border-t border-gray-100 text-xs text-gray-600">
                            <span className="text-gray-500">{t('deductions_lead', { gross: nok(l.grossNok) })}</span>
                            {l.deductions.map((d, i) => (
                              <span key={i}>{i > 0 && ', '}{d.label}{d.pct != null ? ` ${d.pct} %` : ''} — {nok(d.amountNok)}</span>
                            ))}
                          </div>
                        )}
                        {/* Royalty: satsen, og hver avregning med grunnlaget
                            den er regnet av. Uten grunnlaget er andelen et
                            tall man må stole på. */}
                        {l.compModel !== 'fee' && (
                          <div className="mt-3 pt-2 border-t border-gray-100 text-xs">
                            <span className="text-gray-500">
                              {t('royalty_line', {
                                model: l.compModel === 'royalty' ? t('comp_royalty_only') : t('comp_hybrid'),
                                pct: l.royaltyPct ?? 0,
                                what: l.releaseTitle ? `«${l.releaseTitle}»` : t('royalty_the_release'),
                                channel: l.releaseChannel ? t('royalty_via', { channel: l.releaseChannel }) : '',
                              })}
                            </span>
                            {l.statements.length === 0 ? (
                              <p className="text-gray-400 mt-1">
                                {t('no_statement')}
                              </p>
                            ) : (
                              <div className="mt-1 space-y-0.5">
                                {l.statements.map((s, i) => (
                                  <div key={i} className="flex justify-between gap-3 text-gray-600">
                                    <span>{dato(s.periodStart)} – {dato(s.periodEnd)}
                                      <span className="text-gray-400">{t('statement_basis', { basis: nok(s.basisNok), pct: s.pct })}</span></span>
                                    <span className="tabular-nums">{nok(s.toYouNok)}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                        {l.steps.length > 0 && (
                          <div className="mt-2 text-xs text-gray-600">
                            <span className="text-gray-500">{t('steps_lead')}</span>
                            {l.steps.map((s, i) => (
                              <span key={i}>{i > 0 && ', '}{s.label || ord('step', s.trigger) || s.trigger} — {nok(s.toYouNok)}
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
            <h2 className="font-semibold mb-2">{t('rates_h2')}</h2>
            <div className="bg-[var(--paper-raised,#fff)] rounded-lg border border-gray-200 p-4 mb-8 text-sm">
              <div className="flex flex-wrap gap-x-6 gap-y-1">
                <span><span className="text-gray-500">{t('rate_standard')}</span> <strong>{nok(a.defaultRateNok)}</strong></span>
                {Object.entries(a.rates).map(([k, v]) => (
                  <span key={k}><span className="text-gray-500">{ord('kind', k) || k}:</span> <strong>{nok(v)}</strong></span>
                ))}
                <span><span className="text-gray-500">{t('rate_preview')}</span> <strong>{nok(a.previewRatePer1000)}</strong> <span className="text-gray-500">{t('rate_per_1000')}</span></span>
              </div>
              <p className="text-xs text-gray-400 mt-2">
                {t('rates_note')}
              </p>
            </div>

            {/* Utbetalinger */}
            <h2 className="font-semibold mb-2">{t('payouts_h2')}</h2>
            {a.payouts.length === 0 ? (
              <p className="text-sm text-gray-500 mb-8">{t('payouts_none')}</p>
            ) : (
              <div className="bg-[var(--paper-raised,#fff)] rounded-lg border border-gray-200 overflow-x-auto mb-8">
                <table className="w-full text-sm">
                  <thead><tr className="text-left text-xs text-gray-500 border-b border-gray-200">
                    <th className="px-4 py-2">{t('th_period')}</th><th className="px-4 py-2">{t('th_paid')}</th><th className="px-4 py-2 text-right">{t('th_amount')}</th><th className="px-4 py-2">{t('th_note')}</th>
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
            <h2 className="font-semibold mb-2">{a.hasFace && !a.hasVoice ? t('uses_h2_face') : t('uses_h2_voice')}</h2>
            {a.events.length === 0 ? (
              <p className="text-sm text-gray-500">
                {t('uses_none')}
              </p>
            ) : (
              <div className="bg-[var(--paper-raised,#fff)] rounded-lg border border-gray-200 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="text-left text-xs text-gray-500 border-b border-gray-200">
                    <th className="px-4 py-2">{t('th_when')}</th><th className="px-4 py-2">{t('th_what')}</th><th className="px-4 py-2">{t('th_under')}</th><th className="px-4 py-2">{t('th_by')}</th><th className="px-4 py-2 text-right">{t('th_to_you')}</th>
                  </tr></thead>
                  <tbody>
                    {a.events.map((e) => (
                      <tr key={e.id} className="border-b border-gray-100 last:border-0">
                        <td className="px-4 py-2 whitespace-nowrap text-gray-600">{dato(e.at)}</td>
                        <td className="px-4 py-2">{ord('kind', e.kind) || e.kind}{e.kind === 'preview' && e.chars ? <span className="text-gray-400">{t('chars', { n: e.chars })}</span> : null}</td>
                        {/* Hjemmelen. Prøvelytt har ingen med vilje — det er
                            utforskning før en avtale finnes. */}
                        <td className="px-4 py-2 text-gray-600">
                          {e.licenceLabel
                            ? e.licenceLabel
                            : <span className="text-gray-400">{e.kind === 'preview' ? t('preview_word') : '—'}</span>}
                        </td>
                        <td className="px-4 py-2">{e.usedBy}</td>
                        <td className="px-4 py-2 text-right font-medium tabular-nums">{nok(e.toYouNok)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {a.events.length >= 200 && <p className="text-xs text-gray-400 px-4 py-2">{t('capped')}</p>}
              </div>
            )}

            <p className="text-xs text-gray-400 mt-6">
              {t('footer_note', { tenant: a.managedBy })}
            </p>
          </section>
        ))}
      </main>
    </div>
  )
}
