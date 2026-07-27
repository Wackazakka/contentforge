'use client'

import { useState, useEffect, useRef } from 'react'
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

// Strip markdown/HTML down to a plain-text snippet for the article picker preview.
function articleSnippet(content: unknown, max = 180): string {
  if (typeof content !== 'string') return ''
  const text = content
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')   // markdown images
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')  // markdown links -> label
    .replace(/<[^>]+>/g, ' ')                  // html tags
    .replace(/[#*_>`~]/g, ' ')                 // markdown symbols
    .replace(/\s+/g, ' ')                      // collapse whitespace
    .trim()
  return text.length > max ? text.slice(0, max).trimEnd() + '…' : text
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
  const [contentType, setContentType] = useState<'video' | 'article' | 'avatar'>('video')
  const [videos, setVideos] = useState<any[]>([])
  const [articles, setArticles] = useState<any[]>([])
  const [avatarJobs, setAvatarJobs] = useState<any[]>([])
  const [selectedContent, setSelectedContent] = useState<any>(null)
  const [selectedPages, setSelectedPages] = useState<string[]>([])
  const [caption, setCaption] = useState('')
  const [publishing, setPublishing] = useState(false)
  const [publishResult, setPublishResult] = useState<any>(null)
  const [publications, setPublications] = useState<any[]>([])
  const [publishPlatform, setPublishPlatform] = useState<'facebook' | 'instagram' | 'tiktok' | 'linkedin' | 'x' | 'reddit' | 'youtube'>('facebook')
  const [subreddit, setSubreddit] = useState('')
  const [prefillJobId, setPrefillJobId] = useState<string | null>(null)
  const [prefillContentId, setPrefillContentId] = useState<string | null>(null)
  const [publishMode, setPublishMode] = useState<'now' | 'schedule'>('now')
  const [scheduledAt, setScheduledAt] = useState<string>('')
  const [scheduleSuccess, setScheduleSuccess] = useState<string | null>(null)
  const [publishSuccess, setPublishSuccess] = useState<string | null>(null)
  const [publishAsReel, setPublishAsReel] = useState(true)
  const [scheduling, setScheduling] = useState(false)
  const [igPageStatus, setIgPageStatus] = useState<Record<string, string | null>>({})
  const selectedArticleRef = useRef<HTMLDivElement>(null)
  const scheduleInputRef = useRef<HTMLInputElement>(null)

  // Når man kommer hit fra en artikkel (prefill), scroll den forhåndsvalgte
  // artikkelen inn i synsfeltet så man slipper å lete etter den highlightede.
  useEffect(() => {
    if (contentType === 'article' && prefillContentId && selectedContent?.id === prefillContentId) {
      selectedArticleRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }, [contentType, prefillContentId, selectedContent])

  // Når man velger «Planlegg», flytt fokus til dato/tid-feltet så det scroller
  // inn i synsfeltet — feltet ligger i Steg 2, hinten står nederst ved knappen.
  useEffect(() => {
    if (publishMode === 'schedule') {
      scheduleInputRef.current?.focus()
    }
  }, [publishMode])

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
          setAvatarJobs([])
          if (prefillJobId && data) {
            const match = data.find((v: any) => v.job_id === prefillJobId)
            if (match) setSelectedContent(match)
          }
        } else if (contentType === 'avatar') {
          const { data, error } = await supabase
            .from('production_jobs')
            .select('*')
            .eq('product_id', selectedProduct)
            .eq('content_type', 'avatar')
            .eq('status', 'completed')
            .order('created_at', { ascending: false })
          console.log('[publish] avatar jobs for product', selectedProduct, ':', data, 'error:', error)
          setAvatarJobs(data || [])
          setVideos([])
          setArticles([])
        } else {
          const { data, error } = await supabase
            .from('articles')
            .select('*')
            .eq('product_id', selectedProduct)
          console.log('[publish] articles for product', selectedProduct, ':', data, 'error:', error)
          setArticles(data || [])
          setVideos([])
          setAvatarJobs([])
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
      const detail = searchParams.get('detail')
      setMessage(`❌ Error: ${error}${detail ? ` — ${detail}` : ''}`)
      window.history.replaceState({}, '', '/dashboard/publish')
    }

    // Pre-fill from product page links
    const type = searchParams.get('type') as 'video' | 'article' | 'avatar' | null
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

  useEffect(() => {
    if (publishPlatform !== 'instagram') return
    const fbPageIds = connections.filter((c) => c.platform === 'facebook').map((c) => c.page_id)
    if (fbPageIds.length === 0) return
    fetch('/api/publish/instagram/check-pages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pageIds: fbPageIds }),
    }).then((r) => r.json()).then((d) => { if (d.results) setIgPageStatus(d.results) })
  }, [publishPlatform, connections])

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
    if (!selectedContent || selectedPages.length === 0 || !scheduledAt) {
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
    setScheduleSuccess(null)
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
      if (contentType === 'video' && publishPlatform === 'facebook') row.as_reel = publishAsReel

      console.log('[schedule] inserting:', row)
      let { data, error } = await supabase
        .from('scheduled_publications')
        .insert(row)
        .select()

      // Defensivt: hvis as_reel-kolonnen ikke finnes ennå, planlegg som vanlig video
      if (error && /as_reel/.test(error.message || '')) {
        console.warn('[schedule] as_reel-kolonnen mangler — planlegger som vanlig video')
        delete row.as_reel
        ;({ data, error } = await supabase.from('scheduled_publications').insert(row).select())
      }

      console.log('[schedule] result data:', data, 'error:', error)

      if (error) {
        setMessage(`❌ ${error.message}`)
        return
      }

      const naar = publishTime.toLocaleString('nb-NO', {
        day: 'numeric',
        month: 'long',
        hour: '2-digit',
        minute: '2-digit',
      })
      setMessage(`✅ Planlagt til ${naar}`)
      setScheduleSuccess(`✅ Innlegget er planlagt til ${naar}`)
      setScheduledAt('')
      // Bli i planleggingsmodus — men vis suksess ved knappen (ikke bare øverst),
      // ellers ser det ut som at feltet nullstilte seg og feilet.
    } catch (err) {
      console.error('[publish] Schedule error:', err)
      setMessage(`❌ ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setScheduling(false)
    }
  }

  const handlePublish = async () => {
    if (!selectedContent || selectedPages.length === 0) {
      setMessage(t('errorSelectPublish'))
      return
    }

    setPublishing(true)
    setPublishSuccess(null)
    setScheduleSuccess(null)
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

      if (contentType === 'video' || contentType === 'avatar') {
        body.videoUrl = contentType === 'avatar'
          ? `${process.env.NEXT_PUBLIC_R2_URL}/avatars/${selectedContent.id}/output.mp4`
          : `${process.env.NEXT_PUBLIC_R2_URL}/videos/${selectedContent.job_id}/output.mp4`
        body.caption = caption
        if (publishPlatform === 'tiktok') {
          endpoint = '/api/publish/tiktok'
          body.tiktokAccountId = selectedPages[0]
        } else if (publishPlatform === 'linkedin') {
          endpoint = '/api/publish/linkedin'
          body.linkedinAccountId = selectedPages[0]
          body.contentType = 'video'
        } else if (publishPlatform === 'youtube') {
          endpoint = '/api/publish/youtube'
          body.youtubeChannelId = selectedPages[0]
          body.title = selectedContent.campaign_name || selectedContent.title || caption.slice(0, 100)
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
          if (publishPlatform === 'facebook') body.asReel = publishAsReel
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
      if (publishPlatform === 'instagram') {
        if (data.processing && data.results?.length) {
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
              setPublishSuccess('✅ Publisert nå på Instagram! Se publiseringshistorikken nederst.')
              break
            }
            if (statusData.status === 'failed') {
              setMessage(`❌ Instagram: ${statusData.error}`)
              break
            }
            attempts++
            if (attempts >= 60) {
              setMessage('❌ Tidsavbrudd — Instagram brukte for lang tid på å prosessere videoen')
            }
          }
        } else {
          // Container creation failed — surface the actual error from results
          const firstError = data.results?.[0]?.error || data.error || 'Ukjent feil'
          setMessage(`❌ Instagram: ${firstError}`)
        }
      } else {
        setPublishResult(data)
        setMessage(data.success ? t('published') : `❌ ${data.error}`)
        if (data.success) {
          setPublishSuccess(`✅ Publisert nå til ${selectedPages.length} ${selectedPages.length === 1 ? 'kanal' : 'kanaler'}! Se publiseringshistorikken nederst.`)
        }
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
    <div className="max-w-3xl mx-auto">
      <h1 className="cf-h1" style={{ marginBottom: 28 }}>{t('title')}</h1>

      {message && (
        <div className={`mb-4 p-4 rounded-lg border text-sm ${
          message.startsWith('✅')
            ? 'bg-green-50 border-green-200 text-green-800'
            : message.startsWith('❌')
            ? 'bg-red-50 border-red-200 text-red-700'
            : 'bg-[var(--ember-tint-bg)] border-[#E3A883]'
        }`}>
          {message}
        </div>
      )}

      {/* ── Steg 1: Innhold ── */}
      <div className="cf-panel p-6 mb-4">
        <p className="cf-eyebrow mb-4">{t('step1')}</p>

        <div className="flex gap-2 mb-5">
          <button
            onClick={() => { setContentType('video'); setSelectedContent(null) }}
            className={`flex-1 py-2 rounded-lg font-medium transition-colors ${
              contentType === 'video' ? 'cf-ink-btn' : 'cf-soft-btn'
            }`}
          >
            {t('videoButton')}
          </button>
          <button
            onClick={() => { setContentType('avatar'); setSelectedContent(null) }}
            className={`flex-1 py-2 rounded-lg font-medium transition-colors ${
              contentType === 'avatar' ? 'bg-purple-700 text-white' : 'cf-soft-btn'
            }`}
          >
            🧑‍💼 Avatar
          </button>
          <button
            onClick={() => { setContentType('article'); setSelectedContent(null) }}
            className={`flex-1 py-2 rounded-lg font-medium transition-colors ${
              contentType === 'article' ? 'cf-ink-btn' : 'cf-soft-btn'
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
              className="cf-input"
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
                        isSelected ? 'border-[var(--ember-deep)] ring-2 ring-[var(--ember-tint-border)]' : 'border-gray-200 hover:border-[#E3A883]'
                      }`}
                    >
                      {videoUrl ? (
                        <video src={videoUrl} muted preload="metadata" className="w-full object-cover bg-black" style={{ maxHeight: '140px' }} />
                      ) : (
                        <div className="w-full flex items-center justify-center bg-gray-100 text-gray-400 text-2xl" style={{ height: '100px' }}>🎬</div>
                      )}
                      {isSelected && (
                        <div className="absolute top-2 right-2 cf-ink-btn text-xs px-2 py-0.5 rounded-full font-medium">{t('selected')}</div>
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

          {contentType === 'avatar' && avatarJobs.length > 0 && (
            <div>
              <label className="block text-sm font-medium mb-2">Velg avatar-video</label>
              <div className="grid grid-cols-2 gap-3">
                {avatarJobs.map((j) => {
                  const videoUrl = `${process.env.NEXT_PUBLIC_R2_URL}/avatars/${j.id}/output.mp4`
                  const isSelected = selectedContent?.id === j.id
                  return (
                    <div
                      key={j.id}
                      onClick={() => setSelectedContent(j)}
                      className={`relative border-2 rounded-lg overflow-hidden cursor-pointer transition-all ${
                        isSelected ? 'border-purple-600 ring-2 ring-purple-200' : 'border-gray-200 hover:border-purple-400'
                      }`}
                    >
                      <video src={videoUrl} muted preload="metadata" className="w-full object-cover bg-black" style={{ maxHeight: '140px' }} />
                      {isSelected && (
                        <div className="absolute top-2 right-2 bg-purple-700 text-white text-xs px-2 py-0.5 rounded-full font-medium">{t('selected')}</div>
                      )}
                      <div className="p-2">
                        <p className="text-xs font-medium text-gray-800 truncate">{j.title || 'Avatar video'}</p>
                        <p className="text-xs text-gray-400">
                          {new Date(j.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
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
                {articles.map((a) => {
                  const imageUrl = a.image_urls?.[0] || null
                  const snippet = articleSnippet(a.content)
                  return (
                    <div
                      key={a.id}
                      ref={selectedContent?.id === a.id ? selectedArticleRef : undefined}
                      onClick={() => setSelectedContent(a)}
                      className={`flex gap-3 p-3 border rounded-lg cursor-pointer transition-colors ${
                        selectedContent?.id === a.id ? 'border-[var(--ember-deep)] bg-[var(--ember-tint-bg)]' : 'hover:border-[#E3A883]'
                      }`}
                    >
                      <div className="shrink-0 w-16 h-16 rounded-md overflow-hidden bg-gray-100 flex items-center justify-center">
                        {imageUrl ? (
                          <img src={imageUrl} alt="" loading="lazy" className="w-full h-full object-cover" />
                        ) : (
                          <span className="text-gray-300 text-xl">🖼️</span>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{a.title}</p>
                        {snippet && (
                          <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{snippet}</p>
                        )}
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-xs bg-gray-200 text-gray-700 px-2 py-1 rounded">
                            {a.platform === 'linkedin' ? '💼' : a.platform === 'facebook' ? '📘' : '𝕏'} {a.platform}
                          </span>
                          <span className="text-xs text-gray-400">
                            {new Date(a.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                          </span>
                          {!imageUrl && (
                            <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ backgroundColor: '#FEF3C7', color: '#92400E' }}>
                              ⚠ mangler eget bilde
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Steg 2: Caption + Tidspunkt ── alltid synlig når innhold er valgt */}
      {selectedContent && (
        <div className="cf-panel p-6 mb-4">
          <p className="cf-eyebrow mb-4">{t('step2')}</p>

          {/* Bildetekst = selve posttekst for video/avatar. For artikler blir
              tittel + innhold posten, og caption sendes aldri til API-et —
              så vi hverken viser feltet eller krever det. */}
          {contentType !== 'article' && (
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('captionLabel')} <span className="text-gray-400 font-normal">(valgfritt)</span></label>
              <textarea
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                rows={4}
                placeholder={t('captionPlaceholder')}
                className="cf-input"
              />
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">{t('publishWhen')}</label>
            <div className="flex gap-2 mb-3">
              <button
                onClick={() => setPublishMode('now')}
                className={`flex-1 py-2 rounded-lg font-medium text-sm transition-colors ${
                  publishMode === 'now' ? 'cf-ink-btn' : 'cf-soft-btn'
                }`}
              >
                {t('publishNow')}
              </button>
              <button
                onClick={() => setPublishMode('schedule')}
                className={`flex-1 py-2 rounded-lg font-medium text-sm transition-colors ${
                  publishMode === 'schedule' ? 'cf-ink-btn' : 'cf-soft-btn'
                }`}
              >
                {t('schedule')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Steg 3: Kanal ── */}
      {selectedContent && connections.length > 0 && (
        <div className="cf-panel p-6 mb-4">
          <p className="cf-eyebrow mb-4">{t('step3')}</p>

          <div className="flex flex-wrap gap-2 mb-4">
            <button
              onClick={() => setPublishPlatform('facebook')}
              className={`flex-1 py-2 rounded-lg font-medium transition-colors ${
                publishPlatform === 'facebook' ? 'cf-ink-btn' : 'cf-soft-btn'
              }`}
            >
              📘 Facebook
            </button>
            {(contentType === 'video' || contentType === 'avatar') && (
              <button
                onClick={() => setPublishPlatform('instagram')}
                className={`flex-1 py-2 rounded-lg font-medium transition-colors ${
                  publishPlatform === 'instagram' ? 'bg-pink-600 text-white' : 'cf-soft-btn'
                }`}
              >
                📷 Instagram
              </button>
            )}
            {(contentType === 'video' || contentType === 'avatar') && (
              <button
                onClick={() => setPublishPlatform('tiktok')}
                className={`flex-1 py-2 rounded-lg font-medium transition-colors ${
                  publishPlatform === 'tiktok' ? 'bg-black text-white' : 'cf-soft-btn'
                }`}
              >
                🎵 TikTok
              </button>
            )}
            <button
              onClick={() => setPublishPlatform('linkedin')}
              className={`flex-1 py-2 rounded-lg font-medium transition-colors ${
                publishPlatform === 'linkedin' ? 'bg-[#0077B5] text-white' : 'cf-soft-btn'
              }`}
            >
              💼 LinkedIn
            </button>
            <button
              onClick={() => setPublishPlatform('x')}
              className={`flex-1 py-2 rounded-lg font-medium transition-colors ${
                publishPlatform === 'x' ? 'bg-black text-white' : 'cf-soft-btn'
              }`}
            >
              𝕏 X
            </button>
            <button
              onClick={() => setPublishPlatform('reddit')}
              className={`flex-1 py-2 rounded-lg font-medium transition-colors ${
                publishPlatform === 'reddit' ? 'bg-[#FF4500] text-white' : 'cf-soft-btn'
              }`}
            >
              🤖 Reddit
            </button>
            {(contentType === 'video' || contentType === 'avatar') && (
              <button
                onClick={() => setPublishPlatform('youtube')}
                className={`flex-1 py-2 rounded-lg font-medium transition-colors ${
                  publishPlatform === 'youtube' ? 'bg-[#FF0000] text-white' : 'cf-soft-btn'
                }`}
              >
                ▶ YouTube
              </button>
            )}
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
              .filter((c) => c.platform === publishPlatform || (publishPlatform === 'instagram' && c.platform === 'facebook') || (publishPlatform === 'x' && c.platform === 'x') || (publishPlatform === 'youtube' && c.platform === 'youtube'))
              .map((c) => {
                const igLinked = publishPlatform === 'instagram' ? igPageStatus[c.page_id] : undefined
                const igChecked = publishPlatform === 'instagram' && igPageStatus[c.page_id] !== undefined
                return (
                  <label key={c.id} className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer ${igChecked && !igLinked ? 'bg-red-50 opacity-60' : 'bg-gray-50 hover:bg-gray-100'}`}>
                    <input
                      type="checkbox"
                      checked={selectedPages.includes(c.page_id)}
                      disabled={igChecked && !igLinked}
                      onChange={(e) => {
                        if (e.target.checked) setSelectedPages((prev) => [...prev, c.page_id])
                        else setSelectedPages((prev) => prev.filter((id) => id !== c.page_id))
                      }}
                    />
                    <span className="flex-1">{c.platform === 'facebook' ? '📘' : c.platform === 'tiktok' ? '🎵' : c.platform === 'linkedin' ? '💼' : c.platform === 'x' ? '𝕏' : c.platform === 'reddit' ? '🤖' : c.platform === 'youtube' ? '▶' : '📷'} {c.page_name}</span>
                    {igChecked && (
                      <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={igLinked ? { backgroundColor: '#EAF3DE', color: '#3F7A4E' } : { backgroundColor: '#fef2f2', color: '#ef4444' }}>
                        {igLinked ? '✓ Instagram koblet' : '✗ Ingen Instagram'}
                      </span>
                    )}
                  </label>
                )
              })}
          </div>
        </div>
      )}

      {/* ── Send-knapp ── alltid synlig når innhold er valgt; deaktivert med
           forklaring når noe mangler, så knappen aldri "forsvinner" i stillhet */}
      {selectedContent && (
        <div className="mb-6">
          {(() => {
            const missing: string[] = []
            if (selectedPages.length === 0) missing.push('velg minst én side å publisere til')
            if (publishMode === 'schedule' && !scheduledAt) missing.push('velg tidspunkt')
            const ready = missing.length === 0
            return (
              <>
                {contentType === 'video' && publishPlatform === 'facebook' && (
                  <label className="flex items-start gap-3 mb-3 p-3 rounded-lg border border-gray-200 cursor-pointer hover:border-[#E3A883]">
                    <input
                      type="checkbox"
                      checked={publishAsReel}
                      onChange={(e) => setPublishAsReel(e.target.checked)}
                      className="mt-1 h-4 w-4"
                    />
                    <div>
                      <div className="text-sm font-medium text-gray-900">🎬 Publiser som Reel</div>
                      <div className="text-xs text-gray-500 mt-0.5">
                        Anbefalt for høydeformat (9:16) — Reels får mer organisk rekkevidde enn vanlige videoinnlegg. Skru av for å poste som vanlig video.
                      </div>
                    </div>
                  </label>
                )}
                {publishMode === 'schedule' && (
                  <div className="mb-3">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Velg dato og klokkeslett</label>
                    <input
                      ref={scheduleInputRef}
                      type="datetime-local"
                      value={scheduledAt}
                      onChange={(e) => { setScheduledAt(e.target.value); setScheduleSuccess(null) }}
                      min={new Date(Date.now() + 60_000).toISOString().slice(0, 16)}
                      className="cf-input"
                    />
                  </div>
                )}
                {publishMode === 'now' ? (
                  <button
                    onClick={handlePublish}
                    disabled={!ready || publishing}
                    className="w-full cf-ink-btn py-3 rounded-xl font-semibold text-base transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {publishing ? t('publishingButton') : t('publishNowButton')}
                  </button>
                ) : (
                  <button
                    onClick={handleSchedule}
                    disabled={!ready || scheduling}
                    className="w-full cf-ink-btn py-3 rounded-xl font-semibold text-base transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {scheduling ? t('schedulingButton') : `${t('scheduleButton')}${scheduledAt ? ' — ' + new Date(scheduledAt).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''}`}
                  </button>
                )}
                {scheduleSuccess ? (
                  <p className="text-sm mt-2 text-center font-medium" style={{ color: '#3F7A4E' }}>
                    {scheduleSuccess}. Velg et nytt tidspunkt for å planlegge en til.
                  </p>
                ) : publishSuccess ? (
                  <p className="text-sm mt-2 text-center font-medium" style={{ color: '#3F7A4E' }}>
                    {publishSuccess}
                  </p>
                ) : !ready ? (
                  <p className="text-sm text-gray-500 mt-2 text-center">
                    {publishMode === 'schedule' ? 'For å planlegge' : 'For å publisere'}: {missing.join(', ')}.
                  </p>
                ) : null}
              </>
            )
          })()}
        </div>
      )}

      {/* ── Koblede kontoer ── */}
      <div className="cf-panel p-6 mb-6">
        <h2 className="font-semibold mb-3">{t('connectedAccounts')}</h2>
        {connections.length === 0 ? (
          <div>
            <p className="text-gray-500 mb-4 text-sm">{t('noAccounts')}</p>
            {userId ? (
              <div className="flex flex-wrap gap-2">
                <a href={`/api/auth/facebook?userId=${userId}`} className="cf-ink-btn px-4 py-2 rounded-lg text-sm">
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
                <a href={`/api/auth/youtube?userId=${userId}`} className="bg-[#FF0000] text-white px-4 py-2 rounded-lg text-sm">
                  {t('connectYouTube')}
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
                <a href={`/api/auth/facebook?userId=${userId}`} className="text-sm text-[var(--ember-deep)] hover:underline">
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
                <a href={`/api/auth/youtube?userId=${userId}`} className="text-sm text-[#FF0000] hover:underline">
                  + {t('connectYouTube')}
                </a>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Publiseringshistorikk */}
      {publications.length > 0 && (
        <div className="cf-panel p-6 mt-6">
          <h2 className="font-semibold mb-4">{t('publishingHistory')}</h2>
          <div className="space-y-3">
            {publications.map((p) => (
              <div key={p.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div>
                  <p className="text-sm font-medium">
                    {p.platform === 'facebook' ? '📘' : p.platform === 'tiktok' ? '🎵' : p.platform === 'linkedin' ? '💼' : p.platform === 'instagram' ? '📷' : p.platform === 'x' ? '𝕏' : p.platform === 'reddit' ? '🤖' : p.platform === 'youtube' ? '▶' : '🌐'} {p.page_name}
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
