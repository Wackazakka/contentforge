'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { getSupabase } from '@/lib/supabaseClient'

// Lisenser for én rettighetshaver: klareringen ved siden av forbruksmåleren.
//
// Kjerneideen i skjemaet: takstkortet FORESLÅR og fyller ut, men hvert eneste
// kronebeløp kan overskrives før avtalen inngås — og listeprisen blir stående
// ved siden av det avtalte, slik at avviket er synlig i ettertid.

type Kind = 'campaign' | 'work'

interface Split {
  party_type: string
  party_label: string | null
  basis: 'customer_fee' | 'actor_fee'
  pct: number | null
  amount_nok: number
}

interface Step {
  id: string
  trigger_kind: string
  label: string | null
  status: string
  amount_nok: number
  actor_nok: number
}

interface Statement {
  id: string
  period_start: string
  period_end: string
  source: string | null
  net_receipts_nok: number
  artist_pct: number
  artist_nok: number
}

interface Licence {
  id: string
  kind: Kind
  asset_type: string
  status: string
  comp_model: 'fee' | 'royalty' | 'hybrid'
  royalty_pct: number | null
  release_channel: string | null
  release_title: string | null
  statements: Statement[]
  media_class: string | null
  territory: string | null
  term_start: string | null
  term_end: string | null
  exclusivity: string
  work_title: string | null
  production_tier: string | null
  role_scope: string | null
  fee_customer_nok: number
  fee_actor_nok: number
  list_fee_customer_nok: number | null
  customer_label: string | null
  notes: string | null
  splits: Split[]
  steps: Step[]
}

const MEDIA: Array<[string, string]> = [
  ['internal', 'Intern / ikke-kringkastet'],
  ['online', 'Online og sosialt'],
  ['broadcast', 'Kringkasting og utendørs'],
]
const TERRITORY: Array<[string, string]> = [['no', 'Norge'], ['nordic', 'Norden'], ['world', 'Verden']]
const TERM: Array<[number, string]> = [[3, '3 måneder'], [12, '12 måneder'], [0, 'Evig (buyout)']]
const EXCL: Array<[string, string]> = [['none', 'Ikke eksklusivt'], ['category', 'Kategori-eksklusivt'], ['full', 'Full buyout']]
const TIER: Array<[string, string]> = [
  ['short', 'Kortfilm / student / lavbudsjett'],
  ['national', 'Norsk spillefilm eller serie'],
  ['major', 'Stor norsk / strømmeprodusert'],
  ['international', 'Internasjonal produksjon'],
]
const ROLE: Array<[string, string]> = [['line', 'Enkeltreplikk / bakgrunn'], ['supporting', 'Birolle'], ['lead', 'Hovedrolle']]
const ASSET: Array<[string, string]> = [['voice', 'Stemme'], ['face', 'Ansikt'], ['both', 'Stemme og ansikt']]
const STATUS_TEKST: Record<string, string> = {
  quote: 'Tilbud', active: 'Aktiv', expired: 'Utløpt', superseded: 'Erstattet', cancelled: 'Kansellert',
}
const COMP: Array<[string, string, string]> = [
  ['fee', 'Fast honorar', 'Hele honoraret nå. Ingen andel av det utgivelsen tjener.'],
  ['hybrid', 'Kombinasjon', 'Redusert honorar nå, pluss en andel. Standardvalget for de fleste.'],
  ['royalty', 'Kun royalty', 'Ingenting nå, alt i andel. Størst oppside, lengst vei til første krone.'],
]
// Royalty krever en kanal vi ser inntekten i — ellers er andelen et løfte og
// ikke et produkt. Håndhevet i basen (migrasjon 079); dette er bare etiketten.
const KANAL: Array<[string, string]> = [
  ['trickletracks', 'TrickleTracks'],
  ['indigoboom', 'IndigoBoom'],
  ['other', 'Annen distribusjon'],
]
const KONTROLLERT = ['indigoboom', 'trickletracks']

const nok = (n: number) => new Intl.NumberFormat('nb-NO', { maximumFractionDigits: 0 }).format(n) + ' kr'

export default function LisenserPage() {
  const { actorId } = useParams<{ actorId: string }>()
  const [licences, setLicences] = useState<Licence[]>([])
  const [error, setError] = useState<string | null>(null)
  const [laster, setLaster] = useState(true)

  // Skjema
  const [kind, setKind] = useState<Kind>('campaign')
  const [asset, setAsset] = useState('voice')
  const [mediaClass, setMediaClass] = useState('online')
  const [territory, setTerritory] = useState('no')
  const [termMonths, setTermMonths] = useState(3)
  const [exclusivity, setExclusivity] = useState('none')
  const [productionTier, setProductionTier] = useState('national')
  const [roleScope, setRoleScope] = useState('supporting')
  const [workTitle, setWorkTitle] = useState('')
  const [customerLabel, setCustomerLabel] = useState('')
  const [agentPct, setAgentPct] = useState('')
  const [compModel, setCompModel] = useState<'fee' | 'royalty' | 'hybrid'>('fee')
  const [royaltyPct, setRoyaltyPct] = useState('3')
  const [releaseChannel, setReleaseChannel] = useState('trickletracks')
  const [releaseTitle, setReleaseTitle] = useState('')
  const [feeCustomer, setFeeCustomer] = useState('')
  const [feeActor, setFeeActor] = useState('')
  const [liste, setListe] = useState<{ listeNok: number; honorarNok: number } | null>(null)
  const [rort, setRort] = useState(false) // har admin overstyrt beløpene?
  const [busy, setBusy] = useState(false)

  const token = async () => {
    const { data } = await getSupabase().auth.getSession()
    const t = data?.session?.access_token
    if (!t) throw new Error('Ikke innlogget')
    return t
  }

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/voice-bank/licences?actorId=${actorId}`, {
        headers: { Authorization: `Bearer ${await token()}` },
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Kunne ikke hente lisensene'); return }
      setError(null)
      setLicences(data.licences || [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ukjent feil')
    } finally {
      setLaster(false)
    }
  }, [actorId])

  useEffect(() => { refresh() }, [refresh])

  // Hent listepris hver gang en akse endres. Beløpsfeltene fylles bare så lenge
  // admin ikke har rørt dem — et forslag skal aldri overskrive en forhandlet pris.
  useEffect(() => {
    let avbrutt = false
    ;(async () => {
      try {
        const p = new URLSearchParams({
          actorId: String(actorId), quote: '1', kind, asset,
          mediaClass, territory, termMonths: String(termMonths), exclusivity,
          productionTier, roleScope,
        })
        const res = await fetch(`/api/voice-bank/licences?${p}`, { headers: { Authorization: `Bearer ${await token()}` } })
        const d = await res.json()
        if (avbrutt || !res.ok) return
        setListe(d)
        if (!rort) { setFeeCustomer(String(d.listeNok)); setFeeActor(String(d.honorarNok)) }
      } catch { /* behold forrige forslag */ }
    })()
    return () => { avbrutt = true }
  }, [actorId, kind, asset, mediaClass, territory, termMonths, exclusivity, productionTier, roleScope, rort])

  const opprett = async () => {
    setBusy(true)
    try {
      const splits = [
        { party_type: 'platform', party_label: 'Infrastrukturavgift', basis: 'customer_fee', pct: 3 },
        ...(Number(agentPct) > 0
          ? [{ party_type: 'agent', party_label: 'Agent / manager', basis: 'actor_fee', pct: Number(agentPct) }]
          : []),
        { party_type: 'agency', basis: 'customer_fee', pct: null },
      ]
      const res = await fetch('/api/voice-bank/licences', {
        method: 'POST',
        headers: { Authorization: `Bearer ${await token()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          actorId, kind, asset, mediaClass, territory, termMonths, exclusivity,
          productionTier, roleScope, workTitle, customerLabel,
          compModel,
          royaltyPct: compModel === 'fee' ? null : Number(royaltyPct),
          releaseChannel: compModel === 'fee' ? null : releaseChannel,
          releaseTitle: releaseTitle || null,
          feeCustomerNok: Number(feeCustomer), feeActorNok: Number(feeActor), splits,
        }),
      })
      const d = await res.json()
      if (!res.ok) { setError(d.error || 'Kunne ikke opprette'); return }
      setError(null); setWorkTitle(''); setCustomerLabel(''); setRort(false)
      await refresh()
    } finally { setBusy(false) }
  }

  const endre = async (licenceId: string, patch: Record<string, unknown>) => {
    const res = await fetch('/api/voice-bank/licences', {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${await token()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ licenceId, ...patch }),
    })
    if (res.ok) await refresh()
    else setError((await res.json()).error || 'Kunne ikke endre')
  }

  const foerAvregning = async (licenceId: string, felt: Record<string, unknown>) => {
    const res = await fetch('/api/voice-bank/licences', {
      method: 'PUT',
      headers: { Authorization: `Bearer ${await token()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ licenceId, ...felt }),
    })
    if (res.ok) { setError(null); await refresh() }
    else setError((await res.json()).error || 'Kunne ikke føre avregningen')
  }

  const avvik = liste && Number(feeCustomer) !== liste.listeNok
    ? Math.round(((Number(feeCustomer) - liste.listeNok) / liste.listeNok) * 100)
    : 0

  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      <Link href={`/dashboard/voice-bank/${actorId}`} className="text-sm text-[var(--ember-deep)] hover:underline">← Tilbake til skuespilleren</Link>
      <h1 className="text-3xl font-bold text-gray-900 mt-3 mb-1">Lisenser</h1>
      <p className="text-gray-600 mb-8 max-w-2xl">
        Bruksretten, ved siden av forbruksmåleren. Takstkortet foreslår prisen — den kan
        overskrives fritt før avtalen inngås, og det avtalte beløpet fryses på raden.
      </p>

      {error && <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      {/* Nytt tilbud */}
      <div className="bg-[var(--paper-raised)] rounded-lg border border-gray-200 p-6 mb-10">
        <h2 className="font-semibold text-gray-900 mb-4">Nytt tilbud</h2>

        <div className="flex gap-2 mb-5">
          {(['campaign', 'work'] as Kind[]).map((k) => (
            <button key={k} onClick={() => { setKind(k); setRort(false) }}
              className="px-4 py-2 rounded-lg text-sm font-semibold border transition-colors"
              style={kind === k
                ? { borderColor: 'var(--ember-deep)', color: 'var(--ember-deep)', background: 'var(--ember-tint-bg)' }
                : { borderColor: '#d1d5db', color: '#374151' }}>
              {k === 'campaign' ? 'Kampanje' : 'Verk'}
            </button>
          ))}
          <span className="text-xs text-gray-500 self-center ml-2">
            {kind === 'campaign'
              ? 'Tidsbegrenset og fornybar — reklame og markedsføring.'
              : 'Engangssum, evigvarende, bundet til verket — film, serie, spill, lydbok.'}
          </span>
        </div>

        <div className="grid sm:grid-cols-2 gap-4 mb-4">
          <Felt label="Aktivum">
            <select value={asset} onChange={(e) => { setAsset(e.target.value); setRort(false) }} className={inputCls}>
              {ASSET.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
            </select>
          </Felt>
          <Felt label="Kunde (fritekst)">
            <input value={customerLabel} onChange={(e) => setCustomerLabel(e.target.value)} placeholder="Produsent eller byrå" className={inputCls} />
          </Felt>

          {kind === 'campaign' ? (
            <>
              <Felt label="Bruksklasse">
                <select value={mediaClass} onChange={(e) => { setMediaClass(e.target.value); setRort(false) }} className={inputCls}>
                  {MEDIA.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
                </select>
              </Felt>
              <Felt label="Territorium">
                <select value={territory} onChange={(e) => { setTerritory(e.target.value); setRort(false) }} className={inputCls}>
                  {TERRITORY.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
                </select>
              </Felt>
              <Felt label="Periode">
                <select value={termMonths} onChange={(e) => { setTermMonths(Number(e.target.value)); setRort(false) }} className={inputCls}>
                  {TERM.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
                </select>
              </Felt>
              <Felt label="Eksklusivitet">
                <select value={exclusivity} onChange={(e) => { setExclusivity(e.target.value); setRort(false) }} className={inputCls}>
                  {EXCL.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
                </select>
              </Felt>
            </>
          ) : (
            <>
              <Felt label="Verkstittel (påkrevd)">
                <input value={workTitle} onChange={(e) => setWorkTitle(e.target.value)} placeholder="Filmens eller seriens tittel" className={inputCls} />
              </Felt>
              <Felt label="Produksjon">
                <select value={productionTier} onChange={(e) => { setProductionTier(e.target.value); setRort(false) }} className={inputCls}>
                  {TIER.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
                </select>
              </Felt>
              <Felt label="Rollens omfang">
                <select value={roleScope} onChange={(e) => { setRoleScope(e.target.value); setRort(false) }} className={inputCls}>
                  {ROLE.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
                </select>
              </Felt>
              <Felt label="Agent / manager (% av honoraret)">
                <input value={agentPct} onChange={(e) => setAgentPct(e.target.value)} placeholder="0" inputMode="decimal" className={inputCls} />
              </Felt>
            </>
          )}
        </div>

        {kind === 'campaign' && (
          <Felt label="Agent / manager (% av honoraret)">
            <input value={agentPct} onChange={(e) => setAgentPct(e.target.value)} placeholder="0" inputMode="decimal" className={`${inputCls} max-w-[200px]`} />
          </Felt>
        )}

        {/* Oppgjørsvalg. For en vokalist ligger den store pengen i at stemmen
            havner på en låt som går — men royalty av en inntekt vi ikke ser er
            et løfte, ikke et produkt. Derfor kanalkravet. */}
        <div className="mt-5 pt-5 border-t border-gray-200">
          <label className="block text-sm font-medium text-gray-700 mb-2">Oppgjør</label>
          <div className="flex gap-2 flex-wrap mb-2">
            {COMP.map(([v, t]) => (
              <button key={v} onClick={() => setCompModel(v as 'fee' | 'royalty' | 'hybrid')}
                className="px-4 py-2 rounded-lg text-sm font-semibold border transition-colors"
                style={compModel === v
                  ? { borderColor: 'var(--ember-deep)', color: 'var(--ember-deep)', background: 'var(--ember-tint-bg)' }
                  : { borderColor: '#d1d5db', color: '#374151' }}>
                {t}
              </button>
            ))}
          </div>
          <p className="text-xs text-gray-500 mb-4">{COMP.find(([v]) => v === compModel)?.[2]}</p>

          {compModel !== 'fee' && (
            <div className="grid sm:grid-cols-3 gap-4">
              <Felt label="Utgivelsen distribueres av">
                <select value={releaseChannel} onChange={(e) => setReleaseChannel(e.target.value)} className={inputCls}>
                  {KANAL.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
                </select>
              </Felt>
              <Felt label="Artistens andel (%)" hint="Av det vi faktisk mottar">
                <input value={royaltyPct} onChange={(e) => setRoyaltyPct(e.target.value)} inputMode="decimal" className={inputCls} />
              </Felt>
              <Felt label="Utgivelsens tittel">
                <input value={releaseTitle} onChange={(e) => setReleaseTitle(e.target.value)} placeholder="Låt eller utgivelse" className={inputCls} />
              </Felt>
            </div>
          )}

          {compModel !== 'fee' && !KONTROLLERT.includes(releaseChannel) && (
            <p className="text-sm mt-3 rounded-lg border px-3 py-2" style={{ borderColor: '#fcd34d', background: '#fffbeb', color: '#92400e' }}>
              Royalty er ikke mulig på annen distribusjon: da ser vi ikke inntekten andelen skal regnes av.
              Velg TrickleTracks eller IndigoBoom, eller gå for fast honorar.
            </p>
          )}

          {compModel !== 'fee' && KONTROLLERT.includes(releaseChannel) && (
            <p className="text-xs text-gray-500 mt-3">
              ⚠️ Strømmeinntekter rapporteres 2–3 måneder på etterskudd. Første avregning kommer derfor
              et kvartal etter utgivelsen — si det til rettighetshaveren nå, ikke når hen spør.
            </p>
          )}
        </div>

        {/* Beløpene — forhåndsutfylt, fritt overstyrbare */}
        <div className="grid sm:grid-cols-2 gap-4 mt-5 pt-5 border-t border-gray-200">
          <Felt label="Kundepris" hint={liste ? `Takstkortet foreslår ${nok(liste.listeNok)}` : undefined}>
            <input value={feeCustomer} onChange={(e) => { setFeeCustomer(e.target.value); setRort(true) }} inputMode="decimal" className={inputCls} />
          </Felt>
          <Felt label="Til rettighetshaver (brutto)" hint={liste ? `Forslag ${nok(liste.honorarNok)}` : undefined}>
            <input value={feeActor} onChange={(e) => { setFeeActor(e.target.value); setRort(true) }} inputMode="decimal" className={inputCls} />
          </Felt>
        </div>

        {avvik !== 0 && (
          <p className="text-xs mt-2" style={{ color: avvik < 0 ? '#b45309' : '#047857' }}>
            {avvik > 0 ? '+' : ''}{avvik} % mot listepris. Avviket lagres, så kortet kan justeres etter virkeligheten.
          </p>
        )}

        <Forhaandsvisning feeCustomer={Number(feeCustomer) || 0} feeActor={Number(feeActor) || 0} agentPct={Number(agentPct) || 0} />

        <button onClick={opprett}
          disabled={busy || (kind === 'work' && !workTitle.trim()) || (compModel !== 'fee' && !KONTROLLERT.includes(releaseChannel))}
          className="mt-5 px-5 py-2.5 rounded-lg font-semibold text-[var(--on-ember)] bg-[var(--ember-deep)] hover:opacity-90 disabled:opacity-50">
          {busy ? 'Oppretter …' : 'Opprett tilbud'}
        </button>
        {kind === 'work' && !workTitle.trim() && (
          <p className="text-xs text-gray-500 mt-2">Verkstittel mangler — evigheten er bundet til verket, så den kan ikke stå tom.</p>
        )}
      </div>

      {/* Eksisterende */}
      <h2 className="font-semibold text-gray-900 mb-3">Registrerte lisenser</h2>
      {laster ? <p className="text-gray-500">Laster …</p>
        : licences.length === 0 ? <p className="text-gray-500">Ingen lisenser ennå.</p>
        : (
          <div className="space-y-4">
            {licences.map((l) => (
              <LisensKort key={l.id} l={l} onEndre={endre} onAvregning={foerAvregning} />
            ))}
          </div>
        )}
    </div>
  )
}

const inputCls = 'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm'

function Felt({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      {children}
      {hint && <p className="text-xs text-gray-400 mt-1">{hint}</p>}
    </div>
  )
}

/**
 * Fordelingen før lagring. Poenget med å vise den her: den gjør synlig at et
 * nedforhandlet honorar uten tilsvarende kutt i kundeprisen er en overføring
 * til byrået — ikke en besparelse for kunden.
 */
function Forhaandsvisning({ feeCustomer, feeActor, agentPct }: { feeCustomer: number; feeActor: number; agentPct: number }) {
  const infra = Math.round(feeCustomer * 0.03 * 100) / 100
  const byraa = Math.round((feeCustomer - feeActor - infra) * 100) / 100
  const agent = Math.round(feeActor * (agentPct / 100) * 100) / 100
  const netto = Math.round((feeActor - agent) * 100) / 100
  return (
    <div className="mt-4 rounded-lg border border-gray-200 bg-white/60 p-4 text-sm">
      <div className="grid sm:grid-cols-2 gap-x-8 gap-y-1">
        <Rad t="Kunden betaler" v={feeCustomer} sterk />
        <Rad t="Rettighetshaver, brutto" v={feeActor} />
        <Rad t="Infrastrukturavgift (3 %)" v={infra} />
        {agent > 0 && <Rad t={`Agent / manager (${agentPct} % av honoraret)`} v={agent} />}
        <Rad t="Til den som har avtalen" v={byraa} advarsel={byraa < 0} />
        <Rad t="Rettighetshaver, netto" v={netto} sterk />
      </div>
      {byraa < 0 && (
        <p className="text-xs text-amber-700 mt-2">Kundeprisen dekker ikke det som er lovet bort.</p>
      )}
    </div>
  )
}

function Rad({ t, v, sterk, advarsel }: { t: string; v: number; sterk?: boolean; advarsel?: boolean }) {
  return (
    <div className="flex justify-between gap-4">
      <span className={sterk ? 'font-medium text-gray-900' : 'text-gray-600'}>{t}</span>
      <span className={`tabular-nums ${advarsel ? 'text-amber-700' : sterk ? 'font-semibold text-gray-900' : 'text-gray-700'}`}>{nok(v)}</span>
    </div>
  )
}

function LisensKort({ l, onEndre, onAvregning }: {
  l: Licence
  onEndre: (id: string, p: Record<string, unknown>) => Promise<void>
  onAvregning: (id: string, p: Record<string, unknown>) => Promise<void>
}) {
  const [rediger, setRediger] = useState(false)
  const [kp, setKp] = useState(String(l.fee_customer_nok))
  const [hp, setHp] = useState(String(l.fee_actor_nok))
  const [avr, setAvr] = useState(false)
  const [pFra, setPFra] = useState('')
  const [pTil, setPTil] = useState('')
  const [netto, setNetto] = useState('')

  const omfang = l.kind === 'campaign'
    ? [MEDIA.find(([v]) => v === l.media_class)?.[1], TERRITORY.find(([v]) => v === l.territory)?.[1],
       l.term_end ? `til ${l.term_end}` : 'evig', l.exclusivity !== 'none' ? EXCL.find(([v]) => v === l.exclusivity)?.[1] : null]
    : [l.work_title, TIER.find(([v]) => v === l.production_tier)?.[1], ROLE.find(([v]) => v === l.role_scope)?.[1], 'evig, bundet til verket']

  return (
    <div className="bg-[var(--paper-raised)] rounded-lg border border-gray-200 p-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full"
              style={{ background: 'var(--ember-tint-bg)', color: 'var(--ember-deep)' }}>
              {l.kind === 'campaign' ? 'Kampanje' : 'Verk'}
            </span>
            <span className="text-xs font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full border border-gray-300 text-gray-600">
              {STATUS_TEKST[l.status] || l.status}
            </span>
            {l.customer_label && <span className="text-sm text-gray-600">{l.customer_label}</span>}
          </div>
          <p className="text-sm text-gray-700 mt-2">{omfang.filter(Boolean).join(' · ')}</p>
        </div>
        <div className="text-right">
          <div className="font-semibold text-gray-900 tabular-nums">{nok(l.fee_customer_nok)}</div>
          <div className="text-xs text-gray-500 tabular-nums">
            {nok(l.fee_actor_nok)} til rettighetshaver
            {l.list_fee_customer_nok != null && l.list_fee_customer_nok !== l.fee_customer_nok && (
              <> · liste {nok(l.list_fee_customer_nok)}</>
            )}
          </div>
        </div>
      </div>

      {l.splits.length > 0 && (
        <div className="mt-4 pt-3 border-t border-gray-200 grid sm:grid-cols-2 gap-x-8 gap-y-1 text-sm">
          {l.splits.map((s, i) => (
            <div key={i} className="flex justify-between gap-4">
              <span className="text-gray-600">
                {s.party_label || s.party_type}
                <span className="text-gray-400 text-xs"> · {s.basis === 'actor_fee' ? 'av honoraret' : 'av kundeprisen'}</span>
              </span>
              <span className="tabular-nums text-gray-700">{nok(s.amount_nok)}</span>
            </div>
          ))}
        </div>
      )}

      {/* Royalty: oppgjørsform, kanal, og avregningene som er ført */}
      {l.comp_model !== 'fee' && (
        <div className="mt-3 pt-3 border-t border-gray-200 text-sm">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="text-gray-700">
              <strong>{l.comp_model === 'royalty' ? 'Kun royalty' : 'Kombinasjon'}</strong>
              {' — '}{l.royalty_pct} % av det vi mottar
              {l.release_channel && <span className="text-gray-500"> · {KANAL.find(([v]) => v === l.release_channel)?.[1]}</span>}
              {l.release_title && <span className="text-gray-500"> · {l.release_title}</span>}
            </div>
            <button onClick={() => setAvr((v) => !v)} className="text-sm text-[var(--ember-deep)] hover:underline">
              {avr ? 'Avbryt' : 'Før avregning'}
            </button>
          </div>

          {avr && (
            <div className="mt-3 flex gap-2 flex-wrap items-center">
              <input type="date" value={pFra} onChange={(e) => setPFra(e.target.value)}
                className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm" />
              <input type="date" value={pTil} onChange={(e) => setPTil(e.target.value)}
                className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm" />
              <input value={netto} onChange={(e) => setNetto(e.target.value)} inputMode="decimal" placeholder="Mottatt i perioden"
                className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm w-44" />
              <button
                disabled={!pFra || !pTil || !(Number(netto) >= 0)}
                onClick={async () => {
                  await onAvregning(l.id, { periodStart: pFra, periodEnd: pTil, netReceiptsNok: Number(netto), source: l.release_channel })
                  setAvr(false); setPFra(''); setPTil(''); setNetto('')
                }}
                className="px-3 py-1.5 rounded-lg text-sm font-semibold text-[var(--on-ember)] bg-[var(--ember-deep)] disabled:opacity-50">
                Før
              </button>
              <span className="text-xs text-gray-500">
                Grunnlaget er det vi faktisk mottok, ikke brutto fra tjenestene.
              </span>
            </div>
          )}

          {l.statements?.length > 0 && (
            <div className="mt-3">
              {l.statements.map((s) => (
                <div key={s.id} className="flex justify-between gap-4 text-gray-600">
                  <span>{s.period_start} – {s.period_end}{s.source ? ` · ${s.source}` : ''}
                    <span className="text-gray-400"> · grunnlag {nok(s.net_receipts_nok)} · {s.artist_pct} %</span></span>
                  <span className="tabular-nums text-gray-700">{nok(s.artist_nok)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {l.steps.length > 0 && (
        <div className="mt-3 pt-3 border-t border-gray-200 text-sm">
          <div className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">Etterbetaling</div>
          {l.steps.map((s) => (
            <div key={s.id} className="flex justify-between gap-4">
              <span className="text-gray-600">{s.label || s.trigger_kind} <span className="text-gray-400 text-xs">· {s.status}</span></span>
              <span className="tabular-nums text-gray-700">{nok(s.amount_nok)}</span>
            </div>
          ))}
        </div>
      )}

      <div className="mt-4 flex gap-2 flex-wrap items-center">
        {rediger ? (
          <>
            <input value={kp} onChange={(e) => setKp(e.target.value)} inputMode="decimal"
              className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm w-32" placeholder="Kundepris" />
            <input value={hp} onChange={(e) => setHp(e.target.value)} inputMode="decimal"
              className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm w-32" placeholder="Honorar" />
            <button onClick={async () => { await onEndre(l.id, { feeCustomerNok: Number(kp), feeActorNok: Number(hp) }); setRediger(false) }}
              className="px-3 py-1.5 rounded-lg text-sm font-semibold text-[var(--on-ember)] bg-[var(--ember-deep)]">Lagre</button>
            <button onClick={() => setRediger(false)} className="text-sm text-gray-500 hover:underline">Avbryt</button>
            <span className="text-xs text-gray-500">Fordelingen regnes om for alle parter.</span>
          </>
        ) : (
          <button onClick={() => setRediger(true)} className="text-sm text-[var(--ember-deep)] hover:underline">Endre beløp</button>
        )}
        {l.status === 'quote' && !rediger && (
          <button onClick={() => onEndre(l.id, { status: 'active' })}
            className="text-sm text-[var(--ember-deep)] hover:underline ml-auto">Marker som inngått</button>
        )}
      </div>
    </div>
  )
}
