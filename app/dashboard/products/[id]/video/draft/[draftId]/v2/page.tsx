'use client'

// Segmentside V2 (design-handoff 31/7, «Godkjenn video-draft»):
// segmentene er hovedinnholdet (trekkspill, én åpen), alt globalt samles i
// sidepanelet (fase 2), kreditter som kort i stedet for flytende taxameter.
// Bygges VED SIDEN AV den gamle siden og byttes når den er komplett.
// Farger går via tenant-tokenene — ingen hardkodede design-hexer (Lars 31/7:
// «dagens lyse drakt, mottakelig for fargeendringer som de andre sidene»).

import { useState, useEffect, useRef } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { getSupabase } from '@/lib/supabaseClient'
import { useTenant } from '@/lib/tenantContext'
import { COSTS_NOK, fmtCredits } from '@/lib/costs'

interface Segment {
  index: number
  text: string
  voiceover: string
  image_url: string
  approved: boolean
  voiceover_url?: string
  own_voice?: boolean
  hold_seconds?: number
  match_music?: boolean
  image_prompt?: string
  animate?: boolean
  motion?: 'none' | 'move' | 'talk'
  no_voice?: boolean
}

interface Draft {
  id: string
  product_id: string
  campaign_id: string
  title?: string
  cta?: string
  segments: Segment[]
  voice_id?: string
  music_file?: string | null
  video_format?: string
  ai_motion?: boolean
  ai_motion_engine?: string
  image_style?: string
  include_outro_card?: boolean
  outro_jingle?: string | null
  character_id?: string | null
  cost_accumulated?: number | null
}

export default function DraftV2Page() {
  const params = useParams()
  const router = useRouter()
  const searchParams = useSearchParams()
  const tenant = useTenant()
  const productId = params?.id as string
  const draftId = params?.draftId as string

  const [draft, setDraft] = useState<Draft | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [openIndex, setOpenIndex] = useState(0) // -1 = alle lukket
  const [voicePreviews, setVoicePreviews] = useState<Record<number, string>>({})
  const [voiceLoading, setVoiceLoading] = useState<Record<number, boolean>>({})
  const [starting, setStarting] = useState(false)
  const [productName, setProductName] = useState('')
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Utpris-faktor (white-label): kunden ser priser med partnerens margin
  const pf = tenant.price_multiplier || 1

  useEffect(() => {
    ;(async () => {
      try {
        const supabase = getSupabase()
        const [{ data, error: dErr }, { data: prod }] = await Promise.all([
          supabase.from('production_drafts').select('*').eq('id', draftId).single(),
          supabase.from('products').select('name').eq('id', productId).single(),
        ])
        if (dErr || !data) throw new Error(dErr?.message || 'Fant ikke utkastet')
        setDraft(data as Draft)
        setProductName(prod?.name || '')
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Noe gikk galt')
      } finally {
        setLoading(false)
      }
    })()
  }, [draftId, productId])

  // Lagre segmentene (debounced ved tekstredigering, umiddelbart ellers)
  const persistSegments = async (segments: Segment[]) => {
    try {
      await getSupabase().from('production_drafts').update({ segments }).eq('id', draftId)
    } catch (err) {
      console.warn('[v2] lagring av segmenter feilet:', err)
    }
  }
  const updateSegment = (index: number, patch: Partial<Segment>, opts?: { debounce?: boolean }) => {
    setDraft((prev) => {
      if (!prev) return prev
      const segments = [...prev.segments]
      segments[index] = { ...segments[index], ...patch }
      if (saveTimer.current) clearTimeout(saveTimer.current)
      if (opts?.debounce) {
        saveTimer.current = setTimeout(() => persistSegments(segments), 800)
      } else {
        persistSegments(segments)
      }
      return { ...prev, segments }
    })
  }

  // Redigert innhold sender scenen tilbake til gjennomgang (design-handoff:
  // endret tekst skal aldri seile gjennom som «godkjent»)
  const editText = (index: number, field: 'text' | 'voiceover', value: string) => {
    updateSegment(index, { [field]: value, approved: false } as Partial<Segment>, { debounce: true })
  }
  const toggleApproved = (index: number) => {
    if (!draft) return
    updateSegment(index, { approved: !draft.segments[index].approved })
  }

  const previewVoice = async (index: number) => {
    if (!draft || draft.voice_id === 'own') return
    const seg = draft.segments[index]
    setVoiceLoading((p) => ({ ...p, [index]: true }))
    try {
      const res = await fetch('/api/content/preview-voiceover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: seg.voiceover, voiceId: draft.voice_id || 'nhvaqgRyAq6BmFs3WcdX', draftId, segmentIndex: index }),
      })
      const data = await res.json()
      if (data.url) {
        setVoicePreviews((p) => ({ ...p, [index]: data.url }))
        setDraft((prev) => {
          if (!prev) return prev
          const segments = [...prev.segments]
          segments[index] = { ...segments[index], voiceover_url: data.url, own_voice: false }
          persistSegments(segments)
          const paalopt = (Number(prev.cost_accumulated) || 0) + COSTS_NOK.voiceoverPreview + (Number(data.actorExtraNok) || 0)
          return { ...prev, segments, cost_accumulated: paalopt }
        })
      }
    } catch (err) {
      console.error('[v2] stemme-forhåndsvisning feilet:', err)
    } finally {
      setVoiceLoading((p) => ({ ...p, [index]: false }))
    }
  }

  const startProduction = async () => {
    if (!draft) return
    setStarting(true)
    try {
      const { data: sess } = await getSupabase().auth.getSession()
      const res = await fetch('/api/start-production', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          draftId,
          userId: sess?.session?.user?.id || null,
          // Valgene er persistert på utkastet (image_style, ai_motion, …) —
          // startProductionForDraft leser dem derfra når opts uteblir
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Produksjonen kunne ikke starte')
      const fmt = draft.video_format || '9:16'
      window.location.href = `/dashboard/products/${productId}/video/status/${data.jobId}?format=${encodeURIComponent(fmt)}&motion=${draft.ai_motion ? '1' : '0'}`
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Noe gikk galt')
      setStarting(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--paper)] flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-[var(--ember-deep)] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }
  if (error || !draft) {
    return (
      <div className="min-h-screen bg-[var(--paper)] flex items-center justify-center">
        <p className="text-red-700">{error || 'Fant ikke utkastet'}</p>
      </div>
    )
  }

  const segments = draft.segments || []
  const approvedCount = segments.filter((s) => s.approved).length
  const allApproved = approvedCount === segments.length && segments.length > 0
  const pendingCount = segments.length - approvedCount
  const paaloptNok = (Number(draft.cost_accumulated) || 0) * pf

  return (
    <div className="min-h-screen bg-[var(--paper)]">
      <div className="max-w-6xl mx-auto px-4 sm:px-8 pt-10 pb-20">
        {/* Sidehode */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link
            href={`/dashboard/products/${productId}`}
            className="text-[13px] text-gray-500 hover:text-[var(--ink)]"
          >
            ← Tilbake til artisten
          </Link>
          {/* Veien tilbake til den gamle siden mens V2 bygges ferdig */}
          <Link
            href={`/dashboard/products/${productId}/video/draft/${draftId}`}
            className="text-[13px] text-gray-500 underline hover:text-[var(--ink)]"
          >
            Tilbake til den gamle sidevisningen
          </Link>
        </div>
        <div className="mt-4 flex flex-col sm:flex-row sm:items-end gap-5 sm:gap-8">
          <div className="flex-1 min-w-0">
            <h1 className="text-4xl font-bold text-gray-900 tracking-tight">Godkjenn video-utkastet</h1>
            <p className="mt-3 text-[15px] text-gray-500 max-w-[52ch]">
              {productName ? `${productName}${draft.title ? ' — ' + draft.title : ''}. ` : ''}
              Gå gjennom hver scene, juster oppsettet, og send videoen i produksjon.
            </p>
          </div>
          <div className="flex flex-col items-start sm:items-end gap-2">
            <p className={`text-[13px] font-medium ${allApproved ? 'text-green-700' : 'text-amber-700'}`}>
              {allApproved
                ? `Alle ${segments.length} scenene er godkjent`
                : `${pendingCount} scene${pendingCount === 1 ? '' : 'r'} venter på godkjenning`}
            </p>
            <button
              type="button"
              onClick={startProduction}
              disabled={!allApproved || starting}
              className="px-6 py-3 rounded-xl text-[14.5px] font-semibold text-white bg-[var(--ember-deep)] hover:bg-[var(--ink)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {starting ? 'Starter…' : 'Start produksjon'}
            </button>
          </div>
        </div>

        {/* To kolonner: scener + (fase 2: sidepanel — nå kun kreditt-kortet) */}
        <div className="mt-9 grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px] gap-7 items-start">
          {/* Scene-kortet */}
          <div className="bg-white rounded-2xl border border-gray-200">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between gap-3">
              <div className="flex items-baseline gap-3 min-w-0">
                <h2 className="text-base font-semibold text-gray-900">Scener</h2>
                <span className="text-[12.5px] text-gray-400 whitespace-nowrap">
                  {approvedCount} av {segments.length} godkjent
                </span>
              </div>
              <button
                type="button"
                onClick={() => setOpenIndex(-1)}
                className="px-3 py-1.5 rounded-lg border border-gray-300 text-[13px] text-gray-600 hover:border-gray-400 hover:text-gray-900"
              >
                Lukk alle
              </button>
            </div>

            {segments.map((seg, index) => {
              const open = openIndex === index
              return (
                <div
                  key={index}
                  className={`px-6 py-4 ${index < segments.length - 1 ? 'border-b border-gray-100' : ''} hover:bg-gray-50/60`}
                >
                  <div className="grid grid-cols-[64px_minmax(0,1fr)_auto] gap-4 items-start">
                    {/* Minibilde 9:16 */}
                    <button
                      type="button"
                      onClick={() => setOpenIndex(open ? -1 : index)}
                      className="w-16 rounded-lg overflow-hidden border border-gray-200 bg-black aspect-[9/16] flex-shrink-0"
                      title={open ? 'Lukk scenen' : 'Åpne scenen'}
                    >
                      {seg.image_url ? (
                        <img
                          src={seg.image_url}
                          alt=""
                          className={tenant.vertical === 'music' ? 'w-full h-full object-contain' : 'w-full h-full object-cover'}
                        />
                      ) : (
                        <div className="w-full h-full bg-gray-100" />
                      )}
                    </button>

                    {/* Innhold */}
                    <div className="min-w-0">
                      <div className="flex items-center gap-2.5 mb-1.5">
                        <span className="text-[11px] uppercase tracking-widest text-gray-400 whitespace-nowrap">
                          Scene {index + 1}
                        </span>
                        <span className={`inline-flex items-center gap-1.5 text-[11.5px] ${seg.approved ? 'text-green-700' : 'text-amber-700'}`}>
                          <span className={`w-[5px] h-[5px] rounded-full ${seg.approved ? 'bg-green-600' : 'bg-amber-500'}`} />
                          {seg.approved ? 'Godkjent' : 'Til gjennomgang'}
                        </span>
                        {seg.no_voice === true && (
                          <span className="text-[11.5px] text-gray-400">🔇 uten tale</span>
                        )}
                      </div>
                      {/* Teksten på skjermen — redigeres rett i lista */}
                      <textarea
                        value={seg.text}
                        onChange={(e) => editText(index, 'text', e.target.value)}
                        onFocus={() => setOpenIndex(index)}
                        rows={open ? 2 : 1}
                        className="w-full resize-none bg-transparent text-[16px] leading-snug text-gray-900 focus:outline-none focus:ring-2 focus:ring-[var(--ember-deep)] rounded-md px-1 -mx-1"
                      />

                      {/* Utvidet innhold */}
                      {open && (
                        <div className="mt-3 space-y-3">
                          {seg.no_voice !== true && (
                            <div className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3">
                              <p className="text-[11px] uppercase tracking-widest text-gray-400 mb-1.5">Voiceover</p>
                              <textarea
                                value={seg.voiceover}
                                onChange={(e) => editText(index, 'voiceover', e.target.value)}
                                rows={2}
                                className="w-full resize-none bg-transparent text-[14px] leading-relaxed text-gray-700 focus:outline-none"
                              />
                              {(voicePreviews[index] || (seg.own_voice && seg.voiceover_url)) && (
                                <audio controls src={voicePreviews[index] || seg.voiceover_url} className="mt-2 w-full h-8" />
                              )}
                            </div>
                          )}
                          <div className="flex flex-wrap items-center gap-2">
                            {seg.no_voice !== true && draft.voice_id !== 'own' && (
                              <button
                                type="button"
                                onClick={() => previewVoice(index)}
                                disabled={voiceLoading[index]}
                                className="px-3.5 py-2 rounded-lg border border-[var(--ember-tint-border)] bg-[var(--ember-tint-bg)] text-[13px] font-medium text-[var(--ember-deep)] hover:border-[var(--ember-deep)] disabled:opacity-50"
                              >
                                {voiceLoading[index] ? 'Genererer…' : '▶ Hør stemmen'}
                              </button>
                            )}
                            {/* Fase 3: Les inn selv · Bytt bilde · Se animasjonen ·
                                Del scene · Bilde-prompt · Uten tale · bevegelsesvalg */}
                            <span className="text-[12px] text-gray-400">
                              Flere sceneverktøy kommer i neste byggefase — bruk den gamle siden for bildebytte og egen stemme inntil videre.
                            </span>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Radkontroller */}
                    <div className="flex flex-col items-end gap-2">
                      <button
                        type="button"
                        onClick={() => toggleApproved(index)}
                        className={`min-w-[104px] px-3.5 py-2 rounded-lg border text-[13px] font-medium transition-colors ${
                          seg.approved
                            ? 'border-gray-300 text-gray-600 hover:border-gray-400'
                            : 'border-[var(--ember-deep)] bg-[var(--ember-deep)] text-white hover:bg-[var(--ink)]'
                        }`}
                      >
                        {seg.approved ? 'Angre' : 'Godkjenn'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setOpenIndex(open ? -1 : index)}
                        className="w-[34px] h-[34px] rounded-lg border border-gray-300 text-gray-500 hover:border-gray-400 hover:text-gray-900 text-xs"
                        title={open ? 'Lukk' : 'Åpne'}
                      >
                        {open ? '▲' : '▼'}
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Sidepanel — fase 1: kun kreditt-kortet; resten kommer i fase 2 */}
          <aside className="lg:sticky lg:top-6 space-y-4">
            <div className="bg-white rounded-2xl border border-gray-200 px-5 py-4">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-[13.5px] text-gray-500">Påløpt på utkastet</span>
                <span className="text-xl font-semibold text-gray-900 tabular-nums">{fmtCredits(paaloptNok)}</span>
              </div>
              <p className="mt-2 text-[11.5px] text-gray-400">
                Bilder og stemmer betales mens du jobber; animasjon ved produksjonsstart. Scener som er generert før gjenbrukes gratis.
              </p>
            </div>
            <div className="bg-white rounded-2xl border border-gray-200 px-5 py-4">
              <p className="text-[12px] uppercase tracking-widest text-gray-400 mb-2">Oppsett</p>
              <p className="text-[13px] text-gray-500 leading-relaxed">
                Stemme, musikk, jingle og sluttplakat flytter hit i neste byggefase.{' '}
                <Link
                  href={`/dashboard/products/${productId}/video/draft/${draftId}${searchParams?.toString() ? `?${searchParams.toString()}` : ''}`}
                  className="text-[var(--ember-deep)] underline hover:text-[var(--ink)]"
                >
                  Åpne den gamle siden
                </Link>{' '}
                for å endre dem nå.
              </p>
            </div>
          </aside>
        </div>
      </div>
    </div>
  )
}
