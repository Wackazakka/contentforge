'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { getSupabase } from '@/lib/supabaseClient'
import { STANDARD_VILKAAR_TEKST } from '@/lib/standardLisens'

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
//
// Fra 28.10 lenkes sida fra profilen, Stemmer-fanen og audition
// (lib/lisensLenke). Det vi alt vet, kommer med i adressen (?tittel, ?type,
// ?asset) og fylles inn. Er besøkeren ikke innlogget, sier sida det og sender
// hen tilbake hit etter innlogging — i stedet for å feile ved innsending.

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

// Verkets akser (078/124) — de samme takstkortet priser verk etter.
const VERK_AKSER = {
  productionTier: {
    etikett: 'Hva slags produksjon',
    valg: [
      ['short', 'Kortfilm eller studentproduksjon'],
      ['national', 'Norsk film, serie eller spill'],
      ['major', 'Stor nordisk produksjon'],
      ['international', 'Internasjonal produksjon'],
    ],
  },
  roleScope: {
    etikett: 'Hvor stor er rollen',
    valg: [
      ['line', 'Replikk eller kort innslag'],
      ['supporting', 'Birolle'],
      ['lead', 'Hovedrolle'],
    ],
  },
} as const

type Svar = { assetType: string; mediaClass: string; territory: string; exclusivity: string }
type VerkSvar = { productionTier: string; roleScope: string }
type Type = 'campaign' | 'work'

interface Forespoersel {
  id: string
  actor_id: string
  asset_type: string
  kind?: Type | null
  production_title?: string | null
  media_class: string | null
  territory: string | null
  term_months: number | null
  exclusivity: string | null
  status: string
  created_at: string
}

// Standardlisens (128): det rettighetshaveren har sagt ja til på forhånd.
type Tilbud = {
  available: boolean; reason: string | null; priceNok: number | null
  terms: { assets: string[]; media: string[]; territories: string[]; maxTermMonths: number } | null
}
type Lisens = {
  id: string; kind: string; asset: string; mediaClass: string | null; territory: string | null
  termStart: string | null; termEnd: string | null; workTitle: string | null; priceNok: number; status: string; source: string
}
const NAVN: Record<string, string> = {
  voice: 'stemmen', face: 'ansiktet', both: 'stemme og ansikt',
  internal: 'intern bruk', online: 'nett', broadcast: 'kringkasting',
  no: 'Norge', nordic: 'Norden', world: 'hele verden',
}
const nok = (n: number) => `${n.toLocaleString('nb-NO')} kr`
const dato = (s: string | null) => (s ? new Date(s).toLocaleDateString('nb-NO') : 'uten sluttdato')

export default function BeOmLisensPage() {
  const actorId = String(useParams().actorId || '')
  const [navn, setNavn] = useState<string | null>(null)
  // TLID (111): referansen lisensen vil henge på — den kunden skriver i kontrakten.
  const [tlid, setTlid] = useState<string | null>(null)
  const [svar, setSvar] = useState<Svar>({ assetType: 'voice', mediaClass: 'online', territory: 'no', exclusivity: 'none' })
  const [termMonths, setTermMonths] = useState(12)
  // Én forespørsel per produksjon (124): type og navn skiller dem.
  const [type, setType] = useState<Type>('campaign')
  const [tittel, setTittel] = useState('')
  const [verk, setVerk] = useState<VerkSvar>({ productionTier: 'national', roleScope: 'supporting' })
  const [note, setNote] = useState('')
  const [mine, setMine] = useState<Forespoersel[]>([])
  // Admin ser en snarvei inn i banken: samme doer betjener begge roller, og
  // produksjonsflaten slipper to ekstra nettverkskall for aa vite hvem som ser.
  const [erAdmin, setErAdmin] = useState(false)
  const [busy, setBusy] = useState(false)
  // Navnet på produksjonen som sist ble sendt — skjemaet står åpent for neste.
  const [sendt, setSendt] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  // null = vet ikke ennå; false = ingen sesjon, vis innlogging i stedet for skjemaet.
  const [innlogget, setInnlogget] = useState<boolean | null>(null)
  const [tilbud, setTilbud] = useState<Tilbud | null>(null)
  const [lisenser, setLisenser] = useState<Lisens[]>([])
  const [godtatt, setGodtatt] = useState(false)
  const [kjoept, setKjoept] = useState<{ priceNok: number; termStart: string; termEnd: string | null } | null>(null)

  // Forhåndsutfylling fra lenken (lib/lisensLenke). Ingen synkron setState i
  // effekten — verdiene settes via et løfte.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search)
    const t0 = (q.get('tittel') || '').slice(0, 200)
    const ty = q.get('type')
    const as = q.get('asset')
    Promise.resolve().then(() => {
      if (t0) setTittel(t0)
      if (ty === 'campaign' || ty === 'work') setType(ty)
      if (as === 'voice' || as === 'face' || as === 'both') setSvar((s) => ({ ...s, assetType: as }))
    })
  }, [])

  const headers = useCallback(async (): Promise<Record<string, string>> => {
    const { data } = await getSupabase().auth.getSession()
    const token = data?.session?.access_token
    return token ? { Authorization: `Bearer ${token}` } : {}
  }, [])

  const hent = useCallback(async () => {
    const h = await headers()
    setInnlogget(!!h.Authorization)
    try {
      const k = await fetch('/api/voice-bank/catalog', { headers: h }).then((r) => r.json())
      const a = (k.actors || []).find((x: { id: string }) => x.id === actorId)
      if (a?.name) setNavn(a.name)
      if (a?.tlid) setTlid(a.tlid)
    } catch { /* navnet er pynt; skjemaet virker uten */ }
    try {
      const d = await fetch(`/api/licence-requests?actorId=${encodeURIComponent(actorId)}`, { headers: h }).then((r) => r.json())
      setMine(d.requests || [])
      setErAdmin(!!d.isAdmin)
    } catch { /* ingen tidligere å vise */ }
  }, [actorId, headers])

  useEffect(() => { hent() }, [hent])

  // Standardlisens: spør på nytt når valgene endres. Bare kampanjer kan være
  // standard; et verk er alltid en forespørsel.
  const hentTilbud = useCallback(async () => {
    const h = await headers()
    if (!h.Authorization) return
    const q = new URLSearchParams({
      actorId, kind: type, asset: svar.assetType, mediaClass: svar.mediaClass, territory: svar.territory,
      termMonths: String(termMonths), exclusivity: svar.exclusivity,
    })
    try {
      const d = await fetch(`/api/licences/standard?${q}`, { headers: h }).then((r) => r.json())
      setTilbud(d && 'available' in d ? d : null)
      setLisenser(Array.isArray(d?.myLicences) ? d.myLicences : [])
    } catch { setTilbud(null) }
  }, [actorId, type, svar, termMonths, headers])
  // Via et løfte: ingen setState i selve effekten.
  useEffect(() => { void Promise.resolve().then(hentTilbud) }, [hentTilbud])

  const kjoep = async () => {
    setError(null)
    if (!godtatt) { setError('Kryss av for standardvilkårene.'); return }
    setBusy(true)
    try {
      const res = await fetch('/api/licences/standard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await headers()) },
        body: JSON.stringify({
          actorId, kind: 'campaign', asset: svar.assetType, mediaClass: svar.mediaClass, territory: svar.territory,
          termMonths, exclusivity: svar.exclusivity, productionTitle: tittel || null, termsText: STANDARD_VILKAAR_TEKST.no,
        }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'Lisensen kunne ikke kjøpes')
      setKjoept({ priceNok: d.priceNok, termStart: d.termStart, termEnd: d.termEnd })
      setLisenser(Array.isArray(d.myLicences) ? d.myLicences : [])
      setGodtatt(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Lisensen kunne ikke kjøpes')
    } finally {
      setBusy(false)
    }
  }

  const send = async () => {
    setError(null)
    if (!tittel.trim()) { setError(type === 'work' ? 'Skriv tittelen på verket.' : 'Gi kampanjen et navn.'); return }
    setBusy(true)
    try {
      const res = await fetch('/api/licence-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await headers()) },
        body: JSON.stringify(type === 'work'
          ? { actorId, kind: 'work', productionTitle: tittel, assetType: svar.assetType, ...verk, note: note || null }
          : { actorId, kind: 'campaign', productionTitle: tittel, ...svar, termMonths, note: note || null }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'Forespørselen kom ikke fram')
      setSendt(tittel.trim())
      setTittel(''); setNote('')
      await hent()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }


  return (
    <div className="min-h-screen bg-[var(--paper)]">
      <div className="max-w-2xl mx-auto px-4 py-8">
        <Link href="/dashboard" className="text-[var(--ember-deep)] hover:text-[var(--ink)] mb-4 inline-block">← Tilbake</Link>
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          Be om lisens{navn ? ` på ${navn}` : ''}
        </h1>
        {tlid && (
          <p className="text-sm text-gray-500 mb-2">
            TLID <span className="font-mono font-semibold text-gray-900 select-all">{tlid}</span> — referansen lisensen henger på
          </p>
        )}
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

        {kjoept && (
          <div className="mb-8 p-4 rounded-lg" style={{ background: 'var(--ember-tint-bg)', border: '2px solid var(--ember-deep)' }}>
            <p className="text-sm text-gray-900 m-0">
              <strong>Lisensen er aktiv</strong> fra {dato(kjoept.termStart)} til {dato(kjoept.termEnd)}. {nok(kjoept.priceNok)} er trukket fra saldoen.
              Rettighetshaveren har fått beskjed, og all bruk under lisensen føres i hovedboken.
            </p>
          </div>
        )}

        {sendt && (
          <div className="mb-8 p-4 rounded-lg" style={{ background: 'var(--ember-tint-bg)', border: '2px solid var(--ember-deep)' }}>
            <p className="text-sm text-gray-900 m-0">
              <strong>Forespørselen om «{sendt}» er mottatt.</strong> Vi kommer tilbake med et tilbud på
              bruksretten. Trenger dere samme rettighetshaver i en annen produksjon, kan dere sende en ny forespørsel under.
            </p>
          </div>
        )}

        {innlogget === false && (() => {
          const her = typeof window !== 'undefined' ? window.location.pathname + window.location.search : `/dashboard/be-om-lisens/${actorId}`
          return (
            <div className="bg-[var(--paper-raised)] rounded-lg border border-gray-200 p-6 mb-8">
              <p className="text-sm text-gray-700 mb-4">
                Logg inn for å be om lisens. Har du ikke konto, lager du en på et minutt — du kommer tilbake hit etterpå.
              </p>
              <div className="flex flex-wrap gap-3">
                <Link href={`/login?next=${encodeURIComponent(her)}`}
                  className="px-5 py-2.5 rounded-lg font-semibold text-[var(--on-ember)] bg-[var(--ember-deep)] hover:bg-[var(--ink)]">
                  Logg inn
                </Link>
                <Link href={`/register?next=${encodeURIComponent(her)}`}
                  className="px-5 py-2.5 rounded-lg font-semibold border border-gray-300 text-gray-800 hover:border-gray-500">
                  Opprett konto
                </Link>
              </div>
            </div>
          )
        })()}

        {innlogget !== false && (
          <div className="bg-[var(--paper-raised)] rounded-lg border border-gray-200 p-6 mb-8">
            <fieldset className="mb-5">
              <legend className="text-sm font-medium text-gray-700 mb-2">Hva slags bruk</legend>
              {([['campaign', 'Kampanje — reklame og markedsføring, for en periode'], ['work', 'Verk — film, serie, spill eller lydbok']] as Array<[Type, string]>).map(([v, tekst]) => (
                <label key={v} className="flex items-start gap-2 mb-1.5 text-sm text-gray-700 cursor-pointer">
                  <input type="radio" name="type" checked={type === v} onChange={() => setType(v)} className="mt-0.5 h-4 w-4" />
                  <span>{tekst}</span>
                </label>
              ))}
            </fieldset>

            <label className="block text-sm font-medium text-gray-700 mb-1">
              {type === 'work' ? 'Tittelen på verket' : 'Navnet på kampanjen'}
            </label>
            <input value={tittel} onChange={(e) => setTittel(e.target.value)} maxLength={200}
              placeholder={type === 'work' ? 'F.eks. «Fjellet» (arbeidstittel)' : 'F.eks. «Vårkampanje 2027»'}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm mb-1" />
            <p className="text-xs text-gray-400 mb-5">
              Én forespørsel per produksjon. Navnet skiller dem, så dere kan be om samme rettighetshaver til flere.
            </p>

            {(Object.entries(AKSER).filter(([felt]) => type === 'campaign' || felt === 'assetType') as Array<[keyof Svar, typeof AKSER[keyof typeof AKSER]]>).map(([felt, spec]) => (
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

            {type === 'campaign' ? (
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
            ) : (
              (Object.entries(VERK_AKSER) as Array<[keyof VerkSvar, typeof VERK_AKSER[keyof typeof VERK_AKSER]]>).map(([felt, spec]) => (
                <fieldset key={felt} className="mb-5">
                  <legend className="text-sm font-medium text-gray-700 mb-2">{spec.etikett}</legend>
                  {spec.valg.map(([verdi, tekst]) => (
                    <label key={verdi} className="flex items-start gap-2 mb-1.5 text-sm text-gray-700 cursor-pointer">
                      <input type="radio" name={felt} checked={verk[felt] === verdi}
                        onChange={() => setVerk((s) => ({ ...s, [felt]: verdi }))} className="mt-0.5 h-4 w-4" />
                      <span>{tekst}</span>
                    </label>
                  ))}
                </fieldset>
              ))
            )}

            {/* Standardlisens (128). Ligger valget innenfor det rettighetshaveren
                har sagt ja til, kan kunden få lisensen med en gang. Ellers står
                grunnen her, og forespørselen under er veien videre. */}
            {type === 'campaign' && tilbud?.terms && (
              tilbud.available && tilbud.priceNok != null ? (
                <div className="mb-5 p-4 rounded-lg border-2" style={{ borderColor: 'var(--ember-deep)' }}>
                  <p className="text-sm font-semibold text-gray-900 mb-1">Standardlisens: {nok(tilbud.priceNok)}</p>
                  <p className="text-sm text-gray-600 mb-3">
                    Rettighetshaveren har sagt ja til denne bruken på forhånd. Du får lisensen med en gang, og prisen trekkes fra saldoen.
                  </p>
                  <label className="flex items-start gap-2 text-xs text-gray-600 mb-3">
                    <input type="checkbox" checked={godtatt} onChange={(e) => setGodtatt(e.target.checked)} className="mt-0.5" />
                    <span>{STANDARD_VILKAAR_TEKST.no}</span>
                  </label>
                  <button onClick={kjoep} disabled={busy || !godtatt}
                    className="px-5 py-2.5 rounded-lg font-semibold text-[var(--on-ember)] bg-[var(--ember-deep)] hover:bg-[var(--ink)] disabled:opacity-50 transition-colors">
                    {busy ? 'Ordner lisensen …' : `Få lisensen nå — ${nok(tilbud.priceNok)}`}
                  </button>
                  <p className="text-xs text-gray-400 mt-2">Vil du noe annet enn dette, send en forespørsel under.</p>
                </div>
              ) : (
                <p className="mb-5 text-xs text-gray-500">
                  Standardlisens finnes for {tilbud.terms.media.map((m) => NAVN[m]).join(' og ')} i {tilbud.terms.territories.map((t) => NAVN[t]).join(' og ')},
                  opptil {tilbud.terms.maxTermMonths} måneder, uten eksklusivitet. {tilbud.reason ? `Valget ditt: ${tilbud.reason}` : ''}
                </p>
              )
            )}

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

        {lisenser.length > 0 && (
          <>
            <h2 className="font-semibold text-gray-900 mb-3">Lisensene dine</h2>
            <div className="space-y-2 mb-8">
              {lisenser.map((l) => (
                <div key={l.id} className="flex items-center justify-between bg-[var(--paper-raised)] border border-gray-200 rounded-lg px-4 py-3 gap-3">
                  <div className="text-sm text-gray-700">
                    {l.kind === 'work' ? <>Verk{l.workTitle ? <> — <strong>«{l.workTitle}»</strong></> : null}</>
                      : <>{NAVN[l.asset] ?? l.asset} · {NAVN[l.mediaClass ?? ''] ?? l.mediaClass} · {NAVN[l.territory ?? ''] ?? l.territory}</>}
                    <span className="block text-xs text-gray-500">
                      {l.kind === 'campaign' ? `${dato(l.termStart)} – ${dato(l.termEnd)} · ` : ''}{nok(l.priceNok)}{l.source === 'standard' ? ' · standardlisens' : ''}
                    </span>
                  </div>
                  <span className="text-xs px-3 py-1 rounded-full font-medium bg-gray-100 text-gray-700 whitespace-nowrap">
                    {l.status === 'active' ? 'Aktiv' : l.status === 'quote' ? 'Tilbud' : 'Utløpt'}
                  </span>
                </div>
              ))}
            </div>
          </>
        )}

        {mine.length > 0 && (
          <>
            <h2 className="font-semibold text-gray-900 mb-3">Dine forespørsler</h2>
            <div className="space-y-2">
              {mine.map((m) => (
                <div key={m.id} className="flex items-center justify-between bg-[var(--paper-raised)] border border-gray-200 rounded-lg px-4 py-3">
                  <div className="text-sm text-gray-700">
                    {new Date(m.created_at).toLocaleDateString('nb-NO')} — {m.production_title ? <strong>«{m.production_title}»</strong> : null}{m.production_title ? ' · ' : ''}
                    {m.kind === 'work' ? 'verk' : <>{m.media_class} · {m.territory} · {m.term_months === 0 ? 'uten sluttdato' : `${m.term_months} mnd`}</>}
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
