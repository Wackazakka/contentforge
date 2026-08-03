'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { generatePalette, paletteFromBrand, paletteBoldSurface } from '@/lib/palette'
import { getSupabase } from '@/lib/supabaseClient'

// Partner-admin: dine direkte underledd — påslaget du tar av dem, royalty-satsen
// de betaler oppover, og merkevaren deres (navn, logo, fargeprofil).
// Hvert ledd styrer kun leddet under seg; ingen ser oppover.

interface Partner {
  id: string
  slug: string
  app_name: string
  logo_url: string | null
  brand_card_url?: string | null
  colors: Record<string, string>
  markup_percent: number
  license_fee_pct?: number | null
  fee_direct_pct: number
  fee_indirect_pct: number
  billing_mode: string
}

// Hele token-vokabularet fra globals.css, gruppert som i UI-et. Skriveveien
// (api/partners) validerer og merger — nye tokens trenger bare en rad her.
const COLOR_FIELDS: Array<{ key: string; label: string; fallback: string; group: string }> = [
  { key: '--ember', label: 'Hovedfarge', fallback: '#E25822', group: 'Aksent' },
  { key: '--ember-deep', label: 'Dyp variant', fallback: '#C5451B', group: 'Aksent' },
  { key: '--ember-tint-bg', label: 'Lys bakgrunn', fallback: '#FBE9E1', group: 'Aksent' },
  { key: '--ember-tint-border', label: 'Lys kant', fallback: '#F2C9B8', group: 'Aksent' },
  { key: '--on-ember', label: 'Tekst på hovedfarge', fallback: '#FFF4E8', group: 'Aksent' },
  { key: '--paper', label: 'Sideflate', fallback: '#F4EEE2', group: 'Flater' },
  { key: '--paper-raised', label: 'Kort/paneler', fallback: '#FFFDF8', group: 'Flater' },
  { key: '--paper-sunken', label: 'Innsunket flate', fallback: '#F7F1E6', group: 'Flater' },
  { key: '--band', label: 'Seksjonsbånd', fallback: '#ECE3D2', group: 'Flater' },
  { key: '--ink', label: 'Tekst', fallback: '#1C1A16', group: 'Tekst' },
  { key: '--ink-soft', label: 'Tekst, myk', fallback: '#3A352C', group: 'Tekst' },
  { key: '--text-muted', label: 'Tekst, dempet', fallback: '#5E564A', group: 'Tekst' },
  { key: '--text-faint', label: 'Tekst, svak', fallback: '#978B79', group: 'Tekst' },
  { key: '--ds-border', label: 'Kantlinje', fallback: '#E6DDCC', group: 'Kanter' },
  { key: '--ds-border-strong', label: 'Kantlinje, sterk', fallback: '#D8CDB8', group: 'Kanter' },
  { key: '--ds-border-faint', label: 'Kantlinje, svak', fallback: '#EFE7D8', group: 'Kanter' },
]

export default function PartnersPage() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tenantName, setTenantName] = useState('')
  const [tenantSlug, setTenantSlug] = useState('')
  const [partners, setPartners] = useState<Partner[]>([])
  const [income, setIncome] = useState<Record<string, { grossNok: number; licenseNok: number; uses: number }>>({})
  const [infraIncome, setInfraIncome] = useState<Array<{ tenantName: string; uses: number; grossNok: number; infraNok: number }> | null>(null)
  const [edits, setEdits] = useState<Record<string, { markup: string; feeDirect: string; feeIndirect: string; license: string; name: string; logo: string; brandUrl: string; colors: Record<string, string>; colorKeys: string[] }>>({})
  const [busy, setBusy] = useState<string | null>(null)
  const [saved, setSaved] = useState<string | null>(null)
  // Lagrede fargeprofiler, eid av denne tenanten. `palettesOn` er false til
  // migrasjonen er kjørt — da skjules hele raden i stedet for å vise en død knapp.
  const [palettes, setPalettes] = useState<Array<{ id: string; name: string; colors: Record<string, string> }>>([])
  const [palettesOn, setPalettesOn] = useState(false)

  const authedFetch = async (init?: RequestInit) => {
    const { data: sess } = await getSupabase().auth.getSession()
    const token = sess?.session?.access_token
    if (!token) throw new Error('Ikke innlogget')
    return fetch('/api/partners', {
      ...init,
      headers: { ...(init?.headers || {}), Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    })
  }

  const refresh = async () => {
    try {
      const res = await authedFetch()
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Kunne ikke hente partnerne'); return }
      setError(null)
      setTenantName(data.tenant?.name || '')
      setTenantSlug(data.tenant?.slug || '')
      setPartners(data.partners || [])
      setIncome(data.income || {})
      setInfraIncome(data.infraIncome ?? null)
      const e: typeof edits = {}
      for (const p of data.partners || []) {
        const colors: Record<string, string> = {}
        for (const f of COLOR_FIELDS) colors[f.key] = p.colors?.[f.key] || f.fallback
        const colorKeys = COLOR_FIELDS.filter((f) => p.colors?.[f.key]).map((f) => f.key)
        e[p.id] = { markup: String(p.markup_percent), feeDirect: String(p.fee_direct_pct ?? 3), feeIndirect: String(p.fee_indirect_pct ?? 7.5), license: String(p.license_fee_pct ?? 0), name: p.app_name, logo: p.logo_url || '', brandUrl: p.brand_card_url || '', colors, colorKeys }
      }
      setEdits(e)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const paletteFetch = async (init?: RequestInit, qs = '') => {
    const { data: sess } = await getSupabase().auth.getSession()
    const token = sess?.session?.access_token
    if (!token) throw new Error('Ikke innlogget')
    return fetch(`/api/color-palettes${qs}`, {
      ...init,
      headers: { ...(init?.headers || {}), Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    })
  }

  const refreshPalettes = async () => {
    try {
      const res = await paletteFetch()
      const d = await res.json()
      if (!res.ok) return
      setPalettes(d.palettes || [])
      setPalettesOn(d.migrated !== false)
    } catch { /* paletter er valgfritt — velter aldri siden */ }
  }

  useEffect(() => { refresh(); refreshPalettes() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const save = async (p: Partner) => {
    const e = edits[p.id]
    if (!e) return
    if (isNaN(Number(e.markup)) || isNaN(Number(e.license))) { setError('Påslag og lisensavgift må være tall.'); return }
    setBusy(p.id); setSaved(null); setError(null)
    try {
      const res = await authedFetch({
        method: 'PATCH',
        body: JSON.stringify({
          tenantId: p.id,
          markupPercent: Number(e.markup),
          licenseFeePct: Number(e.license),
          appName: e.name,
          logoUrl: e.logo || null,
          brandCardUrl: e.brandUrl || null,
          // Kun de eksplisitt valgte — resten forblir «ikke satt» og arver standarden
          colors: Object.fromEntries(e.colorKeys.map((k) => [k, e.colors[k]])),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Lagring feilet')
      setSaved(p.id)
      await refresh()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setBusy(null)
    }
  }

  /**
   * Har kortet endringer som ikke er skrevet til basen?
   *
   * Å klikke en lagret profil, eller dra i en fargevelger, fyller bare ut
   * skjemaet — partnerens domene endres først ved lagring. Det er med vilje
   * (et feilklikk skal ikke male om en kundes nettside), men uten en indikator
   * er det umulig å se forskjell på «valgt» og «lagret».
   */
  const harUlagredeEndringer = (p: Partner): boolean => {
    const e = edits[p.id]
    if (!e) return false
    if (Number(e.markup) !== Number(p.markup_percent)) return true
    if (Number(e.license) !== Number(p.license_fee_pct ?? 0)) return true
    if (e.name !== p.app_name) return true
    if ((e.logo || '') !== (p.logo_url || '')) return true
    if ((e.brandUrl || '') !== (p.brand_card_url || '')) return true
    // Fargene: sammenlign settet av VALGTE nøkler og verdiene deres mot det lagrede.
    const lagret = p.colors || {}
    const lagredeNokler = Object.keys(lagret).filter((k) => COLOR_FIELDS.some((f) => f.key === k))
    if (lagredeNokler.length !== e.colorKeys.length) return true
    return e.colorKeys.some((k) => (lagret[k] || '').toUpperCase() !== (e.colors[k] || '').toUpperCase())
  }

  const setEdit = (id: string, field: string, value: string) =>
    setEdits((prev) => ({ ...prev, [id]: { ...prev[id], [field]: value } }))

  // `colors` er alltid FULL (fargevelgere kan ikke være tomme), mens `colorKeys`
  // sier hvilke som faktisk er VALGT. Bare de valgte lagres — ellers ville første
  // lagring fryse CenterForges standardpalett inn på partneren for godt.
  const setColor = (id: string, key: string, value: string) =>
    setEdits((prev) => ({
      ...prev,
      [id]: {
        ...prev[id],
        colors: { ...prev[id].colors, [key]: value },
        colorKeys: prev[id].colorKeys.includes(key) ? prev[id].colorKeys : [...prev[id].colorKeys, key],
      },
    }))

  const clearColor = (id: string, key: string) =>
    setEdits((prev) => ({
      ...prev,
      [id]: {
        ...prev[id],
        colors: { ...prev[id].colors, [key]: COLOR_FIELDS.find((f) => f.key === key)?.fallback || '#000000' },
        colorKeys: prev[id].colorKeys.filter((k) => k !== key),
      },
    }))

  const resetColors = (id: string) =>
    setEdits((prev) => {
      const colors: Record<string, string> = {}
      for (const f of COLOR_FIELDS) colors[f.key] = f.fallback
      return { ...prev, [id]: { ...prev[id], colors, colorKeys: [] } }
    })

  // Å bruke en lagret palett er et eksplisitt valg — alle seksten merkes som satt,
  // slik at partneren beholder profilen selv om standardpaletten endres senere.
  const applyPalette = (id: string, colors: Record<string, string>) =>
    setEdits((prev) => {
      const next = { ...prev[id].colors }
      const keys: string[] = []
      for (const f of COLOR_FIELDS) if (colors[f.key]) { next[f.key] = colors[f.key]; keys.push(f.key) }
      return { ...prev, [id]: { ...prev[id], colors: next, colorKeys: keys } }
    })

  const savePalette = async (id: string) => {
    const e = edits[id]
    if (!e) return
    const name = window.prompt('Navn på fargeprofilen?')?.trim()
    if (!name) return
    // Lagrer alle seksten slik de vises — det er helheten du vil ha tilbake,
    // ikke bare de du tilfeldigvis rørte sist.
    const colors: Record<string, string> = {}
    for (const f of COLOR_FIELDS) colors[f.key] = e.colors[f.key]
    try {
      const res = await paletteFetch({ method: 'POST', body: JSON.stringify({ name, colors }) })
      const d = await res.json()
      if (!res.ok) { setError(d.error || 'Kunne ikke lagre paletten'); return }
      setError(null)
      await refreshPalettes()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kunne ikke lagre paletten')
    }
  }

  const deletePalette = async (paletteId: string, name: string) => {
    if (!window.confirm(`Slette fargeprofilen «${name}»? Partnere som allerede bruker den beholder fargene sine.`)) return
    try {
      await paletteFetch({ method: 'DELETE' }, `?id=${encodeURIComponent(paletteId)}`)
      await refreshPalettes()
    } catch { /* ignorer — listen oppdateres uansett */ }
  }

  // Bygger paletten rundt fargen som allerede står i «Hovedfarge» — altså
  // merkevarens egen. Den beholdes eksakt; sideflaten blir en dempet slektning.
  // Trenger ikke eget inndatafelt: fargevelgeren for Hovedfarge ER inndataen.
  const buildFromBrand = (id: string, dark: boolean) =>
    setEdits((prev) => {
      const brand = prev[id].colors['--ember'] || '#E25822'
      const p = paletteFromBrand(brand, { dark })
      const colors = { ...prev[id].colors }
      for (const f of COLOR_FIELDS) if (p[f.key]) colors[f.key] = p[f.key]
      return { ...prev, [id]: { ...prev[id], colors, colorKeys: COLOR_FIELDS.map((f) => f.key) } }
    })

  // Merkefargen BLIR sideflaten. Dristig, og prisen er reell: en mettet flate gir
  // bare fire brukbare tekstlysheter (L97-100 på #E01B1B, mot 43 på en lys flate),
  // så teksthierarkiet flates ut. Paletten vipper etter hva flaten tåler — mørk
  // flate gir lys tekst og mørke kort, lys flate gir det motsatte.
  const buildBoldSurface = (id: string) =>
    setEdits((prev) => {
      const brand = prev[id].colors['--ember'] || '#E25822'
      const pal = paletteBoldSurface(brand)
      const colors = { ...prev[id].colors }
      for (const f of COLOR_FIELDS) if (pal[f.key]) colors[f.key] = pal[f.key]
      return { ...prev, [id]: { ...prev[id], colors, colorKeys: COLOR_FIELDS.map((f) => f.key) } }
    })

  // Trekker ÉN ting — sideflatens kulør og lys/mørk — og utleder resten, med
  // kontrastgarantier. Seksten uavhengige tilfeldige farger blir alltid stygt.
  const suggestColors = (id: string) =>
    setEdits((prev) => {
      const p = generatePalette()
      const colors = { ...prev[id].colors }
      for (const f of COLOR_FIELDS) if (p[f.key]) colors[f.key] = p[f.key]
      return { ...prev, [id]: { ...prev[id], colors, colorKeys: COLOR_FIELDS.map((f) => f.key) } }
    })

  return (
    <div className="min-h-screen bg-[var(--paper)]">
      <div className="max-w-3xl mx-auto px-4 py-8">
        <Link href="/dashboard" className="text-[var(--ember-deep)] hover:text-[var(--ink)] mb-4 inline-block">← Tilbake</Link>
        <h1 className="text-3xl font-bold text-gray-900 mb-2">🤝 Partnere</h1>
        <p className="text-gray-600 mb-8">
          {tenantName ? `${tenantName} sine direkte underledd` : 'Dine direkte underledd'} — påslaget de tar av sine egne kunder,
          lisensavgiften fra partneravtalen, og merkevaren deres (navn, logo og farger på deres eget domene).
        </p>

        {loading && <p className="text-gray-500">Henter partnerne …</p>}
        {error && <div className="mb-6 p-4 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">{error}</div>}

        {!loading && partners.length === 0 && !error && (
          <div className="text-sm text-gray-500">
            <p>Ingen partnere under dette leddet ennå.</p>
            {/* Hvilket ledd? Verten avgjør hvem du er, og på en ukjent vert
                lander man på rot-leddet. Uten dette ser «tomt» og «feil sted»
                helt likt ut (Lars 3/8). */}
            {tenantSlug && (
              <p className="mt-1 text-[12.5px] text-gray-400">
                Du ser dette som <span className="font-mono">{tenantSlug}</span>. Partnerlisten følger
                domenet du er logget inn på — er du på feil adresse, ser du feil ledd.
              </p>
            )}
          </div>
        )}

        {infraIncome && (
          <div className="bg-white rounded-xl border border-gray-200 p-5 mb-8">
            <h2 className="font-semibold text-gray-900 mb-1">Infrastrukturinntekter denne måneden</h2>
            <p className="text-xs text-gray-400 mb-3">Plattformens 3 % av stemme- og ansiktsomsetningen i ALLE banker i treet — rettighetshåndtering, logging og utbetaling.</p>
            {infraIncome.length === 0 ? (
              <p className="text-sm text-gray-500">Ingen aktiva-omsetning i treet denne måneden ennå.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-gray-500 border-b border-gray-200">
                    <th className="py-2">Bank</th>
                    <th className="py-2">Bruk</th>
                    <th className="py-2">Aktiva-omsetning</th>
                    <th className="py-2 text-right">Til plattformen (3 %)</th>
                  </tr>
                </thead>
                <tbody>
                  {infraIncome.map((r) => (
                    <tr key={r.tenantName} className="border-b border-gray-100 last:border-0">
                      <td className="py-2 font-medium">{r.tenantName}</td>
                      <td className="py-2">{r.uses}</td>
                      <td className="py-2">{r.grossNok.toLocaleString('nb-NO')} kr</td>
                      <td className="py-2 text-right font-semibold text-green-700">{r.infraNok.toLocaleString('nb-NO')} kr</td>
                    </tr>
                  ))}
                  <tr>
                    <td className="py-2 font-semibold" colSpan={3}>Sum</td>
                    <td className="py-2 text-right font-bold text-green-700">{infraIncome.reduce((s2, r) => s2 + r.infraNok, 0).toLocaleString('nb-NO')} kr</td>
                  </tr>
                </tbody>
              </table>
            )}
          </div>
        )}

        {Object.keys(income).length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 p-5 mb-8">
            <h2 className="font-semibold text-gray-900 mb-1">Partnerinntekter denne måneden</h2>
            <p className="text-xs text-gray-400 mb-3">Lisensavgiften av partnernes stemme- og ansiktsomsetning — samme hovedbok som partneren selv ser. Endelig oppgjør skjer ved månedsavregningen.</p>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-500 border-b border-gray-200">
                  <th className="py-2">Partner</th>
                  <th className="py-2">Bruk</th>
                  <th className="py-2">Aktiva-omsetning</th>
                  <th className="py-2">Sats</th>
                  <th className="py-2 text-right">Til dere</th>
                </tr>
              </thead>
              <tbody>
                {partners.filter((p) => income[p.id]).map((p) => {
                  const inc = income[p.id]
                  return (
                    <tr key={p.id} className="border-b border-gray-100 last:border-0">
                      <td className="py-2 font-medium">{p.app_name}</td>
                      <td className="py-2">{inc.uses}</td>
                      <td className="py-2">{inc.grossNok.toLocaleString('nb-NO')} kr</td>
                      <td className="py-2">{Number(p.license_fee_pct ?? 0)} %</td>
                      <td className="py-2 text-right font-semibold text-green-700">{inc.licenseNok.toLocaleString('nb-NO')} kr</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className="space-y-6">
          {partners.map((p) => {
            const e = edits[p.id]
            if (!e) return null
            return (
              <div key={p.id} className="bg-white rounded-xl border border-gray-200 p-6">
                <div className="flex items-center justify-between gap-4 mb-5">
                  <div>
                    <h2 className="font-semibold text-gray-900 text-lg">{p.app_name}</h2>
                    <p className="text-xs text-gray-400 font-mono">{p.slug} · {p.billing_mode === 'invoice' ? 'forskudd/avregning' : 'direktebetaling'}</p>
                  </div>
                  <div className="w-10 h-10 rounded-lg border border-gray-200 flex-none" style={{ background: e.colors['--ember'] }} title="Hovedfarge" />
                </div>

                <div className="grid sm:grid-cols-2 gap-4 mb-4">
                  <div>
                    {/* Navnet MAA staa i etiketten (Lars 3/8, to ganger): uten
                        det leses feltet som «vaart paaslag», og man tror man
                        endrer sitt eget naar man endrer partnerens. */}
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      {p.app_name} sitt påslag mot sine kunder (%)
                    </label>
                    <input value={e.markup} onChange={(ev) => setEdit(p.id, 'markup', ev.target.value)} inputMode="decimal"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                    <p className="text-xs text-gray-400 mt-1">
                      0–500. Kundeprisen deres = innprisen × (1 + påslag/100).
                      0 = de selger til innpris og tjener ingenting; 100 = dobbel pris.
                    </p>
                    {/* Feltet heter ETT tall og eies av partneren (Lars 3/8: «når
                        jeg setter 150 % her, forandrer IndigoBooms seg også»).
                        Det var ikke to tall som fulgte hverandre — det var samme
                        tall med to motsatte etiketter. */}
                    <p className="text-xs text-gray-400 mt-1">
                      Dette er <em>{p.app_name} sitt</em> tall, ikke vårt — samme felt som de selv
                      redigerer under «Påslag». Endrer du det her, endrer du utsalgsprisen deres.
                      Vår egen inntekt er engrosprisen, og den påvirkes ikke.
                      Vi har ikke noe eget påslagsfelt: vår margin ligger i prislisten.
                    </p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Lisensavgift (%)</label>
                    <input value={e.license} onChange={(ev) => setEdit(p.id, 'license', ev.target.value)} inputMode="decimal"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                    <p className="text-xs text-gray-400 mt-1">Din forhandlede andel av partnerens stemme- og ansiktsomsetning. 0 = ingen. I tillegg går infrastrukturavgiften (3 %) til plattformen i alle ledd.</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Visningsnavn</label>
                    <input value={e.name} onChange={(ev) => setEdit(p.id, 'name', ev.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Logo-URL</label>
                    <input value={e.logo} onChange={(ev) => setEdit(p.id, 'logo', ev.target.value)} placeholder="https://…"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono" />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Adresse på merkekortet</label>
                    <input value={e.brandUrl} onChange={(ev) => setEdit(p.id, 'brandUrl', ev.target.value)}
                      placeholder="indigoboom.com/videomaker"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono" />
                    <p className="mt-1 text-[12px] text-gray-500">
                      Står under navnet på sluttplakaten kunder får mot rabatt. Skriv den som den skal
                      leses av noen som ser en video — uten https:// La feltet stå tomt for ingen adresse.
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                  <label className="block text-sm font-medium text-gray-700">Fargeprofil (partnerens domene)</label>
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={() => suggestColors(p.id)}
                      className="px-3 py-1.5 rounded-lg text-sm border border-gray-300 text-gray-700 hover:border-[var(--ember-deep)] hover:text-[var(--ember-deep)] transition-colors">
                      🎲 Forslag
                    </button>
                    <span className="inline-flex rounded-lg border border-gray-300 overflow-hidden">
                      <button type="button" onClick={() => buildFromBrand(p.id, false)}
                        title="Behold Hovedfarge som den er, og bygg en lys palett rundt den"
                        className="px-3 py-1.5 text-sm text-gray-700 hover:text-[var(--ember-deep)] transition-colors">
                        Bygg rundt hovedfargen
                      </button>
                      <button type="button" onClick={() => buildFromBrand(p.id, true)}
                        title="Samme, men med mørk sideflate"
                        className="px-2.5 py-1.5 text-sm text-gray-700 border-l border-gray-300 hover:text-[var(--ember-deep)] transition-colors">
                        🌙
                      </button>
                    </span>
                    <button type="button" onClick={() => buildBoldSurface(p.id)}
                      title="Hovedfargen blir selve sideflaten. Dristig, men teksthierarkiet flates ut — passer landingssider, ikke dashbord."
                      className="px-3 py-1.5 rounded-lg text-sm border border-gray-300 text-gray-700 hover:border-[var(--ember-deep)] hover:text-[var(--ember-deep)] transition-colors">
                      Sterk flate
                    </button>
                    <button type="button" onClick={() => savePalette(p.id)}
                      className="px-3 py-1.5 rounded-lg text-sm border border-gray-300 text-gray-700 hover:border-[var(--ember-deep)] hover:text-[var(--ember-deep)] transition-colors">
                      Lagre som profil
                    </button>
                    <button type="button" onClick={() => resetColors(p.id)} disabled={e.colorKeys.length === 0}
                      className="px-3 py-1.5 rounded-lg text-sm border border-gray-300 text-gray-700 hover:border-[var(--ember-deep)] hover:text-[var(--ember-deep)] disabled:opacity-40 disabled:hover:border-gray-300 disabled:hover:text-gray-700 transition-colors">
                      Tilbakestill
                    </button>
                  </div>
                </div>

                {palettesOn && palettes.length > 0 && (
                  <div className="flex flex-wrap items-center gap-2 mb-3">
                    <span className="text-xs text-gray-500">Lagrede profiler:</span>
                    {palettes.map((pal) => (
                      <span key={pal.id} className="inline-flex items-center gap-1 rounded-full border border-gray-300 pl-1 pr-2 py-1">
                        <button type="button" onClick={() => applyPalette(p.id, pal.colors)}
                          title={`Bruk «${pal.name}» på ${e.name}`}
                          className="inline-flex items-center gap-1.5 text-xs text-gray-700 hover:text-[var(--ember-deep)] transition-colors">
                          <span className="flex rounded-full overflow-hidden border border-gray-200">
                            {['--paper', '--ember', '--ink'].map((k) => (
                              <i key={k} className="block w-3 h-3" style={{ background: pal.colors[k] || '#ccc' }} />
                            ))}
                          </span>
                          {pal.name}
                        </button>
                        <button type="button" onClick={() => deletePalette(pal.id, pal.name)} title="Slett profilen"
                          className="text-gray-300 hover:text-red-600 text-xs leading-none transition-colors">×</button>
                      </span>
                    ))}
                  </div>
                )}
                <p className="text-xs text-gray-500 mb-3">
                  {e.colorKeys.length === 0
                    ? 'Ingen egne farger — partneren bruker standardpaletten.'
                    : `${e.colorKeys.length} av ${COLOR_FIELDS.length} farger er satt. Blå prikk = valgt; klikk den for å nullstille.`}
                  {' '}«Forslag» trekker én kulør og utleder resten. «Bygg rundt hovedfargen» beholder Hovedfarge nøyaktig som den er og utleder de andre fra den — bruk den når merkevaren har en gitt farge. «Sterk flate» gjør hovedfargen til selve sideflaten — dristig, men da flates teksthierarkiet ut, så den passer landingssider mer enn dashbord. Alle tre garanterer lesbar kontrast. «Lagre som profil» legger fargene i ditt eget bibliotek — partneren endres først når du trykker «Lagre endringer» nederst.
                </p>
                {['Aksent', 'Flater', 'Tekst', 'Kanter'].map((group) => (
                  <div key={group} className="mb-3">
                    <div className="text-xs uppercase tracking-wide text-gray-500 mb-1.5">{group}</div>
                    <div className="flex flex-wrap gap-4">
                      {COLOR_FIELDS.filter((f) => f.group === group).map((f) => (
                        <label key={f.key} className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
                          <span className="relative flex-none">
                            <input type="color" value={e.colors[f.key]} onChange={(ev) => setColor(p.id, f.key, ev.target.value)}
                              className="w-9 h-9 rounded border border-gray-300 cursor-pointer" />
                            {e.colorKeys.includes(f.key) && (
                              <button type="button" title="Nullstill denne fargen"
                                onClick={(ev) => { ev.preventDefault(); clearColor(p.id, f.key) }}
                                className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-blue-600 text-white text-[10px] leading-none flex items-center justify-center hover:bg-red-600 transition-colors">
                                ×
                              </button>
                            )}
                          </span>
                          {f.label}
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
                <p className="text-xs text-gray-500 mb-5 mt-1">
                  Mørkt merke? Sett Sideflate/Kort mørke og Tekst lyse — hele appen følger fargene, ikke bare forsiden.
                </p>

                <div className="flex items-center gap-3">
                  <button onClick={() => save(p)} disabled={busy === p.id}
                    className="px-5 py-2.5 rounded-lg font-semibold text-white bg-[var(--ember-deep)] hover:opacity-90 disabled:opacity-50 transition-opacity">
                    {busy === p.id ? 'Lagrer …' : 'Lagre endringer'}
                  </button>
                  {saved === p.id
                    ? <span className="text-sm text-green-700">Partneren er lagret — synlig på deres domene innen ett minutt.</span>
                    : harUlagredeEndringer(p) && (
                        <span className="text-sm text-amber-700">
                          Ulagrede endringer — partnerens domene er uendret til du trykker «Lagre endringer».
                        </span>
                      )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
