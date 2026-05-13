'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { getSupabase } from '@/lib/supabaseClient'

interface Segment {
  index: number
  text: string
  voiceover: string
  image_url: string
  approved: boolean
}

interface Draft {
  id: string
  product_id: string
  campaign_id: string
  status: string
  segments: Segment[]
  voice_id?: string
  tone?: string
  cta?: string
  video_format?: string
  music_style?: string
  music_file?: string | null
}

export default function DraftPage() {
  const router = useRouter()
  const params = useParams()
  const searchParams = useSearchParams()
  const productId = params?.id as string
  const draftId = params?.draftId as string

  const [draft, setDraft] = useState<Draft | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [regeneratingIndex, setRegeneratingIndex] = useState<number | null>(null)
  const [generatingImages, setGeneratingImages] = useState<Set<number>>(new Set())
  const [imageErrors, setImageErrors] = useState<Record<number, string>>({})
  const [assets, setAssets] = useState<any[]>([])
  const [showImageBank, setShowImageBank] = useState<number | null>(null)
  const [voicePreviews, setVoicePreviews] = useState<Record<number, string>>({})
  const [voiceLoading, setVoiceLoading] = useState<Record<number, boolean>>({})
  const imageStyle = searchParams?.get('imageStyle') || 'editorial'
  const formatFromUrl = searchParams?.get('format') || ''



  useEffect(() => {
    if (!draftId) return

    const fetchDraft = async () => {
      try {
        setLoading(true)
        console.log('[DraftPage] Fetching draft with ID:', draftId)
        const supabase = getSupabase()

        console.log('[DraftPage] Calling Supabase query...')
        const { data, error: fetchError } = await supabase
          .from('production_drafts')
          .select('*')
          .eq('id', draftId)
          .single()

        console.log('[DraftPage] Supabase response:', { data, error: fetchError })

        if (fetchError) {
          console.error('[DraftPage] Supabase error details:', {
            message: fetchError.message,
            code: fetchError.code,
            hint: fetchError.hint,
            details: fetchError.details,
          })
          throw new Error(`Supabase error: ${fetchError.message}${fetchError.hint ? ' (' + fetchError.hint + ')' : ''}`)
        }

        if (!data) {
          console.warn('[DraftPage] No draft data returned')
          throw new Error('Draft not found')
        }

        console.log('[DraftPage] ✅ Draft fetched successfully:', {
          draftId: data.id,
          segmentCount: data.segments?.length || 0,
        })
        setDraft(data)
        setLoading(false) // Show page immediately — don't wait for images

        // Auto-generate images in background (fire and forget)
        if (data.segments && productId) {
          console.log('[DraftPage] Starting auto image generation (background)...')
          generateImagesForAllSegments(data) // intentionally not awaited
        }
      } catch (err) {
        console.error('[DraftPage] Fetch error:', err)
        const errorMsg = err instanceof Error ? err.message : String(err)
        setError(errorMsg)
        console.error('[DraftPage] Full error object:', err)
        setLoading(false)
      }
    }

    fetchDraft()
  }, [draftId, productId])

  // Fetch available images from asset_banks
  useEffect(() => {
    if (!productId) return

    const fetchAssets = async () => {
      try {
        const supabase = getSupabase()
        const { data } = await supabase
          .from('asset_banks')
          .select('id, asset_url, name')
          .eq('product_id', productId)
          .eq('asset_type', 'image')

        setAssets(data || [])
      } catch (err) {
        console.error('[DraftPage] Asset fetch error:', err)
      }
    }

    fetchAssets()
  }, [productId])

  const generateImagesForAllSegments = async (draftData: Draft) => {
    console.log('[DraftPage] ========== START AUTO IMAGE GENERATION ==========')
    console.log(`[DraftPage] Generating images for ${draftData.segments.length} segments...`)

    // Mark all segments that need images as "generating" upfront so user sees progress
    const pendingIndices = draftData.segments
      .map((s, i) => (!s.image_url || !s.image_url.trim() ? i : -1))
      .filter(i => i !== -1)

    if (pendingIndices.length === 0) {
      console.log('[DraftPage] All segments already have images')
      return
    }

    setGeneratingImages(new Set(pendingIndices))

    // Generate sequentially to stay within CDN timeout (one ~12s call at a time)
    for (const index of pendingIndices) {
      const segment = draftData.segments[index]
      try {
        console.log(`[DraftPage] Segment ${index}: generating...`)
        const response = await fetch('/api/content/generate-image', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ topic: segment.text, productId, imageSize: '1024x1536', imageStyle }),
        })
        const data = await response.json()
        if (!response.ok) {
          const errMsg = data?.error || `HTTP ${response.status}`
          console.error(`[DraftPage] Segment ${index}: failed — ${errMsg}`)
          setImageErrors(prev => ({ ...prev, [index]: errMsg }))
        } else {
          const imageUrl = data.imageUrl || ''
          console.log(`[DraftPage] Segment ${index}: done — ${imageUrl}`)
          setImageErrors(prev => { const n = { ...prev }; delete n[index]; return n })
          // Update UI immediately so user sees image as soon as it's ready
          setDraft(prev => {
            if (!prev) return prev
            const segs = [...prev.segments]
            segs[index] = { ...segs[index], image_url: imageUrl }
            return { ...prev, segments: segs }
          })
        }
      } catch (err: any) {
        const errMsg = err?.message || String(err)
        console.error(`[DraftPage] Segment ${index}: error — ${errMsg}`)
        setImageErrors(prev => ({ ...prev, [index]: errMsg }))
      } finally {
        // Mark this segment as no longer generating
        setGeneratingImages(prev => {
          const next = new Set(prev)
          next.delete(index)
          return next
        })
      }
    }
    console.log('[DraftPage] All segments processed')
  }

  const toggleApproval = async (index: number) => {
    if (!draft) return

    try {
      const updatedSegments = [...draft.segments]
      updatedSegments[index].approved = !updatedSegments[index].approved
      
      // Update local state immediately
      setDraft({ ...draft, segments: updatedSegments })

      // Save to Supabase
      const supabase = getSupabase()
      const { error } = await supabase
        .from('production_drafts')
        .update({ segments: updatedSegments })
        .eq('id', draftId)

      if (error) {
        console.error('[toggleApproval] Failed to save:', error)
        alert('Feil ved lagring av godkjenning')
      } else {
        console.log('[toggleApproval] Segment approval saved for index:', index)
      }
    } catch (err) {
      console.error('[toggleApproval] Error:', err)
      alert('Feil ved lagring')
    }
  }

  const regenerateImage = async (index: number) => {
    if (!draft) return

    try {
      setRegeneratingIndex(index)
      const segment = draft.segments[index]

      const response = await fetch('/api/content/generate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic: segment.text,
          productId,
          imageSize: '1024x1536',
          imageStyle,
        }),
      })

      if (!response.ok) throw new Error('Image generation failed')

      const data = await response.json()
      const updatedSegments = [...draft.segments]
      updatedSegments[index].image_url = data.imageUrl
      setDraft({ ...draft, segments: updatedSegments })
    } catch (err) {
      console.error('[DraftPage] Regenerate error:', err)
      alert('Feil ved regenerering av bilde')
    } finally {
      setRegeneratingIndex(null)
    }
  }

  const selectImageFromBank = (index: number, assetUrl: string) => {
    if (!draft) return

    const updatedSegments = [...draft.segments]
    updatedSegments[index].image_url = assetUrl
    setDraft({ ...draft, segments: updatedSegments })
    setShowImageBank(null)
  }

  const previewVoiceover = async (index: number) => {
    if (!draft) return
    const segment = draft.segments[index]
    setVoiceLoading((prev) => ({ ...prev, [index]: true }))
    try {
      const res = await fetch('/api/content/preview-voiceover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: segment.voiceover,
          voiceId: draft.voice_id || 'nhvaqgRyAq6BmFs3WcdX',
          draftId: draft.id,
          segmentIndex: index,
        }),
      })
      const data = await res.json()
      if (data.url) {
        setVoicePreviews((prev) => ({ ...prev, [index]: data.url }))
      }
    } catch (err) {
      console.error('Voiceover preview failed:', err)
    } finally {
      setVoiceLoading((prev) => ({ ...prev, [index]: false }))
    }
  }

  const startProduction = async () => {
    if (!draft) return

    try {
      // Verify that draft in DB actually has all approved before we start
      console.log('[startProduction] Verifying draft approval status in database...')
      const supabase = getSupabase()
      const { data: freshDraft } = await supabase
        .from('production_drafts')
        .select('segments')
        .eq('id', draft.id)
        .single()

      const allSaved = freshDraft?.segments?.every((s: any) => s.approved === true)
      if (!allSaved) {
        console.warn('[startProduction] Not all segments saved to database yet')
        alert('Lagring pågår, prøv igjen om et sekund')
        return
      }

      console.log('[startProduction] All segments verified as approved')

      // Determine outro card preference from URL param (set when draft was created)
      const includeOutroCard = searchParams?.get('outro') === '1'

      // Call start-production API with draftId
      const response = await fetch('/api/start-production', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          draftId: draft.id,
          imageStyle,
          includeOutroCard,
        }),
      })

      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Video production failed')

      console.log('[startProduction] Production started with jobId:', data.jobId)

      // Redirect to production status page — forward video format so the
      // status page can size the player container correctly.
      const videoFormat = draft.video_format || formatFromUrl || '9:16'
      router.push(`/dashboard/products/${productId}/video/status/${data.jobId}?format=${encodeURIComponent(videoFormat)}`)
    } catch (err) {
      console.error('[DraftPage] Production error:', err)
      alert('Feil ved start av produksjon')
    }
  }

  const allApproved = draft?.segments?.every((s) => s.approved) ?? false

  if (loading) {
    return (
      <div className="min-h-screen bg-cf-bg flex items-center justify-center">
        <div className="text-gray-600">Laster draft...</div>
      </div>
    )
  }

  if (error || !draft) {
    return (
      <div className="min-h-screen bg-cf-bg">
        <div className="max-w-6xl mx-auto px-4 py-8">
          <Link href={`/dashboard/products/${productId}`} className="text-blue-600 hover:text-blue-700 mb-4 inline-block">
            ← Tilbake til produkt
          </Link>
          <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-red-700">{error || 'Draft ikke funnet'}</div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-cf-bg">
      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <Link href={`/dashboard/products/${productId}`} className="text-blue-600 hover:text-blue-700 mb-4 inline-block">
            ← Tilbake til produkt
          </Link>
          <h1 className="text-3xl font-bold text-gray-900">Godkjenn video-draft</h1>
          <p className="text-gray-600 mt-2">Gjennomgå og godkjenn hver segment før produksjon</p>
        </div>

        {/* Image generation progress banner */}
        {generatingImages.size > 0 && (
          <div className="mb-6 bg-blue-50 border border-blue-200 rounded-lg px-5 py-4 flex items-center gap-3">
            <div className="w-5 h-5 border-[3px] border-blue-500 border-t-transparent rounded-full animate-spin flex-shrink-0" />
            <div>
              <p className="text-sm font-medium text-blue-800">
                Genererer bilder… {draft.segments.length - generatingImages.size}/{draft.segments.length} ferdig
              </p>
              <p className="text-xs text-blue-600 mt-0.5">Hvert bilde tar ca. 20 sekunder. Du kan godkjenne segmenter etter hvert som de er klare.</p>
            </div>
          </div>
        )}

        {/* Segments */}
        <div className="space-y-6 mb-8">
          {draft.segments.map((segment, index) => (
            <div key={index} className="bg-white rounded-lg border border-gray-200 p-6">
              <div className="flex gap-6">
                {/* Image */}
                <div className="flex-shrink-0 w-48">
                  {segment.image_url ? (
                    <img
                      src={segment.image_url}
                      alt={`Segment ${index + 1}`}
                      className="w-full h-48 object-cover rounded-lg border border-gray-200"
                    />
                  ) : generatingImages.has(index) ? (
                    <div className="w-full h-48 bg-gray-100 rounded-lg border border-gray-200 flex flex-col items-center justify-center gap-2 animate-pulse">
                      <div className="w-8 h-8 border-4 border-blue-400 border-t-transparent rounded-full animate-spin" />
                      <span className="text-xs text-gray-500 text-center px-2">Genererer bilde…</span>
                    </div>
                  ) : imageErrors[index] ? (
                    <div className="w-full h-48 bg-red-50 border border-red-200 rounded-lg flex flex-col items-center justify-center gap-1 px-3 text-center">
                      <span className="text-red-500 text-lg">⚠️</span>
                      <span className="text-xs text-red-600 font-medium">Bildegenerering feilet</span>
                      <span className="text-xs text-red-400 break-all">{imageErrors[index]}</span>
                    </div>
                  ) : (
                    <div className="w-full h-48 bg-gray-200 rounded-lg flex items-center justify-center text-gray-500 text-sm">
                      Ingen bilde
                    </div>
                  )}
                </div>

                {/* Content */}
                <div className="flex-1">
                  <div className="mb-4">
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">Segment {index + 1}</h3>

                    {/* Text */}
                    <div className="mb-4">
                      <label className="block text-sm font-medium text-gray-700 mb-1">Tekst</label>
                      <textarea
                        value={segment.text}
                        onChange={(e) => {
                          const updatedSegments = [...draft.segments]
                          updatedSegments[index].text = e.target.value
                          setDraft({ ...draft, segments: updatedSegments })
                        }}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        rows={2}
                      />
                    </div>

                    {/* Voiceover */}
                    <div className="mb-4">
                      <label className="block text-sm font-medium text-gray-700 mb-1">Voiceover</label>
                      <textarea
                        value={segment.voiceover}
                        onChange={(e) => {
                          const updatedSegments = [...draft.segments]
                          updatedSegments[index].voiceover = e.target.value
                          setDraft({ ...draft, segments: updatedSegments })
                        }}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        rows={3}
                      />

                      {/* Voiceover preview */}
                      <div className="mt-2 flex items-center gap-2">
                        {voicePreviews[index] ? (
                          <audio controls src={voicePreviews[index]} className="w-full h-8" />
                        ) : null}
                        <button
                          type="button"
                          onClick={() => previewVoiceover(index)}
                          disabled={voiceLoading[index]}
                          className="px-3 py-1 bg-purple-600 text-white rounded-lg text-sm disabled:opacity-50 whitespace-nowrap"
                        >
                          {voiceLoading[index]
                            ? '⏳ Genererer...'
                            : voicePreviews[index]
                              ? '🔊 Regenerer lyd'
                              : '🎙️ Hør stemme'}
                        </button>
                      </div>
                    </div>

                    {/* Approval Status */}
                    <div className="mb-4">
                      <span className={`inline-block px-3 py-1 rounded-full text-sm font-medium ${
                        segment.approved
                          ? 'bg-green-100 text-green-800'
                          : 'bg-yellow-100 text-yellow-800'
                      }`}>
                        {segment.approved ? '✅ Godkjent' : '⏳ Venter på godkjenning'}
                      </span>
                    </div>
                  </div>

                  {/* Buttons */}
                  <div className="flex gap-2 flex-wrap">
                    <button
                      onClick={() => toggleApproval(index)}
                      disabled={generatingImages.has(index)}
                      className={`px-4 py-2 rounded-lg font-medium text-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                        segment.approved
                          ? 'bg-green-600 hover:bg-green-700 text-white'
                          : 'bg-blue-600 hover:bg-blue-700 text-white'
                      }`}
                    >
                      {segment.approved ? '✅ Godkjent' : '✅ Godkjenn'}
                    </button>

                    <button
                      onClick={() => regenerateImage(index)}
                      disabled={regeneratingIndex === index}
                      className="px-4 py-2 rounded-lg font-medium text-sm bg-gray-200 hover:bg-gray-300 text-gray-900 transition-colors disabled:opacity-50"
                    >
                      {regeneratingIndex === index ? '🔄 Genererer...' : '🔄 Regenerer bilde'}
                    </button>

                    <button
                      onClick={() => setShowImageBank(index)}
                      className="px-4 py-2 rounded-lg font-medium text-sm bg-purple-600 hover:bg-purple-700 text-white transition-colors"
                    >
                      🖼️ Velg fra bank
                    </button>

                    {/* Image Bank Modal */}
                    {showImageBank === index && (
                      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                        <div className="bg-white rounded-lg p-6 max-w-2xl w-full mx-4">
                          <h4 className="text-lg font-semibold mb-4">Velg bilde fra bildebank</h4>
                          <div className="grid grid-cols-3 gap-4 mb-4 max-h-96 overflow-y-auto">
                            {assets.length > 0 ? (
                              assets.map((asset) => (
                                <button
                                  key={asset.id}
                                  onClick={() => selectImageFromBank(index, asset.asset_url)}
                                  className="group relative rounded-lg overflow-hidden aspect-square border-2 border-transparent hover:border-blue-500"
                                >
                                  <img
                                    src={asset.asset_url}
                                    alt={asset.name}
                                    className="w-full h-full object-cover group-hover:opacity-80 transition-opacity"
                                  />
                                </button>
                              ))
                            ) : (
                              <p className="col-span-3 text-gray-500 text-center py-8">Ingen bilder i banken</p>
                            )}
                          </div>
                          <button
                            onClick={() => setShowImageBank(null)}
                            className="w-full px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-900 rounded-lg font-medium"
                          >
                            Lukk
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Start Production Button */}
        <div className="sticky bottom-0 bg-white border-t border-gray-200 p-6 flex justify-between items-center">
          <div className="text-sm text-gray-600">
            {allApproved ? (
              <div className="flex items-center gap-3">
                <span className="text-green-600 font-medium">✅ Alle segmenter godkjent - klar til produksjon</span>
                <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded">
                  Stil: {{'editorial':'📸 Editorial','tech':'🖥️ Tech','warm':'🌅 Varm','minimal':'⬜ Minimal','painterly':'🎨 Maleri'}[imageStyle] || imageStyle}
                </span>
              </div>
            ) : (
              <span className="text-yellow-600 font-medium">
                ⏳ {draft.segments.filter((s) => !s.approved).length} segment(er) venter på godkjenning
              </span>
            )}
          </div>

          <button
            onClick={startProduction}
            disabled={!allApproved}
            className={`px-6 py-3 rounded-lg font-semibold text-white transition-colors ${
              allApproved
                ? 'bg-green-600 hover:bg-green-700'
                : 'bg-gray-400 cursor-not-allowed opacity-50'
            }`}
          >
            🎬 Start produksjon
          </button>
        </div>
      </div>
    </div>
  )
}
