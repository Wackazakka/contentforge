'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { useTranslations, useLocale } from 'next-intl'
import { useParams } from 'next/navigation'
import { getSupabase } from '@/lib/supabaseClient'

// Skuespiller-side: hva stemmen er brukt til og hva den har generert, per måned
// og per brukstype — pluss redigering av takstene. Samme admin-gating som banken.

interface ActorDetail {
  id: string
  name: string
  elevenlabs_voice_id: string
  honorarium_nok: number
  actor_rate_nok: number
  customer_price_nok: number
  rates: Record<string, { actor_rate_nok: number; customer_price_nok: number }> | null
  face_character_id: string | null
  is_exclusive: boolean
  is_public: boolean
  is_demo: boolean
  bio: string | null
  photo_urls: string[]
  sample_urls: string[]
  actor_email: string | null
  library_enabled: boolean
  subscription_covered: boolean
  discount_tiers: Array<{ from_uses: number; discount_pct: number }>
  is_active: boolean
  created_at: string
}

interface Agg { key: string; uses: number; to_actor_nok: number; from_customers_nok: number }

// Brukstypene er API-kontrakt; bare etikettene oversettes.
const BCP47: Record<string, string> = { no: 'nb-NO', en: 'en-GB' }
const KINDS = ['video', 'avatar', 'radio', 'face']

export default function VoiceActorPage() {
  const t = useTranslations('actorAdmin')
  const locale = useLocale()
  const nok = (n: number) => `${(Math.round(n * 100) / 100).toLocaleString(BCP47[locale] || 'en-GB')} kr`
  const kindLabel = (k: string) => (t.has(`kind_${k}`) ? t(`kind_${k}`) : k)
  const params = useParams()
  const actorId = String(params.actorId || '')

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actor, setActor] = useState<ActorDetail | null>(null)
  const [events, setEvents] = useState<Array<{ id: number; actor_rate_nok: number; customer_price_nok: number; meta: { kind?: string }; created_at: string }>>([])
  const [byMonth, setByMonth] = useState<Agg[]>([])
  const [byKind, setByKind] = useState<Agg[]>([])
  const [fees, setFees] = useState<{ infraPct: number; licensePct: number; licenseTo: string | null } | null>(null)
  const [totalInfraNok, setTotalInfraNok] = useState(0)
  const [totalLicenseNok, setTotalLicenseNok] = useState(0)

  // Takst-redigering: standard + per brukstype ('' = bruk standard)
  const [editRate, setEditRate] = useState('')
  const [editPrice, setEditPrice] = useState('')
  const [editKinds, setEditKinds] = useState<Record<string, { rate: string; price: string }>>({})
  const [editFaceId, setEditFaceId] = useState('')
  const [editBio, setEditBio] = useState('')
  const [editEmail, setEditEmail] = useState('')
  const [editVoiceId, setEditVoiceId] = useState('')
  const [editSubsCovered, setEditSubsCovered] = useState(false)
  const [customers, setCustomers] = useState<Array<{ id: string; name: string; mode: string; timeoutHours: number }>>([])
  const [apprBusy, setApprBusy] = useState<string | null>(null)
  const [earnings, setEarnings] = useState<Array<{ id: number; source: string; period: string; gross_nok: number; note: string | null }>>([])
  const [earnPeriod, setEarnPeriod] = useState('')
  const [earnGross, setEarnGross] = useState('')
  const [earnBusy, setEarnBusy] = useState(false)
  // Oppgjør: opptjent (summert i DB, ikke over radtaket) − utbetalt = til gode
  const [payouts, setPayouts] = useState<Array<{ id: string; periode_fra: string; periode_til: string; amount_nok: number; betalt_dato: string; note: string | null }>>([])
  const [earnedNok, setEarnedNok] = useState(0)
  const [paidNok, setPaidNok] = useState(0)
  const [dueNok, setDueNok] = useState(0)
  const [poFra, setPoFra] = useState('')
  const [poTil, setPoTil] = useState('')
  const [poBelop, setPoBelop] = useState('')
  const [poNotat, setPoNotat] = useState('')
  const [poBusy, setPoBusy] = useState(false)
  const [origin, setOrigin] = useState('')
  const [uploadBusy, setUploadBusy] = useState<string | null>(null)
  const [saveBusy, setSaveBusy] = useState(false)
  const [saveMsg, setSaveMsg] = useState<string | null>(null)
  const [saveOk, setSaveOk] = useState(false)

  const authedFetch = async (init?: RequestInit) => {
    const { data: sess } = await getSupabase().auth.getSession()
    const token = sess?.session?.access_token
    if (!token) throw new Error('Ikke innlogget')
    return fetch(`/api/voice-bank/admin?actorId=${actorId}`, {
      ...init,
      headers: { ...(init?.headers || {}), Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    })
  }

  const refresh = useCallback(async () => {
    try {
      const res = await authedFetch()
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Kunne ikke hente skuespilleren'); return }
      setError(null)
      setOrigin(window.location.origin)
      setActor(data.actor)
      setEvents(data.events || [])
      setByMonth(data.byMonth || [])
      setByKind(data.byKind || [])
      setFees(data.fees || null)
      setTotalInfraNok(Number(data.totalInfraNok) || 0)
      setTotalLicenseNok(Number(data.totalLicenseNok) || 0)
      setEditRate(String(data.actor.actor_rate_nok))
      setEditPrice(String(data.actor.customer_price_nok))
      const ek: Record<string, { rate: string; price: string }> = {}
      for (const k of KINDS) {
        const r = data.actor.rates?.[k]
        ek[k] = r ? { rate: String(r.actor_rate_nok), price: String(r.customer_price_nok) } : { rate: '', price: '' }
      }
      setEditKinds(ek)
      setEditFaceId(data.actor.face_character_id || '')
      setEditBio(data.actor.bio || '')
      setEditEmail(data.actor.actor_email || '')
      setEditVoiceId(data.actor.elevenlabs_voice_id || '')
      setEditSubsCovered(!!data.actor.subscription_covered)
      try {
        const { data: sess2 } = await getSupabase().auth.getSession()
        const t2 = sess2?.session?.access_token
        if (t2) {
          const ar = await fetch(`/api/voice-bank/approvals?actorId=${actorId}`, { headers: { Authorization: `Bearer ${t2}` } })
          const ad = await ar.json()
          if (ar.ok) setCustomers(ad.customers || [])
        }
      } catch { /* godkjenningsdata er valgfritt */ }
      try {
        const { data: sess3 } = await getSupabase().auth.getSession()
        const t3 = sess3?.session?.access_token
        if (t3) {
          const er = await fetch(`/api/voice-bank/external-earnings?actorId=${actorId}`, { headers: { Authorization: `Bearer ${t3}` } })
          const ed = await er.json()
          if (er.ok) setEarnings(ed.earnings || [])
        }
      } catch { /* eksterne inntekter er valgfritt */ }
      try {
        const { data: sess4 } = await getSupabase().auth.getSession()
        const t4 = sess4?.session?.access_token
        if (t4) {
          const pr = await fetch(`/api/voice-bank/payouts?actorId=${actorId}`, { headers: { Authorization: `Bearer ${t4}` } })
          const pd = await pr.json()
          if (pr.ok) {
            setPayouts(pd.payouts || [])
            setEarnedNok(Number(pd.earnedNok) || 0)
            setPaidNok(Number(pd.paidNok) || 0)
            setDueNok(Number(pd.dueNok) || 0)
          }
        }
      } catch { /* oppgjør er valgfritt inntil migrasjon 068 er kjørt */ }
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actorId])

  useEffect(() => { refresh() }, [refresh])

  const saveRates = async () => {
    setSaveMsg(null); setSaveOk(false)
    if (editRate === '' || editPrice === '' || isNaN(Number(editRate)) || isNaN(Number(editPrice))) {
      setSaveMsg(t('err_std_numbers')); return
    }
    const rates: Record<string, { actor_rate_nok: number; customer_price_nok: number }> = {}
    for (const k of KINDS) {
      const v = editKinds[k]
      if (!v || (v.rate === '' && v.price === '')) continue
      if (v.rate === '' || v.price === '' || isNaN(Number(v.rate)) || isNaN(Number(v.price))) {
        setSaveMsg(t('err_kind_pair', { kind: kindLabel(k) })); return
      }
      rates[k] = { actor_rate_nok: Number(v.rate), customer_price_nok: Number(v.price) }
    }
    setSaveBusy(true)
    try {
      const res = await authedFetch({
        method: 'PATCH',
        body: JSON.stringify({ actorId, actorRateNok: Number(editRate), customerPriceNok: Number(editPrice), rates, faceCharacterId: editFaceId.trim(), actorEmail: editEmail.trim(), elevenlabsVoiceId: editVoiceId.trim(), subscriptionCovered: editSubsCovered }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || t('err_save'))
      setSaveMsg(t('saved')); setSaveOk(true)
      await refresh()
    } catch (err: any) {
      setSaveMsg(err.message)
    } finally {
      setSaveBusy(false)
    }
  }

  const toggleExclusive = async () => {
    if (!actor) return
    try {
      const res = await authedFetch({ method: 'PATCH', body: JSON.stringify({ actorId, isExclusive: !(actor.is_exclusive !== false) }) })
      if (res.ok) await refresh()
    } catch { /* behold visning */ }
  }

  const togglePublic = async () => {
    if (!actor) return
    try {
      const res = await authedFetch({ method: 'PATCH', body: JSON.stringify({ actorId, isPublic: !actor.is_public, bio: editBio }) })
      if (res.ok) await refresh()
    } catch { /* behold visning */ }
  }

  const toggleDemo = async () => {
    if (!actor) return
    try {
      const res = await authedFetch({ method: 'PATCH', body: JSON.stringify({ actorId, isDemo: !actor.is_demo }) })
      if (res.ok) await refresh()
    } catch { /* behold visning */ }
  }

  const saveBio = async () => {
    try {
      const res = await authedFetch({ method: 'PATCH', body: JSON.stringify({ actorId, bio: editBio }) })
      if (res.ok) await refresh()
    } catch { /* behold visning */ }
  }

  const uploadMedia = async (kind: 'photo' | 'sample', file: File | null) => {
    if (!file) return
    setUploadBusy(kind)
    try {
      const { data: sess } = await getSupabase().auth.getSession()
      const token = sess?.session?.access_token
      if (!token) throw new Error('Ikke innlogget')
      const fd = new FormData()
      fd.append('file', file)
      fd.append('actorId', actorId)
      fd.append('kind', kind)
      const res = await fetch('/api/voice-bank/upload', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Opplasting feilet')
      await refresh()
    } catch (err: any) {
      alert(err.message)
    } finally {
      setUploadBusy(null)
    }
  }

  const removeMedia = async (kind: 'photo' | 'sample', url: string) => {
    if (!actor) return
    const field = kind === 'photo' ? actor.photo_urls : actor.sample_urls
    const next = (field || []).filter((u) => u !== url)
    const body = kind === 'photo' ? { actorId, photoUrls: next } : { actorId, sampleUrls: next }
    try {
      const res = await authedFetch({ method: 'PATCH', body: JSON.stringify(body) })
      if (res.ok) await refresh()
    } catch { /* behold visning */ }
  }

  const setApproval = async (orgId: string, mode: string, timeoutHours: number) => {
    setApprBusy(orgId)
    try {
      const { data: sess } = await getSupabase().auth.getSession()
      const token = sess?.session?.access_token
      if (!token) throw new Error('Ikke innlogget')
      const res = await fetch('/api/voice-bank/approvals', {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ actorId, organizationId: orgId, mode, timeoutHours }),
      })
      if (res.ok) {
        setCustomers((prev) => prev.map((c) => c.id === orgId ? { ...c, mode, timeoutHours } : c))
      }
    } catch { /* behold visning */ } finally {
      setApprBusy(null)
    }
  }

  const patchLibrary = async (fields: Record<string, unknown>) => {
    try {
      const res = await authedFetch({ method: 'PATCH', body: JSON.stringify({ actorId, ...fields }) })
      if (res.ok) await refresh()
    } catch { /* behold visning */ }
  }

  const addPayout = async () => {
    const belop = Number(String(poBelop).replace(',', '.'))
    if (!/^\d{4}-\d{2}-\d{2}$/.test(poFra) || !/^\d{4}-\d{2}-\d{2}$/.test(poTil) || !Number.isFinite(belop) || belop < 0) {
      alert(t('po_err_fields')); return
    }
    setPoBusy(true)
    try {
      const { data: sess } = await getSupabase().auth.getSession()
      const token = sess?.session?.access_token
      if (!token) throw new Error('Ikke innlogget')
      const res = await fetch('/api/voice-bank/payouts', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ actorId, periodeFra: poFra, periodeTil: poTil, amountNok: belop, note: poNotat || undefined }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || t('po_err_save'))
      setPoFra(''); setPoTil(''); setPoBelop(''); setPoNotat('')
      await refresh()
    } catch (err) {
      alert(err instanceof Error ? err.message : t('po_err_save'))
    } finally {
      setPoBusy(false)
    }
  }

  const addEarning = async () => {
    if (!/^\d{4}-\d{2}$/.test(earnPeriod) || isNaN(Number(earnGross)) || Number(earnGross) <= 0) {
      alert(t('earn_err_fields')); return
    }
    setEarnBusy(true)
    try {
      const { data: sess } = await getSupabase().auth.getSession()
      const token = sess?.session?.access_token
      if (!token) throw new Error('Ikke innlogget')
      const res = await fetch('/api/voice-bank/external-earnings', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ actorId, period: earnPeriod, grossNok: Number(earnGross) }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Kunne ikke registrere')
      setEarnPeriod(''); setEarnGross('')
      await refresh()
    } catch (err: any) {
      alert(err.message)
    } finally {
      setEarnBusy(false)
    }
  }

  const totals = byMonth.reduce(
    (s, m) => ({ uses: s.uses + m.uses, to: s.to + m.to_actor_nok, from: s.from + m.from_customers_nok }),
    { uses: 0, to: 0, from: 0 }
  )

  return (
    <div className="min-h-screen bg-[var(--paper)]">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <Link href="/dashboard/voice-bank" className="text-[var(--ember-deep)] hover:text-[var(--ink)] mb-4 inline-block">{t('back')}</Link>

        {loading && <p className="text-gray-500">{t('loading')}</p>}
        {error && <div className="p-4 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">{error}</div>}

        {!loading && !error && actor && (
          <>
            <div className="flex items-center gap-3 mb-1">
              <h1 className="text-3xl font-bold text-gray-900">{actor.elevenlabs_voice_id && actor.face_character_id ? '🎙️🧑' : actor.face_character_id && !actor.elevenlabs_voice_id ? '🧑' : '🎙️'} {actor.name}</h1>
              <span className={`text-sm font-medium ${actor.is_active ? 'text-green-700' : 'text-gray-400'}`}>
                {actor.is_active ? t('active') : t('inactive')}
              </span>
            </div>
            <p className="text-gray-500 mb-8">
              {actor.elevenlabs_voice_id ? <>{t('el_id')} <span className="font-mono">{actor.elevenlabs_voice_id}</span></> : <span className="text-amber-700">{t('waiting_share')}</span>}
              {Number(actor.honorarium_nok) > 0 && <>{t('honorarium', { sum: nok(Number(actor.honorarium_nok)) })}</>}
            </p>

            {/* Eksklusivitet */}
            <div className="bg-[var(--paper-raised)] rounded-lg border border-gray-200 p-4 mb-8 flex items-center justify-between gap-4">
              <div>
                <div className="font-medium text-gray-900 text-sm">
                  {actor.is_exclusive !== false ? t('excl_yes') : t('excl_no')}
                </div>
                <p className="text-xs text-gray-500 mt-0.5">
                  {actor.is_exclusive !== false
                    ? t(actor.face_character_id && !actor.elevenlabs_voice_id ? 'excl_note_face' : actor.face_character_id ? 'excl_note_both' : 'excl_note_voice')
                    : t('excl_note_shared')}
                </p>
              </div>
              <button onClick={toggleExclusive}
                className="flex-none px-4 py-2 rounded-lg text-sm font-semibold border border-gray-300 text-gray-700 hover:border-[var(--ember-deep)] hover:text-[var(--ember-deep)] transition-colors">
                {actor.is_exclusive !== false ? t('excl_share') : t('excl_make')}
              </button>
            </div>

            {/* Totalt generert */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
              {[
                { label: t('card_uses'), value: String(totals.uses) },
                { label: t('card_from'), value: nok(totals.from) },
                { label: t('card_earned'), value: nok(earnedNok || totals.to) },
                { label: t('card_paid'), value: nok(paidNok) },
                { label: t('card_due'), value: nok(dueNok) },
                ...(fees ? [{ label: t('card_infra', { pct: fees.infraPct }), value: nok(totalInfraNok) }] : []),
                ...(fees?.licenseTo ? [{ label: t('card_licence', { to: fees.licenseTo, pct: fees.licensePct }), value: nok(totalLicenseNok) }] : []),
                { label: fees ? t('card_cut_net') : t('card_cut'), value: nok(totals.from - totals.to - totalInfraNok - totalLicenseNok) },
              ].map((c) => (
                <div key={c.label} className="bg-[var(--paper-raised)] rounded-lg border border-gray-200 p-4">
                  <div className="text-xs text-gray-500 mb-1">{c.label}</div>
                  <div className="text-xl font-bold text-gray-900">{c.value}</div>
                </div>
              ))}
            </div>

            {/* Oppgjør med skuespilleren — den andre halvdelen av hovedboken */}
            <div className="bg-[var(--paper-raised)] rounded-lg border border-gray-200 p-5 mb-8">
              <h2 className="font-semibold text-gray-900 mb-1">{t('settle_h2')}</h2>
              <p className="text-xs text-gray-400 mb-3">
                {t('settle_note')}
                {actor?.actor_email
                  ? <>{t('settle_sees_a')}<span className="font-mono">{origin}/min-stemme</span>{t('settle_sees_b', { email: actor.actor_email })}</>
                  : <>{t('settle_no_email')}</>}
              </p>
              {payouts.length === 0 ? (
                <p className="text-sm text-gray-400 mb-3">{t('payouts_none')}</p>
              ) : (
                <div className="space-y-1.5 mb-3">
                  {payouts.map((p) => (
                    <div key={p.id} className="flex flex-wrap gap-x-4 text-sm border-t border-gray-100 pt-1.5 first:border-0 first:pt-0">
                      <span className="text-gray-600">{p.periode_fra} – {p.periode_til}</span>
                      <span className="font-medium text-gray-900">{nok(p.amount_nok)}</span>
                      <span className="text-gray-500">{t('paid_on', { date: p.betalt_dato })}</span>
                      {p.note && <span className="text-gray-400">{p.note}</span>}
                    </div>
                  ))}
                </div>
              )}
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <input type="date" value={poFra} onChange={(e) => setPoFra(e.target.value)} aria-label={t('po_from')}
                  className="px-2 py-1.5 border border-gray-300 rounded-lg" />
                <span className="text-gray-400">–</span>
                <input type="date" value={poTil} onChange={(e) => setPoTil(e.target.value)} aria-label={t('po_to')}
                  className="px-2 py-1.5 border border-gray-300 rounded-lg" />
                <input value={poBelop} onChange={(e) => setPoBelop(e.target.value)} placeholder={dueNok > 0 ? `${dueNok} kr` : t('po_amount_ph')} inputMode="decimal"
                  className="w-28 px-2 py-1.5 border border-gray-300 rounded-lg" />
                <input value={poNotat} onChange={(e) => setPoNotat(e.target.value)} placeholder={t('po_note_ph')}
                  className="w-44 px-2 py-1.5 border border-gray-300 rounded-lg" />
                <button onClick={addPayout} disabled={poBusy}
                  className="px-4 py-1.5 rounded-lg font-semibold text-[var(--on-ember)] bg-[var(--ember-deep)] hover:opacity-90 disabled:opacity-50">
                  {poBusy ? t('po_busy') : t('po_add')}
                </button>
              </div>
            </div>

            {/* Lisenser — klareringen, ved siden av forbruksmåleren over */}
            <div className="bg-[var(--paper-raised)] rounded-lg border border-gray-200 p-5 mb-8 flex items-center justify-between gap-4 flex-wrap">
              <div>
                <div className="font-medium text-gray-900 text-sm">{t('lic_title')}</div>
                <p className="text-xs text-gray-500 mt-0.5 max-w-xl">
                  {t('lic_note')}
                </p>
              </div>
              <Link href={`/dashboard/voice-bank/${actorId}/lisenser`}
                className="flex-none px-4 py-2 rounded-lg text-sm font-semibold border border-gray-300 text-gray-700 hover:border-[var(--ember-deep)] hover:text-[var(--ember-deep)] transition-colors">
                {t('lic_open')}
              </Link>
            </div>

            {/* Presentasjonsside */}
            <h2 className="font-semibold text-gray-900 mb-3">{t('pub_h2')}</h2>
            <div className="bg-[var(--paper-raised)] rounded-lg border border-gray-200 p-6 mb-8">
              <div className="flex items-center justify-between gap-4 mb-4">
                <div>
                  <div className="font-medium text-gray-900 text-sm">{actor.is_public ? t('pub_yes') : t('pub_no')}</div>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {actor.is_public
                      ? <>{t('pub_note_a')}<a href="/stemmer" target="_blank" className="text-[var(--ember-deep)] hover:underline">{t('pub_note_gallery')}</a>{t('pub_note_b')}<a href={`/stemme/${actor.id}`} target="_blank" className="text-[var(--ember-deep)] hover:underline">/stemme/{actor.id.slice(0, 8)}…</a></>
                      : t('pub_note_off')}
                  </p>
                </div>
                <button onClick={togglePublic}
                  className="flex-none px-4 py-2 rounded-lg text-sm font-semibold border border-gray-300 text-gray-700 hover:border-[var(--ember-deep)] hover:text-[var(--ember-deep)] transition-colors">
                  {actor.is_public ? t('pub_unpublish') : t('pub_publish')}
                </button>
              </div>

              {/* Eksempelprofil. Bryteren står her fordi den hører til det
                  PUBLIKUM ser, og fordi den skal være lett å finne den dagen en
                  ekte rettighetshaver tar plassen. */}
              <div className="flex items-center justify-between gap-4 mb-4 pt-4 border-t border-gray-200">
                <div>
                  <div className="font-medium text-gray-900 text-sm">{actor.is_demo ? t('demo_yes') : t('demo_no')}</div>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {actor.is_demo
                      ? t('demo_note_on')
                      : t('demo_note_off')}
                  </p>
                </div>
                <button onClick={toggleDemo}
                  className="flex-none px-4 py-2 rounded-lg text-sm font-semibold border border-gray-300 text-gray-700 hover:border-[var(--ember-deep)] hover:text-[var(--ember-deep)] transition-colors">
                  {actor.is_demo ? t('demo_unmark') : t('demo_mark')}
                </button>
              </div>

              <label className="block text-sm font-medium text-gray-700 mb-1">{t('bio')}</label>
              <textarea value={editBio} onChange={(e) => setEditBio(e.target.value)} rows={4}
                placeholder={t('bio_ph')}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm mb-2" />
              <button onClick={saveBio} className="text-sm text-[var(--ember-deep)] hover:underline mb-4">{t('bio_save')}</button>

              <div className="grid sm:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">{t('photos', { n: (actor.photo_urls || []).length })}</label>
                  <div className="flex flex-wrap gap-2 mb-2">
                    {(actor.photo_urls || []).map((url) => (
                      <div key={url} className="relative">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={url} alt="" className="w-16 h-16 object-cover rounded-lg border border-gray-200" />
                        <button onClick={() => removeMedia('photo', url)}
                          className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-500 text-white text-xs leading-none">×</button>
                      </div>
                    ))}
                  </div>
                  <input type="file" accept="image/*" disabled={uploadBusy === 'photo'}
                    onChange={(e) => { uploadMedia('photo', e.target.files?.[0] || null); e.target.value = '' }}
                    className="block w-full text-sm text-gray-500 file:mr-2 file:rounded file:border-0 file:bg-[var(--ember-deep)] file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-[var(--on-ember)]" />
                  {uploadBusy === 'photo' && <p className="text-xs text-gray-400 mt-1">Laster opp …</p>}
                  <p className="text-xs text-gray-400 mt-1">{t('photos_hint')}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">{t('samples', { n: (actor.sample_urls || []).length })}</label>
                  <div className="space-y-2 mb-2">
                    {(actor.sample_urls || []).map((url, i) => (
                      <div key={url} className="flex items-center gap-2">
                        <audio controls preload="none" src={url} className="flex-1 h-9" />
                        <button onClick={() => removeMedia('sample', url)} className="text-red-500 hover:text-red-700 text-sm">{t('remove')}</button>
                      </div>
                    ))}
                  </div>
                  <input type="file" accept="audio/*" disabled={uploadBusy === 'sample'}
                    onChange={(e) => { uploadMedia('sample', e.target.files?.[0] || null); e.target.value = '' }}
                    className="block w-full text-sm text-gray-500 file:mr-2 file:rounded file:border-0 file:bg-[var(--ember-deep)] file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-[var(--on-ember)]" />
                  {uploadBusy === 'sample' && <p className="text-xs text-gray-400 mt-1">Laster opp …</p>}
                  <p className="text-xs text-gray-400 mt-1">{t('samples_hint')}</p>
                </div>
              </div>
            </div>

            {/* Takster */}
            <h2 className="font-semibold text-gray-900 mb-3">{t('rates_h2')}</h2>
            <div className="bg-[var(--paper-raised)] rounded-lg border border-gray-200 p-6 mb-8">
              <div className="grid grid-cols-2 gap-3 mb-4 max-w-md">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('rate_std_actor')}</label>
                  <input value={editRate} onChange={(e) => setEditRate(e.target.value)} inputMode="decimal"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('rate_std_price')}</label>
                  <input value={editPrice} onChange={(e) => setEditPrice(e.target.value)} inputMode="decimal"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                </div>
              </div>

              <p className="text-sm font-medium text-gray-700 mb-1">{t('rates_per_kind')}</p>
              <p className="text-xs text-gray-400 mb-3">{t('rates_per_kind_hint')}</p>
              <div className="space-y-2 max-w-md mb-4">
                {KINDS.map((k) => (
                  <div key={k} className="flex items-center gap-2 text-sm">
                    <span className="w-16 text-gray-600">{kindLabel(k)}</span>
                    <input value={editKinds[k]?.rate ?? ''} placeholder={t('ph_to_actor')}
                      onChange={(e) => setEditKinds({ ...editKinds, [k]: { ...(editKinds[k] || { rate: '', price: '' }), rate: e.target.value } })}
                      inputMode="decimal" className="flex-1 px-3 py-1.5 border border-gray-300 rounded-lg" />
                    <input value={editKinds[k]?.price ?? ''} placeholder={t('ph_price')}
                      onChange={(e) => setEditKinds({ ...editKinds, [k]: { ...(editKinds[k] || { rate: '', price: '' }), price: e.target.value } })}
                      inputMode="decimal" className="flex-1 px-3 py-1.5 border border-gray-300 rounded-lg" />
                  </div>
                ))}
              </div>

              <label className="block text-sm font-medium text-gray-700 mb-1">{t('f_email')}</label>
              <p className="text-xs text-gray-400 mb-2">{t('f_email_hint')}</p>
              <input value={editEmail} onChange={(e) => setEditEmail(e.target.value)} placeholder="skuespiller@example.com" type="email"
                className="w-full max-w-md px-3 py-2 border border-gray-300 rounded-lg text-sm mb-4" />

              <label className="block text-sm font-medium text-gray-700 mb-1">{t('f_voice_id')}</label>
              <p className="text-xs text-gray-400 mb-2">
                {t('f_voice_id_hint')}
              </p>
              <input value={editVoiceId} onChange={(e) => setEditVoiceId(e.target.value)} placeholder={t('f_voice_id_ph')}
                className="w-full max-w-md px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono mb-4" />

              <p className="text-sm font-medium text-gray-700 mb-1">{t('f_face')}</p>
              <p className="text-xs text-gray-400 mb-2">{t('f_face_hint')}</p>
              <input value={editFaceId} onChange={(e) => setEditFaceId(e.target.value)} placeholder={t('f_face_ph')}
                className="w-full max-w-md px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono mb-4" />

              <label className="flex items-start gap-2 mb-4 max-w-md text-sm text-gray-700">
                <input type="checkbox" checked={editSubsCovered} onChange={(e) => setEditSubsCovered(e.target.checked)} className="mt-0.5" />
                <span>
                  {t('subs_label')}
                  <span className="block text-xs text-gray-400 mt-0.5">
                    {t('subs_hint')}
                  </span>
                </span>
              </label>

              {saveMsg && (
                <div className={`mb-3 p-3 rounded-lg text-sm ${saveOk ? 'bg-green-50 border border-green-200 text-green-700' : 'bg-red-50 border border-red-200 text-red-700'}`}>
                  {saveMsg}
                </div>
              )}
              <button onClick={saveRates} disabled={saveBusy}
                className="px-5 py-2.5 rounded-lg font-semibold text-[var(--on-ember)] bg-[var(--ember-deep)] hover:opacity-90 disabled:opacity-50 transition-opacity">
                {saveBusy ? t('saving') : t('save_rates')}
              </button>
              <p className="text-xs text-gray-400 mt-2">{t('rates_forward')}</p>
            </div>

            {/* Godkjenningskrav per kunde */}
            <h2 className="font-semibold text-gray-900 mb-3">{t('appr_h2')}</h2>
            <div className="bg-[var(--paper-raised)] rounded-lg border border-gray-200 p-6 mb-8">
              <p className="text-xs text-gray-400 mb-4">
                {t('appr_note')}
              </p>
              {customers.length === 0 ? (
                <p className="text-sm text-gray-500">{t('appr_none')}</p>
              ) : (
                <div className="space-y-3">
                  {customers.map((c) => (
                    <div key={c.id} className="flex flex-wrap items-center gap-3 text-sm border-t border-gray-100 pt-3 first:border-0 first:pt-0">
                      <span className="font-medium text-gray-900 flex-1 min-w-[140px]">{c.name}</span>
                      <select value={c.mode} disabled={apprBusy === c.id}
                        onChange={(e) => setApproval(c.id, e.target.value, c.timeoutHours)}
                        className="px-3 py-1.5 border border-gray-300 rounded-lg bg-[var(--paper-raised)]">
                        <option value="auto">{t('appr_auto')}</option>
                        <option value="review">{t('appr_review')}</option>
                      </select>
                      {c.mode === 'review' && (
                        <label className="flex items-center gap-1.5 text-gray-600">
                          {t('appr_deadline')}
                          <input value={c.timeoutHours} disabled={apprBusy === c.id} inputMode="numeric"
                            onChange={(e) => {
                              const v = Number(e.target.value)
                              setCustomers((prev) => prev.map((x) => x.id === c.id ? { ...x, timeoutHours: v } : x))
                            }}
                            onBlur={() => setApproval(c.id, 'review', c.timeoutHours)}
                            className="w-16 px-2 py-1.5 border border-gray-300 rounded-lg" />
                          {t('appr_hours')}
                        </label>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* ElevenLabs Voice Library */}
            <h2 className="font-semibold text-gray-900 mb-3">{t('lib_h2')}</h2>
            <div className="bg-[var(--paper-raised)] rounded-lg border border-gray-200 p-6 mb-8">
              <div className="flex items-center justify-between gap-4 mb-4">
                <div>
                  <div className="font-medium text-gray-900 text-sm">
                    {actor.library_enabled ? t('lib_on') : t('lib_off')}
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {actor.library_enabled
                      ? t('lib_note_on')
                      : t('lib_note_off')}
                  </p>
                </div>
                <button onClick={() => patchLibrary({ libraryEnabled: !actor.library_enabled })}
                  className="flex-none px-4 py-2 rounded-lg text-sm font-semibold border border-gray-300 text-gray-700 hover:border-[var(--ember-deep)] hover:text-[var(--ember-deep)] transition-colors">
                  {actor.library_enabled ? t('lib_turn_off') : t('lib_turn_on')}
                </button>
              </div>
              {actor.library_enabled && (
                <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-4">
                  {t('lib_warning')}
                </p>
              )}

              <p className="text-xs text-gray-500 mb-5">
                {t('lib_payout_note')}
              </p>

              <h3 className="text-sm font-medium text-gray-700 mb-2">{t('earn_h3')}</h3>
              {earnings.length === 0 ? (
                <p className="text-sm text-gray-400 mb-3">{t('earn_none')}</p>
              ) : (
                <div className="space-y-1.5 mb-3">
                  {earnings.map((e) => (
                    <div key={e.id} className="flex flex-wrap gap-x-4 text-sm border-t border-gray-100 pt-1.5 first:border-0 first:pt-0">
                      <span className="font-medium text-gray-900 w-16">{e.period}</span>
                      <span className="text-gray-600">{e.source}</span>
                      <span className="text-gray-900">{nok(e.gross_nok)}</span>
                      <span className="text-gray-500">{t('earn_direct')}</span>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <input value={earnPeriod} onChange={(e) => setEarnPeriod(e.target.value)} placeholder="2026-07"
                  className="w-24 px-2 py-1.5 border border-gray-300 rounded-lg" />
                <input value={earnGross} onChange={(e) => setEarnGross(e.target.value)} placeholder={t('earn_gross_ph')} inputMode="decimal"
                  className="w-28 px-2 py-1.5 border border-gray-300 rounded-lg" />
                <button onClick={addEarning} disabled={earnBusy}
                  className="px-4 py-1.5 rounded-lg font-semibold text-[var(--on-ember)] bg-[var(--ember-deep)] hover:opacity-90 disabled:opacity-50">
                  {earnBusy ? t('earn_busy') : t('earn_add')}
                </button>
              </div>
            </div>

            {/* Per brukstype */}
            <h2 className="font-semibold text-gray-900 mb-3">{t('bykind_h2')}</h2>
            {byKind.length === 0 ? (
              <p className="text-sm text-gray-500 mb-8">{t('none_use')}</p>
            ) : (
              <div className="bg-[var(--paper-raised)] rounded-lg border border-gray-200 overflow-x-auto mb-8">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-gray-500 border-b border-gray-200">
                      <th className="px-4 py-2">{t('th_kind')}</th>
                      <th className="px-4 py-2">{t('th_uses')}</th>
                      <th className="px-4 py-2">{t('th_to_actor')}</th>
                      <th className="px-4 py-2">{t('th_from')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {byKind.map((r) => (
                      <tr key={r.key} className="border-b border-gray-100 last:border-0">
                        <td className="px-4 py-2 font-medium text-gray-900">{kindLabel(r.key)}</td>
                        <td className="px-4 py-2">{r.uses}</td>
                        <td className="px-4 py-2">{nok(r.to_actor_nok)}</td>
                        <td className="px-4 py-2">{nok(r.from_customers_nok)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Per måned */}
            <h2 className="font-semibold text-gray-900 mb-3">{t('bymonth_h2')}</h2>
            {byMonth.length === 0 ? (
              <p className="text-sm text-gray-500">{t('none_use')}</p>
            ) : (
              <div className="bg-[var(--paper-raised)] rounded-lg border border-gray-200 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-gray-500 border-b border-gray-200">
                      <th className="px-4 py-2">{t('th_month')}</th>
                      <th className="px-4 py-2">{t('th_uses')}</th>
                      <th className="px-4 py-2">{t('th_to_actor')}</th>
                      <th className="px-4 py-2">{t('th_from')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {byMonth.map((r) => (
                      <tr key={r.key} className="border-b border-gray-100 last:border-0">
                        <td className="px-4 py-2 font-medium text-gray-900">{r.key}</td>
                        <td className="px-4 py-2">{r.uses}</td>
                        <td className="px-4 py-2">{nok(r.to_actor_nok)}</td>
                        <td className="px-4 py-2">{nok(r.from_customers_nok)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
