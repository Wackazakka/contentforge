'use client'

import { useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { useAuth } from '@/lib/authContext'
import Link from 'next/link'

interface Article {
  id: string
  platform: string
  title: string
  content: string
  image_url: string
}

export default function ArticlePage() {
  const router = useRouter()
  const params = useParams()
  const { session } = useAuth()
  const productId = params?.id as string

  const [topic, setTopic] = useState('')
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>(['facebook'])
  const [loading, setLoading] = useState(false)
  const [articles, setArticles] = useState<Article[]>([])
  const [error, setError] = useState<string | null>(null)

  const platforms = ['facebook', 'linkedin', 'x']

  const togglePlatform = (platform: string) => {
    setSelectedPlatforms((prev) =>
      prev.includes(platform) ? prev.filter((p) => p !== platform) : [...prev, platform]
    )
  }

  const generateArticles = async () => {
    if (!topic.trim()) {
      setError('Vennligst skriv inn et tema')
      return
    }

    if (selectedPlatforms.length === 0) {
      setError('Velg minst en plattform')
      return
    }

    setLoading(true)
    setError(null)
    setArticles([])

    try {
      const campaignId = `campaign-${Date.now()}`

      // Call API for each platform in parallel
      const promises = selectedPlatforms.map((platform) =>
        fetch('/api/content/produce/article', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            productId,
            campaignId,
            topic,
            platform,
          }),
        }).then(async (response) => {
          if (!response.ok) {
            const data = await response.json()
            throw new Error(data.error || `Feil ved generering av ${platform} artikkel`)
          }
          return response.json()
        })
      )

      const results = await Promise.all(promises)
      const generatedArticles = results.map((result) => result.article).filter(Boolean)
      setArticles(generatedArticles)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Noe gikk galt')
    } finally {
      setLoading(false)
    }
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
    alert('Kopiert til utklippstavle!')
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <Link href={`/dashboard/products/${productId}`} className="text-blue-600 hover:text-blue-700 mb-4 inline-block">
            ← Tilbake til produkt
          </Link>
          <h1 className="text-3xl font-bold text-gray-900">Generer artikler</h1>
          <p className="text-gray-600 mt-2">Lag AI-drevet innhold for sosiale medier og blogg</p>
        </div>

        <div className="grid md:grid-cols-3 gap-8">
          {/* Form */}
          <div className="md:col-span-1">
            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Innstillinger</h2>

              {/* Topic */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">Tema eller emne</label>
                <textarea
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  placeholder="F.eks. 'Viktigheten av bærekraftig forretningspraksis'"
                  rows={4}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Platforms */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-3">Plattformer</label>
                <div className="space-y-2">
                  {platforms.map((platform) => (
                    <label key={platform} className="flex items-center">
                      <input
                        type="checkbox"
                        checked={selectedPlatforms.includes(platform)}
                        onChange={() => togglePlatform(platform)}
                        className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                      />
                      <span className="ml-2 text-sm text-gray-700 capitalize">{platform}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Error */}
              {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">{error}</div>}

              {/* Generate Button */}
              <button
                onClick={generateArticles}
                disabled={loading}
                className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-medium py-2 px-4 rounded-lg transition-colors"
              >
                {loading ? 'Genererer...' : 'Generer artikler'}
              </button>
            </div>
          </div>

          {/* Results */}
          <div className="md:col-span-2">
            {loading && (
              <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
                <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                <p className="text-gray-600 mt-4">Genererer artikler...</p>
              </div>
            )}

            {!loading && articles.length > 0 && (
              <div className="space-y-6">
                <h2 className="text-lg font-semibold text-gray-900">Genererte artikler</h2>
                {articles.map((article) => (
                  <div key={article.id} className="bg-white rounded-lg border border-gray-200 p-6">
                    {/* Platform Badge */}
                    <div className="mb-4">
                      <span className="inline-block px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm font-medium capitalize">
                        {article.platform}
                      </span>
                    </div>

                    {/* Title */}
                    <h3 className="text-xl font-semibold text-gray-900 mb-2">{article.title}</h3>

                    {/* Content */}
                    <div className="bg-gray-50 rounded-lg p-4 mb-4 max-h-48 overflow-y-auto">
                      <p className="text-gray-700 whitespace-pre-wrap text-sm">{article.content}</p>
                    </div>

                    {/* Copy Button */}
                    <button
                      onClick={() => copyToClipboard(article.content)}
                      className="text-sm text-blue-600 hover:text-blue-700 font-medium mb-4"
                    >
                      📋 Kopier innhold
                    </button>

                    {/* Image */}
                    {article.image_url && (
                      <div className="mt-4">
                        <img
                          src={article.image_url}
                          alt={article.title}
                          className="w-full h-48 object-cover rounded-lg border border-gray-200"
                          onError={(e) => {
                            e.currentTarget.src = 'https://via.placeholder.com/300x200?text=Image+Not+Available'
                          }}
                        />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {!loading && articles.length === 0 && !error && (
              <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
                <p className="text-gray-500">Fylg inn et tema og klikk "Generer artikler" for å komme i gang</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
