'use client'

import { useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'

export default function NewDraftPage() {
  const router = useRouter()
  const params = useParams()
  const productId = params?.id as string

  const [topic, setTopic] = useState('')
  const [segmentCount, setSegmentCount] = useState(4)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!topic.trim()) {
      setError('Vennligst skriv inn et tema')
      return
    }

    try {
      setLoading(true)
      setError(null)

      const campaignId = `campaign-${Date.now()}`

      const response = await fetch('/api/content/produce/draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId,
          campaignId,
          topic,
          segmentCount,
        }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Feil ved opprettelse av draft')
      }

      const data = await response.json()
      // Navigate to draft review page
      router.push(`/dashboard/products/${productId}/video/draft/${data.draftId}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Noe gikk galt')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-2xl mx-auto px-4 py-8">
        {/* Header */}
        <Link href={`/dashboard/products/${productId}`} className="text-blue-600 hover:text-blue-700 mb-4 inline-block">
          ← Tilbake til produkt
        </Link>

        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Opprett ny video-draft</h1>
          <p className="text-gray-600 mt-2">Definer tema og antall segmenter for videoen</p>
        </div>

        {/* Form */}
        <div className="bg-white rounded-lg border border-gray-200 p-8">
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Error */}
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
                {error}
              </div>
            )}

            {/* Topic */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Tema for video *
              </label>
              <textarea
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="F.eks. Hvordan velge riktig biler for familiebruk"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                rows={4}
              />
              <p className="text-xs text-gray-500 mt-1">Beskriv hva videoen skal handle om</p>
            </div>

            {/* Segment Count */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Antall segmenter
              </label>
              <select
                value={segmentCount}
                onChange={(e) => setSegmentCount(Number(e.target.value))}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value={2}>2 segmenter</option>
                <option value={3}>3 segmenter</option>
                <option value={4}>4 segmenter (anbefalt)</option>
                <option value={5}>5 segmenter</option>
                <option value={6}>6 segmenter</option>
              </select>
              <p className="text-xs text-gray-500 mt-1">Hver segment blir en del av videoen</p>
            </div>

            {/* Info */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-900">
              <p className="font-medium mb-2">📌 Prosess:</p>
              <ol className="list-decimal list-inside space-y-1 text-xs">
                <li>Claude genererer et manus med {segmentCount} segmenter</li>
                <li>DALL-E genererer et bilde for hvert segment</li>
                <li>Du godkjenner segmentene før produksjon starter</li>
              </ol>
            </div>

            {/* Buttons */}
            <div className="flex gap-3">
              <button
                type="submit"
                disabled={loading}
                className={`flex-1 px-6 py-3 rounded-lg font-semibold text-white transition-colors ${
                  loading
                    ? 'bg-gray-400 cursor-not-allowed'
                    : 'bg-blue-600 hover:bg-blue-700'
                }`}
              >
                {loading ? '⏳ Genererer draft...' : '🎬 Opprett draft'}
              </button>

              <button
                type="button"
                onClick={() => router.back()}
                className="px-6 py-3 rounded-lg font-semibold text-gray-900 bg-gray-200 hover:bg-gray-300 transition-colors"
              >
                Avbryt
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
