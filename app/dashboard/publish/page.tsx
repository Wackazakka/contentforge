'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'

interface SocialConnection {
  id: string
  platform: string
  page_id: string
  page_name: string
  created_at: string
}

function PublishPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [supabase] = useState(() =>
    createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
  )

  const [connections, setConnections] = useState<SocialConnection[]>([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState<string | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [products, setProducts] = useState<any[]>([])
  const [selectedProduct, setSelectedProduct] = useState<string>('')
  const [contentType, setContentType] = useState<'video' | 'article'>('video')
  const [videos, setVideos] = useState<any[]>([])
  const [selectedContent, setSelectedContent] = useState<any>(null)
  const [selectedPages, setSelectedPages] = useState<string[]>([])
  const [caption, setCaption] = useState('')
  const [publishing, setPublishing] = useState(false)
  const [publishResult, setPublishResult] = useState<any>(null)

  useEffect(() => {
    // Get current user
    const fetchUser = async () => {
      try {
        const { data } = await supabase.auth.getUser()
        setUserId(data.user?.id || null)
      } catch (err) {
        console.error('[publish] Failed to fetch user:', err)
      }
    }
    fetchUser()
  }, [supabase])

  useEffect(() => {
    // Fetch products
    const fetchProducts = async () => {
      try {
        const { data, error } = await supabase.from('products').select('*')
        console.log('[publish] products:', data, 'error:', error)
        setProducts(data || [])
      } catch (err) {
        console.error('[publish] Failed to fetch products:', err)
      }
    }
    fetchProducts()
  }, [supabase])

  useEffect(() => {
    // Fetch videos when product is selected
    if (!selectedProduct) {
      setVideos([])
      return
    }
    const fetchVideos = async () => {
      try {
        const { data, error } = await supabase
          .from('production_drafts')
          .select('*')
          .eq('product_id', selectedProduct)
          .not('job_id', 'is', null)
        console.log('[publish] videos for product', selectedProduct, ':', data, 'error:', error)
        setVideos(data || [])
      } catch (err) {
        console.error('[publish] Failed to fetch videos:', err)
      }
    }
    fetchVideos()
  }, [selectedProduct, supabase])

  useEffect(() => {
    const connected = searchParams.get('connected')
    if (connected) {
      setMessage(`✅ ${connected} connected successfully!`)
      setTimeout(() => setMessage(null), 3000)
    }

    const error = searchParams.get('error')
    if (error) {
      setMessage(`❌ Error: ${error}`)
    }
  }, [searchParams])

  useEffect(() => {
    const fetchConnections = async () => {
      try {
        setLoading(true)
        const { data, error } = await supabase
          .from('social_connections')
          .select('*')
          .order('created_at', { ascending: false })

        if (error) {
          console.error('[publish] Error fetching connections:', error)
          setMessage('❌ Failed to load connections')
          return
        }

        setConnections(data || [])
      } catch (err) {
        console.error('[publish] Error:', err)
        setMessage('❌ Error loading connections')
      } finally {
        setLoading(false)
      }
    }

    fetchConnections()
  }, [supabase])

  const handleDisconnect = async (id: string) => {
    if (!confirm('Are you sure you want to disconnect this account?')) return

    try {
      const { error } = await supabase.from('social_connections').delete().eq('id', id)

      if (error) {
        setMessage('❌ Failed to disconnect')
        return
      }

      setConnections(connections.filter((c) => c.id !== id))
      setMessage('✅ Account disconnected')
      setTimeout(() => setMessage(null), 2000)
    } catch (err) {
      console.error('[publish] Disconnect error:', err)
      setMessage('❌ Error disconnecting')
    }
  }

  const handlePublish = async () => {
    if (!selectedContent || selectedPages.length === 0 || !caption) {
      setMessage('❌ Velg innhold, sider og skriv en bildeskrift')
      return
    }

    setPublishing(true)
    try {
      const videoUrl = `${process.env.NEXT_PUBLIC_R2_URL}/videos/${selectedContent.job_id}/output.mp4`
      const res = await fetch('/api/publish/facebook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pageIds: selectedPages,
          videoUrl,
          caption,
        }),
      })
      const data = await res.json()
      setPublishResult(data)
      setMessage(data.success ? '✅ Publisert!' : `❌ ${data.error}`)
    } catch (err) {
      console.error('[publish] Publish error:', err)
      setMessage('❌ Error publishing')
    } finally {
      setPublishing(false)
    }
  }

  return (
    <div className="max-w-4xl mx-auto p-8">
      <h1 className="text-2xl font-bold mb-6">Publiser innhold</h1>

      {message && (
        <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          {message}
        </div>
      )}

      {/* Velg innhold */}
      {connections.length > 0 && (
        <div className="bg-white rounded-xl border p-6 mb-6">
          <h2 className="font-semibold mb-4">Velg innhold</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Produkt</label>
              <select
                value={selectedProduct}
                onChange={(e) => setSelectedProduct(e.target.value)}
                className="w-full border rounded-lg px-3 py-2"
              >
                <option value="">Velg produkt...</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>

            {videos.length > 0 && (
              <div>
                <label className="block text-sm font-medium mb-1">Video</label>
                <div className="space-y-2">
                  {videos.map((v) => (
                    <div
                      key={v.id}
                      onClick={() => setSelectedContent(v)}
                      className={`p-3 border rounded-lg cursor-pointer ${
                        selectedContent?.id === v.id ? 'border-blue-500 bg-blue-50' : ''
                      }`}
                    >
                      <p className="text-sm font-medium">
                        {v.campaign_name || v.title || 'Uten navn'}
                      </p>
                      <p className="text-xs text-gray-400">
                        {new Date(v.created_at).toLocaleDateString('nb-NO', {
                          day: 'numeric',
                          month: 'long',
                          year: 'numeric',
                        })}
                      </p>
                      {v.job_id && <span className="text-xs text-green-600">✅ Video klar</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Kanal-velger */}
      {selectedContent && (
        <div className="bg-white rounded-xl border p-6 mb-6">
          <h2 className="font-semibold mb-4">Velg sider</h2>
          <div className="space-y-2">
            {connections.map((c) => (
              <label key={c.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg cursor-pointer hover:bg-gray-100">
                <input
                  type="checkbox"
                  checked={selectedPages.includes(c.page_id)}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setSelectedPages((prev) => [...prev, c.page_id])
                    } else {
                      setSelectedPages((prev) => prev.filter((id) => id !== c.page_id))
                    }
                  }}
                />
                <span>📘 {c.page_name}</span>
              </label>
            ))}
          </div>
        </div>
      )}

      {/* Caption og publiser */}
      {selectedPages.length > 0 && (
        <div className="bg-white rounded-xl border p-6 mb-6">
          <h2 className="font-semibold mb-4">Caption</h2>
          <textarea
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            rows={4}
            placeholder="Skriv en caption til innlegget..."
            className="w-full border rounded-lg px-3 py-2 text-sm"
          />
          <button
            onClick={handlePublish}
            disabled={publishing || !caption}
            className="mt-4 w-full bg-blue-600 text-white py-3 rounded-lg font-medium disabled:opacity-50"
          >
            {publishing ? '⏳ Publiserer...' : '🚀 Publiser nå'}
          </button>
          {publishResult && (
            <p className="mt-3 text-sm text-green-600">✅ Publisert!</p>
          )}
        </div>
      )}

      {/* Koblede kontoer */}
      <div className="bg-white rounded-xl border p-6 mb-6">
        <h2 className="font-semibold mb-4">Koblede kontoer</h2>
        {connections.length === 0 ? (
          <div>
            <p className="text-gray-500 mb-4">Ingen kontoer koblet ennå.</p>
            {userId ? (
              <a
                href={`/api/auth/facebook?userId=${userId}`}
                className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm"
              >
                Koble til Facebook/Instagram
              </a>
            ) : (
              <p className="text-gray-400 text-sm">Laster bruker...</p>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            {connections.map((c) => (
              <div key={c.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                <span>{c.platform === 'facebook' ? '📘' : '📸'}</span>
                <span className="font-medium">{c.page_name}</span>
                <span className="text-xs text-gray-400">{c.platform}</span>
              </div>
            ))}
            {userId && (
              <a
                href={`/api/auth/facebook?userId=${userId}`}
                className="inline-block mt-2 text-sm text-blue-600 hover:underline"
              >
                + Koble til flere kontoer
              </a>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default PublishPage
