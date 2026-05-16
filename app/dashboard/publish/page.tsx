'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { getSupabase } from '@/lib/supabaseClient'
import { useTranslations } from 'next-intl'

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
  const supabase = getSupabase()
  const t = useTranslations('publish')

  const [connections, setConnections] = useState<SocialConnection[]>([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState<string | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [products, setProducts] = useState<any[]>([])
  const [selectedProduct, setSelectedProduct] = useState<string>('')
  const [contentType, setContentType] = useState<'video' | 'article'>('video')
  const [videos, setVideos] = useState<any[]>([])
  const [articles, setArticles] = useState<any[]>([])
  const [selectedContent, setSelectedContent] = useState<any>(null)
  const [selectedPages, setSelectedPages] = useState<string[]>([])
  const [caption, setCaption] = useState('')
  const [publishing, setPublishing] = useState(false)
  const [publishResult, setPublishResult] = useState<any>(null)
  const [publications, setPublications] = useState<any[]>([])
  const [publishPlatform, setPublishPlatform] = useState<'facebook' | 'instagram' | 'tiktok' | 'linkedin' | 'x' | 'reddit'>('facebook')
  const [subreddit, setSubreddit] = useState('')
  const [prefillJobId, setPrefillJobId] = useState<string | null>(null)
  const [prefillContentId, setPrefillContentId] = useState<string | null>(null)
  const [publishMode, setPublishMode] = useState<'now' | 'schedule'>('now')
  const [scheduledAt, setScheduledAt] = useState<string>('')
  const [scheduling, setScheduling] = useState(false)

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
    // Fetch videos or articles when product is selected
    if (!selectedProduct) {
      setVideos([])
      setArticles([])
      return
    }
    
    const fetchContent = async () => {
      try {
        if (contentType === 'video') {
          const { data, error } = await supabase
            .from('production_drafts')
            .select('*')
            .eq('product_id', selectedProduct)
            .not('job_id', 'is', null)
          console.log('[publish] videos for product', selectedProduct, ':', data, 'error:', error)
          setVideos(data || [])
          setArticles([])
          if (prefillJobId && data) {
            const match = data.find((v: any) => v.job_id === prefillJobId)
            if (match) setSelectedContent(match)
          }
        } else {
          const { data, error } = await supabase
            .from('articles')
            .select('*')
            .eq('product_id', selectedProduct)
          console.log('[publish] articles for product', selectedProduct, ':', data, 'error:', error)
          setArticles(data || [])
          setVideos([])
          if (prefillContentId && data) {
            const match = data.find((a: any) => a.id === prefillContentId)
            if (match) setSelectedContent(match)
          }
        }
      } catch (err) {
        console.error('[publish] Failed to fetch content:', err)
      }
    }
    fetchContent()
  }, [selectedProduct, contentType, supabase, prefillJobId, prefillContentId])

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

    // Pre-fill from product page links
    const type = searchParams.get('type') as 'video' | 'article' | null
    const productId = searchParams.get('product_id')
    const jobId = searchParams.get('job_id')
    const contentId = searchParams.get('content_id')

    if (type) setContentType(type)
    if (productId) setSelectedProduct(productId)
    if (jobId) setPrefillJobId(jobId)
    if (contentId) setPrefillContentId(contentId)
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
    if (!confirm(t('disconnectConfirm'))) return

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

  const handleSchedule = async () => {
    if (!selectedContent || selectedPages.length === 0 || !caption || !scheduledAt) {
      setMessage(t('errorSelectContent'))
      return
    }
    const publishTime = new Date(scheduledAt)
    if (publishTime <= new Date()) {
      setMessage(t('errorFutureTime'))
      return
    }

    setScheduling(true)
    setMessage(null)
    try {
      const row: Record<string, any> = {
        platform: publishPlatform,
        content_type: contentType,
        scheduled_at: publishTime.toISOString(),
        production_id: selectedProduct || null,
        page_id: selectedPages[0] || null,
        caption,
        draft_id: selectedContent.id,
        job_id: selectedContent.job_id || null,
        user_id: userId,
      }

      console.log('[schedule] inserting:', row)
      const { data, error } = await supabase
        .from('scheduled_publications')
        .insert(row)
        .select()

      console.log('[schedule] result data:', data, 'error:', error)

      if (error) {
        setMessage(`❌ ${error.message}`)
        return
      }

      setMessage(
        `✅ Scheduled for ${publishTime.toLocaleString('en-GB', {
          day: 'numeric',
          month: 'long',
          hour: '2-digit',
          minute: '2-digit',
        })}`
      )
      setScheduledAt('')
      setPublishMode('now')
    } catch (err) {
      console.error('[publish] Schedule error:', err)
      setMessage(`❌ ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setScheduling(false)
    }
  }

  const handlePublish = async () => {
    if (!selectedContent || selectedPages.length === 0 || !caption) {
      setMessage(t('errorSelectPublish'))
      return
    }

    setPublishing(true)
    try {
      // Build pages map for page names
      const pagesMap: Record<string, string> = {}
      connections.forEach((c) => {
        if (selectedPages.includes(c.page_id)) {
          pagesMap[c.page_id] = c.page_name
        }
      })

      let endpoint = '/api/publish/facebook'
      const body: any = {
        pageIds: selectedPages,
        contentType,
        draftId: selectedContent.id,
        productId: selectedProduct,
        userId,
        pages: pagesMap,
      }

      if (contentType === 'video') {
        body.videoUrl = `${process.env.NEXT_PUBLIC_R2_URL}/videos/${selectedContent.job_id}/output.mp4`
        body.caption = caption
        if (publishPlatform === 'tiktok') {
          endpoint = '/api/publish/tiktok'
          body.tiktokAccountId = selectedPages[0]
        } else if (publishPlatform === 'linkedin') {
          endpoint = '/api/publish/linkedin'
          body.linkedinAccountId = selectedPages[0]
          body.contentType = 'video'
        } else if (publishPlatform === 'x') {
          endpoint = '/api/publish/x'
          body.xAccountId = selectedPages[0]
          body.contentType = 'video'
        } else if (publishPlatform === 'reddit') {
          endpoint = '/api/publish/reddit'
          body.redditAccountId = selectedPages[0]
          body.subreddit = subreddit
          body.contentType = 'video'
        } else {
          endpoint = publishPlatform === 'facebook' ? '/api/publish/facebook' : '/api/publish/instagram'
        }
      } else {
        body.articleContent = selectedContent.content
        body.articleTitle = selectedContent.title
        body.articleId = selectedContent.id
        if (publishPlatform === 'linkedin') {
          endpoint = '/api/publish/linkedin'
          body.linkedinAccountId = selectedPages[0]
          body.contentType = 'article'
        } else if (publishPlatform === 'x') {
          endpoint = '/api/publish/x'
          body.xAccountId = selectedPages[0]
          body.contentType = 'article'
        } else if (publishPlatform === 'reddit') {
          endpoint = '/api/publish/reddit'
          body.redditAccountId = selectedPages[0]
          body.subreddit = subreddit
          body.contentType = 'article'
        } else {
          endpoint = '/api/publish/facebook-article'
        }
      }

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()

      // Instagram uses async processing — poll status endpoint until done
      if (publishPlatform === 'instagram' && data.processing && data.results?.length) {
        setMessage('⏳ Instagram behandler videoen din...')
        const jobInfo = data.results[0]
        let attempts = 0
        while (attempts < 60) {
          await new Promise((r) => setTimeout(r, 5000))
          const statusRes = await fetch('/api/publish/instagram/status', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...jobInfo, videoUrl: body.videoUrl }),
          })
          const statusData = await statusRes.json()
          if (statusData.status === 'published') {
            setMessage(t('published'))
            setPublishResult(statusData)
            break
          }
          if (statusData.status === 'failed') {
            setMessage(`❌ ${statusData.error}`)
            break
          }
          attempts++
          if (attempts >= 60) {
            setMessage('❌ Tidsavbrudd — Instagram brukte for lang tid på å prosessere videoen')
          }
        }
      } else {
        setPublishResult(data)
        setMessage(data.success ? t('published') : `❌ ${data.error}`)
      }

      // Refresh publications
      const { data: pubs } = await supabase
        .from('publications')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(20)
      setPublications(pubs || [])
    } catch (err) {
      console.error('[publish] Publish error:', err)
      setMessage('❌ Error publishing')
    } finally {
      setPublishing(false)
    }
  }

  // Fetch publications on mount and when publishResult changes
  useEffect(() => {
    const fetchPublications = async () => {
      try {
        const { data } = await supabase
          .from('publications')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(20)
        setPublications(data || [])
      } catch (err) {
        console.error('[publish] Failed to fetch publications:', err)
      }
    }
    fetchPublications()
  }, [publishResult, supabase])

  return (
    <div className="max-w-3xl mx-auto p-8">
      <h1 className="text-2xl font-bold mb-6">{t('title')}</h1>

      {message && (
        <div className={`mb-4 p-4 rounded-lg border text-sm ${
          message.startsWith('✅')
            ? 'bg-green-50 border-green-200 text-green-800'
            : message.startsWith('❌')
            ? 'bg-red-50 border-red-200 text-red-700'
            : 'bg-[#EBF4FF] border-[#378ADD]'
        }`}>
          {message}
        </div>
      )}

      {/* ── Steg 1: Innhold ── */}
      <div className="bg-white rounded-xl border p-6 mb-4">
        <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-4">{t('step1')}</p>

        <div className="flex gap-2 mb-5">
          <button
            onClick={() => { setContentType('video'); setSelectedContent(null) }}
            className={`flex-1 py-2 rounded-lg font-medium transition-colors ${
              contentType === 'video' ? 'bg-[#185FA5] text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            {t('videoButton')}
          </button>
          <button
            onClick={() => { setContentType('article'); setSelectedContent(null) }}
            className={`flex-1 py-2 rounded-lg font-medium transition-colors ${
              contentType === 'article' ? 'bg-[#185FA5] text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            {t('articleButton')}
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">{t('productLabel')}</label>
            <select
              value={selectedProduct}
              onChange={(e) => setSelectedProduct(e.target.value)}
              className="w-full border rounded-lg px-3 py-2"
            >
              <option value="">{t('selectProduct')}</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>

          {contentType === 'video' && videos.length > 0 && (
            <div>
              <label className="block text-sm font-medium mb-2">{t('selectVideo')}</label>
              <div className="grid grid-cols-2 gap-3">
                {videos.map((v) => {
                  const videoUrl = v.job_id
                    ? `${process.env.NEXT_PUBLIC_R2_URL}/videos/${v.job_id}/output.mp4`
                    : null
                  const isSelected = selectedContent?.id === v.id
                  return (
                    <div
                      key={v.id}
                      onClick={() => setSelectedContent(v)}
                      className={`relative border-2 rounded-lg overflow-hidden cursor-pointer transition-all ${
                        isSelected ? 'border-[#185FA5] ring-2 ring-[#c3ddf7]' : 'border-gray-200 hover:border-[#378ADD]'
                      }`}
                    >
                      {videoUrl ? (
                        <video src={videoUrl} muted preload="metadata" className="w-full object-cover bg-black" style={{ maxHeight: '140px' }} />
                      ) : (
                        <div className="w-full flex items-center justify-center bg-gray-100 text-gray-400 text-2xl" style={{ height: '100px' }}>🎬</div>
                      )}
                      {isSelected && (
                        <div className="absolute top-2 right-2 bg-[#185FA5] text-white text-xs px-2 py-0.5 rounded-full font-medium">{t('selected')}</div>
                      )}
                      <div className="p-2">
                        <div className="flex items-start gap-1 mb-0.5">
                          <p className="text-xs font-medium text-gray-800 flex-1 min-w-0 truncate">
                            {v.campaign_name || v.title || v.segments?.[0]?.text?.slice(0, 40) || t('unnamed')}
                          </p>
                          {(() => {
                            const fmt = (v.video_format || '9:16').split(',')[0].trim()
                            const label = fmt === '16:9' ? '↔ 16:9' : fmt === '1:1' ? '⬜ 1:1' : '↕ 9:16'
                            const bg = fmt === '16:9' ? '#E0F2FE' : fmt === '1:1' ? '#FEF9C3' : '#EDE9FE'
                            const color = fmt === '16:9' ? '#0369A1' : fmt === '1:1' ? '#854D0E' : '#6D28D9'
                            return (
                              <span className="text-xs px-1.5 py-0.5 rounded-full font-medium shrink-0" style={{ backgroundColor: bg, color }}>
                                {label}
                              </span>
                            )
                          })()}
                        </div>
                        <p className="text-xs text-gray-400">
                          {new Date(v.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                        </p>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {contentType === 'article' && articles.length > 0 && (
            <div>
              <label className="block text-sm font-medium mb-1">{t('selectArticle')}</label>
              <div className="space-y-2">
                {articles.map((a) => (
                  <div
                    key={a.id}
                    onClick={() => setSelectedContent(a)}
                    className={`p-3 border rounded-lg cursor-pointer transition-colors ${
                      selectedContent?.id === a.id ? 'border-[#185FA5] bg-[#EBF4FF]' : 'hover:border-[#378ADD]'
                    }`}
                  >
                    <p className="text-sm font-medium">{a.title}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs bg-gray-200 text-gray-700 px-2 py-1 rounded">
                        {a.platform === 'linkedin' ? '💼' : a.platform === 'facebook' ? '📘' : '𝕏'} {a.platform}
                      </span>
                      <span className="text-xs text-gray-400">
                        {new Date(a.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Steg 2: Caption + Tidspunkt ── alltid synlig når innhold er valgt */}
      {selectedContent && (
        <div className="bg-white rounded-xl border p-6 mb-4">
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-4">{t('step2')}</p>

          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('captionLabel')}</label>
            <textarea
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              rows={4}
              placeholder={t('captionPlaceholder')}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#185FA5]"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">{t('publishWhen')}</label>
            <div className="flex gap-2 mb-3">
              <button
                onClick={() => setPublishMode('now')}
                className={`flex-1 py-2 rounded-lg font-medium text-sm transition-colors ${
                  publishMode === 'now' ? 'bg-[#185FA5] text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {t('publishNow')}
              </button>
              <button
                onClick={() => setPublishMode('schedule')}
                className={`flex-1 py-2 rounded-lg font-medium text-sm transition-colors ${
                  publishMode === 'schedule' ? 'bg-[#185FA5] text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {t('schedule')}
              </button>
            </div>
            {publishMode === 'schedule' && (
              <input
                type="datetime-local"
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
                min={new Date(Date.now() + 60_000).toISOString().slice(0, 16)}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#185FA5]"
              />
            )}
          </div>
        </div>
      )}

      {/* ── Steg 3: Kanal ── */}
      {selectedContent && connections.length > 0 && (
        <div className="bg-white rounded-xl border p-6 mb-4">
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-4">{t('step3')}</p>

          <div className="flex flex-wrap gap-2 mb-4">
            <button
              onClick={() => setPublishPlatform('facebook')}
              className={`flex-1 py-2 rounded-lg font-medium transition-colors ${
                publishPlatform === 'facebook' ? 'bg-[#185FA5] text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              📘 Facebook
            </button>
            {contentType === 'video' && (
              <button
                onClick={() => setPublishPlatform('instagram')}
                className={`flex-1 py-2 rounded-lg font-medium transition-colors ${
                  publishPlatform === 'instagram' ? 'bg-pink-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                📷 Instagram
              </button>
            )}
            {contentType === 'video' && (
              <button
                onClick={() => setPublishPlatform('tiktok')}
                className={`flex-1 py-2 rounded-lg font-medium transition-colors ${
                  publishPlatform === 'tiktok' ? 'bg-black text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                🎵 TikTok
              </button>
            )}
            <button
              onClick={() => setPublishPlatform('linkedin')}
              className={`flex-1 py-2 rounded-lg font-medium transition-colors ${
                publishPlatform === 'linkedin' ? 'bg-[#0077B5] text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              💼 LinkedIn
            </button>
            <button
              onClick={() => setPublishPlatform('x')}
              className={`flex-1 py-2 rounded-lg font-medium transition-colors ${
                publishPlatform === 'x' ? 'bg-black text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              𝕏 X
            </button>
            <button
              onClick={() => setPublishPlatform('reddit')}
              className={`flex-1 py-2 rounded-lg font-medium transition-colors ${
                publishPlatform === 'reddit' ? 'bg-[#FF4500] text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              🤖 Reddit
            </button>
          </div>

          {publishPlatform === 'reddit' && (
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('subredditLabel')}</label>

              <div className="flex items-center border rounded-lg overflow-hidden focus-within:ring-2 focus-within:ring-blue-500">
                <span className="px-3 py-2 bg-gray-50 text-gray-500 border-r text-sm">r/</span>
                <input
                  type="text"
                  value={subreddit}
                  onChange={(e) => setSubreddit(e.target.value.replace(/^r\//, ''))}
                  placeholder="norge"
                  className="flex-1 px-3 py-2 text-sm focus:outline-none"
                />
              </div>
            </div>
          )}

          <div className="space-y-2">
            {connections
              .filter((c) => c.platform === publishPlatform || (publishPlatform === 'instagram' && c.platform === 'facebook') || (publishPlatform === 'x' && c.platform === 'x'))
              .map((c) => (
              <label key={c.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg cursor-pointer hover:bg-gray-100">
                <input
                  type="checkbox"
                  checked={selectedPages.includes(c.page_id)}
                  onChange={(e) => {
                    if (e.target.checked) setSelectedPages((prev) => [...prev, c.page_id])
                    else setSelectedPages((prev) => prev.filter((id) => id !== c.page_id))
                  }}
                />
                <span>{c.platform === 'facebook' ? '📘' : c.platform === 'tiktok' ? '🎵' : c.platform === 'linkedin' ? '💼' : c.platform === 'x' ? '𝕏' : c.platform === 'reddit' ? '🤖' : '📷'} {c.page_name}</span>
              </label>
            ))}
          </div>
        </div>
      )}

      {/* ── Send-knapp ── */}
      {selectedContent && caption && selectedPages.length > 0 && (
        <div className="mb-6">
          {publishMode === 'now' ? (
            <button
              onClick={handlePublish}
              disabled={publishing}
              className="w-full bg-[#185FA5] hover:bg-[#0C447C] text-white py-3 rounded-xl font-semibold text-base transition-colors disabled:opacity-50"
            >
              {publishing ? t('publishingButton') : t('publishNowButton')}
            </button>
          ) : (
            <button
              onClick={handleSchedule}
              disabled={scheduling || !scheduledAt}
              className="w-full bg-[#185FA5] hover:bg-[#0C447C] text-white py-3 rounded-xl font-semibold text-base transition-colors disabled:opacity-50"
            >
              {scheduling ? t('schedulingButton') : `${t('scheduleButton')}${scheduledAt ? ' — ' + new Date(scheduledAt).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''}`}
            </button>
          )}
        </div>
      )}

      {/* ── Koblede kontoer ── */}
      <div className="bg-white rounded-xl border p-6 mb-6">
        <h2 className="font-semibold mb-3">{t('connectedAccounts')}</h2>
        {connections.length === 0 ? (
          <div>
            <p className="text-gray-500 mb-4 text-sm">{t('noAccounts')}</p>
            {userId ? (
              <div className="flex flex-wrap gap-2">
                <a href={`/api/auth/facebook?userId=${userId}`} className="bg-[#185FA5] text-white px-4 py-2 rounded-lg text-sm">
                  {t('connectFacebook')}
                </a>
                <a href={`/api/auth/tiktok?userId=${userId}`} className="bg-black text-white px-4 py-2 rounded-lg text-sm">
                  {t('connectTikTok')}
                </a>
                <a href={`/api/auth/linkedin?userId=${userId}`} className="bg-[#0077B5] text-white px-4 py-2 rounded-lg text-sm">
                  {t('connectLinkedIn')}
                </a>
                <a href={`/api/auth/x?userId=${userId}`} className="bg-gray-900 text-white px-4 py-2 rounded-lg text-sm">
                  {t('connectX')}
                </a>
                <a href={`/api/auth/reddit?userId=${userId}`} className="bg-[#FF4500] text-white px-4 py-2 rounded-lg text-sm">
                  {t('connectReddit')}
                </a>
              </div>
            ) : (
              <p className="text-gray-400 text-sm">{t('loadingUser')}</p>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            {connections.map((c) => (
              <div key={c.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                <span>{c.platform === 'facebook' ? '📘' : c.platform === 'tiktok' ? '🎵' : c.platform === 'linkedin' ? '💼' : '📷'}</span>
                <span className="font-medium text-sm">{c.page_name}</span>
                <span className="text-xs text-gray-400">{c.platform}</span>
              </div>
            ))}
            {userId && (
              <div className="flex flex-wrap gap-2 mt-3">
                <a href={`/api/auth/facebook?userId=${userId}`} className="text-sm text-[#185FA5] hover:underline">
                  + {t('connectFacebook')}
                </a>
                <a href={`/api/auth/tiktok?userId=${userId}`} className="text-sm text-gray-800 hover:underline">
                  + {t('connectTikTok')}
                </a>
                <a href={`/api/auth/linkedin?userId=${userId}`} className="text-sm text-[#0077B5] hover:underline">
                  + {t('connectLinkedIn')}
                </a>
                <a href={`/api/auth/x?userId=${userId}`} className="text-sm text-gray-900 hover:underline">
                  + {t('connectX')}
                </a>
                <a href={`/api/auth/reddit?userId=${userId}`} className="text-sm text-[#FF4500] hover:underline">
                  + {t('connectReddit')}
                </a>

              </div>
            )}
          </div>
        )}
      </div>

      {/* Publiseringshistorikk */}
      {publications.length > 0 && (
        <div className="bg-white rounded-xl border p-6 mt-6">
          <h2 className="font-semibold mb-4">{t('publishingHistory')}</h2>
          <div className="space-y-3">
            {publications.map((p) => (
              <div key={p.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div>
                  <p className="text-sm font-medium">
                    {p.platform === 'facebook' ? '📘' : p.platform === 'tiktok' ? '🎵' : p.platform === 'linkedin' ? '💼' : p.platform === 'instagram' ? '📷' : p.platform === 'x' ? '𝕏' : p.platform === 'reddit' ? '🤖' : '🌐'} {p.page_name}
                  </p>
                  <p className="text-xs text-gray-400 mt-1">{p.caption?.slice(0, 60)}...</p>
                </div>
                <div className="text-right">
                  <span className="text-xs text-green-600 font-medium">{t('published')}</span>
                  <p className="text-xs text-gray-400 mt-1">
                    {new Date(p.created_at).toLocaleDateString('en-GB', {
                      day: 'numeric',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default PublishPage
