'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { useAuth } from '@/lib/authContext'
import Link from 'next/link'
import { getSupabase } from '@/lib/supabaseClient'

function renderMarkdown(text: string) {
  const [mainContent, ctaContent] = text.split('\n\n---CTA---\n')
  const fmt = (s: string) =>
    s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\*(.+?)\*/g, '<em>$1</em>')
  return (
    <div>
      <div dangerouslySetInnerHTML={{ __html: fmt(mainContent) }} />
      {ctaContent && (
        <>
          <hr className="border-gray-300 my-3" />
          <p className="text-xs text-gray-400 italic" dangerouslySetInnerHTML={{ __html: fmt(ctaContent) }} />
        </>
      )}
    </div>
  )
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
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState('')
  const [saving, setSaving] = useState(false)

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
      // Images are generated in the background via Netlify function — no separate call needed
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

  const startEdit = (article: Article) => {
    setEditingId(article.id)
    setEditDraft(article.content)
  }

  const cancelEdit = () => {
    setEditingId(null)
    setEditDraft('')
  }

  const saveEdit = async (articleId: string) => {
    setSaving(true)
    try {
      const supabase = getSupabase()
      const { error } = await supabase
        .from('articles')
        .update({ content: editDraft })
        .eq('id', articleId)
      if (error) throw error
      setArticles((prev) =>
        prev.map((a) => (a.id === articleId ? { ...a, content: editDraft } : a))
      )
      setEditingId(null)
    } catch (err) {
      alert('Feil ved lagring: ' + (err instanceof Error ? err.message : String(err)))
    } finally {
      setSaving(false)
    }
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
                    {editingId === article.id ? (
                      <div className="mb-4">
                        <textarea
                          value={editDraft}
                          onChange={(e) => setEditDraft(e.target.value)}
                          rows={12}
                          className="w-full px-3 py-2 border border-blue-400 rounded-lg text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
                        />
                        <div className="flex gap-2 mt-2">
                          <button
                            onClick={() => saveEdit(article.id)}
                            disabled={saving}
                            className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white text-sm font-medium rounded-lg transition-colors"
                          >
                            {saving ? 'Lagrer...' : '✅ Lagre'}
                          </button>
                          <button
                            onClick={cancelEdit}
                            className="px-4 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium rounded-lg transition-colors"
                          >
                            Avbryt
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="bg-gray-50 rounded-lg p-4 mb-2 max-h-48 overflow-y-auto">
                        <div className="text-gray-700 whitespace-pre-wrap text-sm">
                          {renderMarkdown(article.content)}
                        </div>
                      </div>
                    )}

                    {/* Action buttons */}
                    {editingId !== article.id && (
                      <div className="flex gap-3 mb-4">
                        <button
                          onClick={() => startEdit(article)}
                          className="text-sm text-gray-600 hover:text-gray-800 font-medium"
                        >
                          ✏️ Rediger
                        </button>
                        <button
                          onClick={() => copyToClipboard(article.content)}
                          className="text-sm text-blue-600 hover:text-blue-700 font-medium"
                        >
                          📋 Kopier
                        </button>
                      </div>
                    )}

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

                {/* Navigation hint */}
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-start gap-3">
                  <span className="text-xl">💡</span>
                  <div>
                    <p className="text-sm font-medium text-blue-900">Grafikk genereres i bakgrunnen</p>
                    <p className="text-sm text-blue-700 mt-1">
                      Ferdig artikkel med bilde og publiseringsknapp finner du under{' '}
                      <Link
                        href={`/dashboard/products/${productId}`}
                        className="underline font-medium hover:text-blue-900"
                      >
                        Produktsiden → Artikler
                      </Link>
                      {' '}om ca. 30–60 sekunder.
                    </p>
                  </div>
                </div>
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
