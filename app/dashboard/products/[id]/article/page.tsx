'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { useAuth } from '@/lib/authContext'
import Link from 'next/link'
import { getSupabase } from '@/lib/supabaseClient'

// Simple markdown renderer - converts **text** to <strong> and *text* to <em>
function renderMarkdown(text: string) {
  const html = text
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
  
  return <div dangerouslySetInnerHTML={{ __html: html }} />
}

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
  const [imageStyle, setImageStyle] = useState<string>('tech')
  const [includeLink, setIncludeLink] = useState(false)
  const [websiteUrl, setWebsiteUrl] = useState<string>('')
  const [ctaText, setCtaText] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const [articles, setArticles] = useState<Article[]>([])
  const [error, setError] = useState<string | null>(null)
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [imageLoading, setImageLoading] = useState(false)

  const platforms = ['facebook', 'linkedin', 'x']

  const imageStyles = [
    { key: 'tech', name: 'Tech', desc: 'Premium CGI, glass og krom, hi-tech mood' },
    { key: 'editorial', name: 'Editorial', desc: 'Flat design, magasinforside-stil' },
    { key: 'warm', name: 'Warm', desc: 'Lifestyle-foto, varme toner, naturlig lys' },
    { key: 'minimal', name: 'Minimal', desc: 'Rene linjer, hvit bakgrunn, infografikk' },
    { key: 'painterly', name: 'Painterly', desc: 'Malerisk, penselstrøk, kunstnerisk' },
  ]
  useEffect(() => {
    if (!productId) return
    const supabase = getSupabase()
    supabase
      .from("product_profiles")
      .select("website_url, cta_text")
      .eq("product_id", productId)
      .maybeSingle()
      .then(({ data }: { data: any }) => {
        if (data?.website_url) setWebsiteUrl(data.website_url)
        if (data?.cta_text) {
          setCtaText(data.cta_text)
          setIncludeLink(true) // auto-enable when CTA text is configured
        }
      })
  }, [productId])


  const togglePlatform = (platform: string) => {
    setSelectedPlatforms((prev) =>
      prev.includes(platform) ? prev.filter((p) => p !== platform) : [...prev, platform]
    )
  }

  const generateArticles = async () => {
    if (!topic.trim()) {
      setError('Please enter a topic')
      return
    }

    if (selectedPlatforms.length === 0) {
      setError('Select at least one platform')
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
            imageStyle,
            includeLink,
            websiteUrl,
            ctaText,
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

      // Generate image in parallel
      setImageLoading(true)
      try {
        console.log('[ArticlePage] Starting image generation for topic:', topic)
        // Send articleIds from all generated articles
        const articleIds = generatedArticles.map((a) => a.id)
        const imageResponse = await fetch('/api/content/generate-image', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            topic,
            productId,
            articleIds,
          }),
        })

        console.log('[ArticlePage] Image API response status:', imageResponse.status)

        if (imageResponse.ok) {
          const imageData = await imageResponse.json()
          console.log('[ArticlePage] Image generated successfully:', imageData.imageUrl)
          setImageUrl(imageData.imageUrl)
        } else {
          const errorData = await imageResponse.json().catch(() => ({}))
          console.error('[ArticlePage] Image generation failed with status', imageResponse.status, errorData)
        }
      } catch (imgErr) {
        console.error('[ArticlePage] Image generation error:', imgErr instanceof Error ? imgErr.message : String(imgErr))
      } finally {
        setImageLoading(false)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
    alert('Copied to clipboard!')
  }

  return (
    <div className="min-h-screen bg-cf-bg">
      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <Link href={`/dashboard/products/${productId}`} className="text-blue-600 hover:text-blue-700 mb-4 inline-block">
            ← Back to product
          </Link>
          <h1 className="text-3xl font-bold text-gray-900">Generate articles</h1>
          <p className="text-gray-600 mt-2">Create AI-powered content for social media and blog</p>
        </div>

        <div className="grid md:grid-cols-3 gap-8">
          {/* Form */}
          <div className="md:col-span-1">
            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Settings</h2>

              {/* Topic */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">Topic or subject</label>
                <textarea
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  placeholder="E.g. 'The importance of sustainable business practices'"
                  rows={4}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Platforms */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-3">Platforms</label>
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

              {/* Image Style */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-3">Bildestil</label>
                <div className="grid grid-cols-1 gap-2">
                  {imageStyles.map((style) => (
                    <button
                      key={style.key}
                      onClick={() => setImageStyle(style.key)}
                      className={`text-left px-3 py-2 rounded-lg border text-sm transition-colors ${imageStyle === style.key ? "border-blue-500 bg-blue-50 text-blue-800" : "border-gray-200 hover:border-gray-300 text-gray-700"}`}
                    >
                      <span className="font-medium">{style.name}</span>
                      <span className="text-xs text-gray-500 block">{style.desc}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Product link / CTA */}
              {(websiteUrl || ctaText) && (
                <div className="mb-6">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={includeLink}
                      onChange={(e) => setIncludeLink(e.target.checked)}
                      className="w-4 h-4 text-blue-600 rounded"
                    />
                    <span className="text-sm text-gray-700">Avslutt med CTA</span>
                  </label>
                  {includeLink && (
                    <p className="text-xs text-gray-400 mt-1 ml-6 italic">
                      {ctaText || websiteUrl}
                    </p>
                  )}
                </div>
              )}

              {/* Error */}
              {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">{error}</div>}

              {/* Generate Button */}
              <button
                onClick={generateArticles}
                disabled={loading}
                className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-medium py-2 px-4 rounded-lg transition-colors"
              >
                {loading ? 'Generating...' : 'Generate articles'}
              </button>
            </div>
          </div>

          {/* Results */}
          <div className="md:col-span-2">
            {loading && (
              <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
                <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                <p className="text-gray-600 mt-4">Generating articles...</p>
              </div>
            )}

            {!loading && articles.length > 0 && (
              <div className="space-y-6">
                {/* Image Section */}
                {imageLoading && (
                  <div className="bg-white rounded-lg border border-gray-200 p-6">
                    <div className="flex flex-col items-center justify-center py-12">
                      <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                      <p className="text-gray-600 mt-4">Generating image...</p>
                    </div>
                  </div>
                )}

                {imageUrl && !imageLoading && (
                  <div className="bg-white rounded-lg border border-gray-200 p-6">
                    <h3 className="text-lg font-semibold text-gray-900 mb-4">Campaign image</h3>
                    <img
                      src={imageUrl}
                      alt="Campaign image"
                      className="w-full rounded-lg border border-gray-200"
                      onError={(e) => {
                        e.currentTarget.src = 'https://via.placeholder.com/600x400?text=Image+Not+Available'
                      }}
                    />
                  </div>
                )}

                <h2 className="text-lg font-semibold text-gray-900">Generated articles</h2>
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
                      <div className="text-gray-700 whitespace-pre-wrap text-sm">
                        {renderMarkdown(article.content)}
                      </div>
                    </div>

                    {/* Copy Button */}
                    <button
                      onClick={() => copyToClipboard(article.content)}
                      className="text-sm text-blue-600 hover:text-blue-700 font-medium mb-4"
                    >
                      📋 Copy content
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
                <p className="text-gray-500">Enter a topic and click "Generate articles" to get started</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
