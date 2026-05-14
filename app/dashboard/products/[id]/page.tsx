'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/lib/authContext'
import { getSupabase } from '@/lib/supabaseClient'
import { useTranslations } from 'next-intl'

function renderMarkdown(text: string) {
  const clean = text.replace(/\n/g, ' ').replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\*(.+?)\*/g, '<em>$1</em>')
  return <span dangerouslySetInnerHTML={{ __html: clean }} />
}

interface Product {
  id: string
  organization_id: string
  name: string
  description: string | null
  category: string | null
  created_by: string
  created_at: string
  updated_at: string
}

interface ProductProfile {
  id: string
  product_id: string
  logo_url: string | null
  primary_color: string | null
  secondary_color: string | null
  accent_color: string | null
  font_family: string | null
  brand_voice: string | null
  brand_guidelines: string | null
}

interface ProductionJob {
  id: string
  product_id: string
  created_by: string
  title: string
  description: string | null
  status: 'draft' | 'queued' | 'generating' | 'rendering' | 'done' | 'completed' | 'failed'
  content_type: string | null
  video_format: string | null
  ai_parameters: Record<string, any> | null
  created_at: string
  updated_at: string
  completed_at: string | null
}

interface AssetBank {
  id: string
  job_id: string
  asset_type: 'image' | 'video'
  asset_url: string
  metadata: Record<string, any> | null
  created_at: string
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

function SectionHeader({
  title,
  open,
  onToggle,
}: {
  title: string
  open: boolean
  onToggle: () => void
}) {
  return (
    <button
      onClick={onToggle}
      className="w-full flex items-center justify-between mb-4 text-left group"
    >
      <h2 className="text-lg font-semibold text-gray-900 group-hover:text-blue-700 transition-colors">
        {title}
      </h2>
      <span className="text-gray-400 text-sm select-none">{open ? '▲' : '▼'}</span>
    </button>
  )
}

export default function ProductPage() {
  const router = useRouter()
  const params = useParams()
  const { session } = useAuth()
  const t = useTranslations('product')
  const productId = params.id as string

  const [product, setProduct] = useState<Product | null>(null)
  const [profile, setProfile] = useState<ProductProfile | null>(null)
  const [jobs, setJobs] = useState<ProductionJob[]>([])
  const [jobsLoading, setJobsLoading] = useState(false)
  const [assets, setAssets] = useState<AssetBank[]>([])
  const [assetsLoading, setAssetsLoading] = useState(false)
  const [videos, setVideos] = useState<AssetBank[]>([])
  const [videosLoading, setVideosLoading] = useState(false)
  const [articles, setArticles] = useState<any[]>([])
  const [articlesLoading, setArticlesLoading] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [openSections, setOpenSections] = useState({
    jobs: true,
    doneJobs: true,
    videos: false,
    images: false,
    articles: false,
    brandProfile: false,
  })
  const toggleSection = (key: keyof typeof openSections) =>
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }))

  const [profileForm, setProfileForm] = useState({
    logo_url: '',
    primary_color: '',
    secondary_color: '',
    accent_color: '',
    font_family: '',
    brand_voice: '',
    brand_guidelines: '',
    website_url: '',
    cta_text: '',
  })
  const [profileSaving, setProfileSaving] = useState(false)
  const [profileMessage, setProfileMessage] = useState<string | null>(null)
  const [logoUploading, setLogoUploading] = useState(false)

  useEffect(() => {
    if (!productId || !session?.user?.id) return

    const fetchProduct = async () => {
      try {
        const supabase = getSupabase()

        const { data: productData, error: productError } = await supabase
          .from('products')
          .select('*')
          .eq('id', productId)
          .single()

        if (productError) throw productError
        if (!productData) {
          setError(t('notFound'))
          return
        }

        setProduct(productData)

        const { data: profileData } = await supabase
          .from('product_profiles')
          .select('*')
          .eq('product_id', productId)
          .maybeSingle()

        if (profileData) setProfile(profileData)
      } catch (err) {
        console.error('[ProductPage] Fetch error:', err)
        setError(err instanceof Error ? err.message : t('loadError'))
      } finally {
        setLoading(false)
      }
    }

    fetchProduct()
  }, [productId, session?.user?.id])

  useEffect(() => {
    if (profile) {
      setProfileForm({
        logo_url: profile.logo_url || '',
        primary_color: profile.primary_color || '',
        secondary_color: profile.secondary_color || '',
        accent_color: profile.accent_color || '',
        font_family: profile.font_family || '',
        brand_voice: profile.brand_voice || '',
        brand_guidelines: profile.brand_guidelines ? String(profile.brand_guidelines) : '',
        website_url: (profile as any).website_url || '',
        cta_text: (profile as any).cta_text || '',
      })
    }
  }, [profile])

  const handleSaveProfile = async () => {
    if (!productId) return
    setProfileSaving(true)
    setProfileMessage(null)

    try {
      const supabase = getSupabase()

      const { error } = await supabase
        .from('product_profiles')
        .upsert(
          {
            product_id: productId,
            logo_url: profileForm.logo_url || null,
            primary_color: profileForm.primary_color || null,
            secondary_color: profileForm.secondary_color || null,
            accent_color: profileForm.accent_color || null,
            font_family: profileForm.font_family || null,
            brand_voice: profileForm.brand_voice || null,
            brand_guidelines: profileForm.brand_guidelines || null,
            website_url: (profileForm as any).website_url || null,
            cta_text: (profileForm as any).cta_text || null,
          },
          { onConflict: 'product_id' }
        )

      if (error) throw error

      setProfileMessage(t('profileSaved'))

      const { data: updatedProfile } = await supabase
        .from('product_profiles')
        .select('*')
        .eq('product_id', productId)
        .maybeSingle()

      if (updatedProfile) setProfile(updatedProfile)

      setTimeout(() => setProfileMessage(null), 3000)
    } catch (err) {
      console.error('[ProductPage] Save profile error:', err)
      setProfileMessage(t('profileSaveError'))
    } finally {
      setProfileSaving(false)
    }
  }

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setLogoUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('productId', productId)
      const res = await fetch('/api/products/upload-logo', {
        method: 'POST',
        body: formData,
      })
      const data = await res.json()
      if (data.url) {
        setProfile((prev) => (prev ? { ...prev, logo_url: data.url } : null))
        setProfileForm((prev) => ({ ...prev, logo_url: data.url }))
      }
    } catch (err) {
      console.error('Logo upload failed:', err)
    } finally {
      setLogoUploading(false)
    }
  }

  const handleRemoveLogo = async () => {
    if (!productId) return
    const supabase = getSupabase()
    await supabase.from('products').update({ logo_url: null }).eq('id', productId)
    setProduct((prev) => (prev ? { ...prev, logo_url: null } : null))
    setProfile((prev) => (prev ? { ...prev, logo_url: null } : null))
  }

  const handleDeleteVideo = async (id: string) => {
    if (!confirm(t('deleteVideo'))) return
    const supabase = getSupabase()
    await supabase.from('asset_banks').delete().eq('id', id)
    setVideos((prev) => prev.filter((v) => v.id !== id))
  }

  const handleDeleteArticle = async (id: string) => {
    if (!confirm(t('deleteArticle'))) return
    const supabase = getSupabase()
    await supabase.from('articles').delete().eq('id', id)
    setArticles((prev) => prev.filter((a) => a.id !== id))
  }

  const handleDeleteImage = async (id: string) => {
    if (!confirm(t('deleteImage'))) return
    const supabase = getSupabase()
    await supabase.from('asset_banks').delete().eq('id', id)
    setAssets((prev) => prev.filter((a) => a.id !== id))
  }

  useEffect(() => {
    if (!productId || !session?.user?.id) return

    const fetchJobs = async () => {
      try {
        setJobsLoading(true)
        const supabase = getSupabase()

        const { data: jobsData, error: jobsError } = await supabase
          .from('production_jobs')
          .select('*')
          .eq('product_id', productId)
          .order('created_at', { ascending: false })

        if (jobsError) throw jobsError
        setJobs(jobsData || [])
      } catch (err) {
        console.error('[ProductPage] Jobs fetch error:', err)
      } finally {
        setJobsLoading(false)
      }
    }

    fetchJobs()
    const interval = setInterval(fetchJobs, 5000)
    return () => clearInterval(interval)
  }, [productId, session?.user?.id])

  useEffect(() => {
    if (!productId) return

    const fetchAssets = async () => {
      try {
        setAssetsLoading(true)
        const supabase = getSupabase()

        const { data: assetsData, error: assetsError } = await supabase
          .from('asset_banks')
          .select('id, asset_url, asset_type, metadata, created_at, product_id')
          .eq('product_id', productId)
          .eq('asset_type', 'image')
          .order('created_at', { ascending: false })

        if (assetsError) throw assetsError
        setAssets(assetsData || [])
      } catch (err) {
        console.error('[ProductPage] Assets fetch error:', err)
      } finally {
        setAssetsLoading(false)
      }
    }

    fetchAssets()
  }, [productId])

  useEffect(() => {
    if (!productId) return

    const fetchVideos = async () => {
      try {
        setVideosLoading(true)
        const supabase = getSupabase()

        const { data: videosData, error: videosError } = await supabase
          .from('asset_banks')
          .select('id, asset_url, asset_type, metadata, created_at, product_id, job_id')
          .eq('product_id', productId)
          .eq('asset_type', 'video')
          .order('created_at', { ascending: false })

        if (videosError) throw videosError
        setVideos(videosData || [])
      } catch (err) {
        console.error('[ProductPage] Videos fetch error:', err)
      } finally {
        setVideosLoading(false)
      }
    }

    fetchVideos()
  }, [productId])

  useEffect(() => {
    if (!productId) return

    const fetchArticles = async () => {
      try {
        setArticlesLoading(true)
        const supabase = getSupabase()

        const { data: articlesData, error: articlesError } = await supabase
          .from('articles')
          .select('id, title, platform, content, image_urls, created_at')
          .eq('product_id', productId)
          .order('created_at', { ascending: false })

        if (articlesError) throw articlesError
        setArticles(articlesData || [])
      } catch (err) {
        console.error('[ProductPage] Articles fetch error:', err)
      } finally {
        setArticlesLoading(false)
      }
    }

    fetchArticles()
  }, [productId])

  if (loading) {
    return (
      <div className="min-h-screen bg-cf-bg flex items-center justify-center">
        <div className="text-gray-600">{t('loading')}</div>
      </div>
    )
  }

  if (error || !product) {
    return (
      <div className="min-h-screen bg-cf-bg">
        <div className="max-w-6xl mx-auto px-6 py-8">
          <Link href="/dashboard" className="text-[#185FA5] hover:text-[#0C447C] mb-4 inline-block">
            {t('backToDashboard')}
          </Link>
          <div className="text-center py-12">
            <p className="text-red-600 text-lg">{error || t('notFound')}</p>
          </div>
        </div>
      </div>
    )
  }

  const activeJobs = jobs.filter(
    (j) => !['done', 'completed', 'failed'].includes(j.status)
  )
  const doneJobs = jobs.filter((j) => j.status === 'done' || j.status === 'completed')

  return (
    <div className="min-h-screen bg-cf-bg">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        {/* Header */}
        <div className="mb-6">
          <Link href="/dashboard" className="text-sm font-medium mb-3 inline-block" style={{ color: '#185FA5' }}>
            {t('backToDashboard')}
          </Link>
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">{product.name}</h1>
              <div className="flex flex-wrap items-center gap-3 mt-1">
                {product.description && (
                  <p className="text-gray-500 text-sm">{product.description}</p>
                )}
                {product.category && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 capitalize">{product.category}</span>
                )}
                <span className="text-xs text-gray-400">{formatDate(product.created_at)}</span>
              </div>
            </div>
            {profile?.logo_url && (
              <img src={profile.logo_url} alt={product.name} className="w-16 h-16 rounded-lg object-cover flex-shrink-0" />
            )}
          </div>
        </div>

        {/* Brand Profile — collapsible */}
        <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
          <SectionHeader
            title={t('brandProfile')}
            open={openSections.brandProfile}
            onToggle={() => toggleSection('brandProfile')}
          />

          {openSections.brandProfile && (
          <div>
          {profileMessage && (
            <div className="mb-4 p-3 rounded-lg bg-gray-50 border border-gray-200 text-sm">
              {profileMessage}
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">{t('logoLabel')}</label>
              <div className="flex gap-2 items-center">
                <input
                  type="text"
                  value={profileForm.logo_url}
                  onChange={(e) => setProfileForm({ ...profileForm, logo_url: e.target.value })}
                  placeholder="https://example.com/logo.png"
                  className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#185FA5]"
                />
                <span className="text-gray-400 text-sm">{t('or')}</span>
                <label className="cursor-pointer px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm border border-gray-300 transition-colors">
                  {logoUploading ? t('uploading') : t('upload')}
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/svg+xml,image/webp"
                    onChange={handleLogoUpload}
                    className="hidden"
                  />
                </label>
              </div>
              {profileForm.logo_url && (
                <img
                  src={profileForm.logo_url}
                  alt="Logo preview"
                  className="mt-3 h-12 w-auto object-contain"
                />
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('primaryColorLabel')}</label>
              <div className="flex gap-2">
                <input
                  type="color"
                  value={profileForm.primary_color || '#000000'}
                  onChange={(e) => setProfileForm({ ...profileForm, primary_color: e.target.value })}
                  className="w-12 h-10 border border-gray-300 rounded cursor-pointer"
                />
                <input
                  type="text"
                  value={profileForm.primary_color}
                  onChange={(e) => setProfileForm({ ...profileForm, primary_color: e.target.value })}
                  placeholder="#000000"
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#185FA5]"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('secondaryColorLabel')}</label>
              <div className="flex gap-2">
                <input
                  type="color"
                  value={profileForm.secondary_color || '#000000'}
                  onChange={(e) =>
                    setProfileForm({ ...profileForm, secondary_color: e.target.value })
                  }
                  className="w-12 h-10 border border-gray-300 rounded cursor-pointer"
                />
                <input
                  type="text"
                  value={profileForm.secondary_color}
                  onChange={(e) =>
                    setProfileForm({ ...profileForm, secondary_color: e.target.value })
                  }
                  placeholder="#000000"
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#185FA5]"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('accentColorLabel')}</label>
              <div className="flex gap-2">
                <input
                  type="color"
                  value={profileForm.accent_color || '#000000'}
                  onChange={(e) => setProfileForm({ ...profileForm, accent_color: e.target.value })}
                  className="w-12 h-10 border border-gray-300 rounded cursor-pointer"
                />
                <input
                  type="text"
                  value={profileForm.accent_color}
                  onChange={(e) => setProfileForm({ ...profileForm, accent_color: e.target.value })}
                  placeholder="#000000"
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#185FA5]"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('fontFamilyLabel')}</label>
              <input
                type="text"
                value={profileForm.font_family}
                onChange={(e) => setProfileForm({ ...profileForm, font_family: e.target.value })}
                placeholder={t('fontFamilyPlaceholder')}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#185FA5]"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('brandVoiceLabel')}</label>
              <textarea
                value={profileForm.brand_voice}
                onChange={(e) => setProfileForm({ ...profileForm, brand_voice: e.target.value })}
                placeholder={t('brandVoicePlaceholder')}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#185FA5]"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t('brandGuidelinesLabel')}
              </label>
              <textarea
                value={profileForm.brand_guidelines}
                onChange={(e) =>
                  setProfileForm({ ...profileForm, brand_guidelines: e.target.value })
                }
                placeholder={t('brandGuidelinesPlaceholder')}
                rows={4}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#185FA5]"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('websiteUrlLabel')}</label>
              <input
                type="url"
                value={(profileForm as any).website_url || ""}
                onChange={(e) => setProfileForm({ ...profileForm, website_url: e.target.value } as any)}
                placeholder={t('websiteUrlPlaceholder')}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#185FA5]"
              />
              <p className="text-xs text-gray-400 mt-1">{t('websiteUrlHint')}</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('ctaTextLabel')}</label>
              <input
                type="text"
                value={(profileForm as any).cta_text || ''}
                onChange={(e) => setProfileForm({ ...profileForm, cta_text: e.target.value } as any)}
                placeholder={t('ctaTextPlaceholder')}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#185FA5]"
              />
              <p className="text-xs text-gray-400 mt-1">{t('ctaTextHint')}</p>
            </div>

            <button
              onClick={handleSaveProfile}
              disabled={profileSaving}
              className="w-full disabled:bg-gray-400 text-white font-medium py-2 px-4 rounded-lg transition-colors"
              style={{ backgroundColor: profileSaving ? undefined : '#185FA5' }}
            >
              {profileSaving ? t('saving') : t('saveProfile')}
            </button>
          </div>
          </div>
          )}
        </div>

        {/* Content Production */}
        <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">{t('contentProduction')}</h2>
          <div className="grid sm:grid-cols-3 gap-3">
            <button
              onClick={() => router.push(`/dashboard/new?productId=${productId}`)}
              className="p-6 border-2 border-gray-200 rounded-lg hover:border-blue-500 hover:bg-blue-50 transition-all text-left"
            >
              <div className="text-2xl mb-2">🎬</div>
              <h3 className="font-semibold text-gray-900">{t('createVideo')}</h3>
              <p className="text-sm text-gray-600 mt-1">{t('createVideoDesc')}</p>
            </button>

            <Link
              href={`/dashboard/products/${productId}/video/draft/new`}
              className="p-6 border-2 border-gray-200 rounded-lg hover:border-purple-500 hover:bg-purple-50 transition-all text-left block"
            >
              <div className="text-2xl mb-2">🎬</div>
              <h3 className="font-semibold text-gray-900">{t('createVideoApproval')}</h3>
              <p className="text-sm text-gray-600 mt-1">{t('createVideoApprovalDesc')}</p>
            </Link>

            <button
              onClick={() => router.push(`/dashboard/products/${productId}/article`)}
              className="p-6 border-2 border-gray-200 rounded-lg hover:border-green-500 hover:bg-green-50 transition-all text-left"
            >
              <div className="text-2xl mb-2">📝</div>
              <h3 className="font-semibold text-gray-900">{t('createArticle')}</h3>
              <p className="text-sm text-gray-600 mt-1">{t('createArticleDesc')}</p>
            </button>
          </div>
        </div>

        {/* Active jobs */}
        {activeJobs.length > 0 && (
          <div className="bg-white rounded-lg border border-gray-200 p-6 mb-8">
            <SectionHeader
              title={`${t('activeJobs', { count: activeJobs.length })}${jobsLoading ? ' …' : ''}`}
              open={openSections.jobs}
              onToggle={() => toggleSection('jobs')}
            />
            {openSections.jobs && (
              <div className="space-y-3">
                {activeJobs.map((job) => (
                  <div
                    key={job.id}
                    className={`p-4 rounded-lg border-l-4 ${
                      job.status === 'queued'
                        ? 'border-l-yellow-400 bg-yellow-50'
                        : job.status === 'generating'
                        ? 'border-l-blue-400 bg-blue-50'
                        : 'border-l-purple-400 bg-purple-50'
                    }`}
                  >
                    <h3 className="font-semibold text-gray-900">{job.title}</h3>
                    <p className="text-sm text-gray-600 mt-1">{job.description}</p>
                    <div className="mt-2 flex items-center gap-4 text-xs">
                      <span className="text-gray-500">
                        Status:{' '}
                        <span className="font-semibold">
                          {job.status === 'queued'
                            ? t('statusWaiting')
                            : job.status === 'generating'
                            ? t('statusGenerating')
                            : t('statusRendering')}
                        </span>
                      </span>
                      <span className="text-gray-500">
                        Format:{' '}
                        <span className="font-semibold">
                          {job.video_format?.split(',').join(', ') || 'N/A'}
                        </span>
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Done jobs */}
        {doneJobs.length > 0 && (
          <div className="bg-white rounded-lg border border-gray-200 p-6 mb-8">
            <SectionHeader
              title={t('doneJobs', { count: doneJobs.length })}
              open={openSections.doneJobs}
              onToggle={() => toggleSection('doneJobs')}
            />
            {openSections.doneJobs && (
              <div className="grid gap-4 md:grid-cols-2">
                {doneJobs.map((job) => {
                  const videoUrl =
                    (job.ai_parameters as any)?.video_url ||
                    (job.ai_parameters as any)?.r2_url ||
                    null
                  return (
                    <div
                      key={job.id}
                      className="p-4 rounded-lg border border-green-200 bg-green-50 hover:shadow-md transition-shadow"
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex-1">
                          <h3 className="font-semibold text-gray-900">{job.title}</h3>
                          <p className="text-xs text-gray-500 mt-1">{t('completed')}</p>
                        </div>
                      </div>

                      {videoUrl && (
                        <>
                          <video
                            src={videoUrl}
                            controls
                            playsInline
                            preload="metadata"
                            className="w-full rounded-lg mb-3 bg-black"
                            style={{ aspectRatio: '9/16', maxHeight: '300px' }}
                          />
                          <div className="flex gap-2">
                            <button
                              onClick={() =>
                                router.push(
                                  `/dashboard/publish?type=video&job_id=${job.id}&product_id=${productId}`
                                )
                              }
                              className="flex-1 text-center text-white px-3 py-2 rounded-lg text-sm font-semibold transition-colors" style={{ backgroundColor: '#185FA5' }}
                            >
                              {t('publish')}
                            </button>
                            <a
                              href={videoUrl}
                              download={`${job.title.replace(/\s+/g, '_')}.mp4`}
                              className="flex-1 text-center bg-green-600 hover:bg-green-700 text-white px-3 py-2 rounded-lg text-sm font-semibold transition-colors"
                            >
                              {t('download')}
                            </a>
                          </div>
                        </>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* Content Banks */}
        <div className="space-y-6">
          {/* Videos */}
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <SectionHeader
              title={t('videos', { count: videos.length })}
              open={openSections.videos}
              onToggle={() => toggleSection('videos')}
            />
            {openSections.videos && (
              <>
                {videosLoading ? (
                  <div className="text-center py-8 text-gray-500">{t('loadingVideos')}</div>
                ) : videos.length > 0 ? (
                  <div className="space-y-4">
                    {videos.map((video) => {
                      const title =
                        video.metadata?.title || `Video – ${formatDate(video.created_at)}`
                      return (
                        <div key={video.id} className="border border-gray-200 rounded-lg p-3">
                          <p className="text-sm font-medium text-gray-800 mb-2">{title}</p>
                          <video
                            src={video.asset_url}
                            preload="metadata"
                            controls
                            className="w-full rounded-lg bg-gray-900 mb-3"
                            style={{ maxHeight: '200px' }}
                          />
                          <div className="flex gap-2">
                            <button
                              onClick={() =>
                                router.push(
                                  `/dashboard/publish?type=video&job_id=${video.job_id}&product_id=${productId}`
                                )
                              }
                              className="flex-1 text-center text-white px-3 py-2 rounded-lg text-sm font-semibold transition-colors" style={{ backgroundColor: '#185FA5' }}
                            >
                              {t('publish')}
                            </button>
                            <a
                              href={video.asset_url}
                              download={(video as any).name || 'video.mp4'}
                              className="flex-1 text-center bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-2 rounded-lg text-sm font-medium transition-colors"
                            >
                              {t('download')}
                            </a>
                            <button
                              onClick={() => handleDeleteVideo(video.id)}
                              className="px-3 py-2 bg-red-50 hover:bg-red-100 text-red-600 rounded-lg text-sm font-medium transition-colors"
                            >
                              {t('delete')}
                            </button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-12 text-center text-gray-500">
                    <div className="text-4xl mb-2">🎥</div>
                    <p className="text-sm">{t('noVideos')}</p>
                    <p className="text-xs text-gray-400 mt-2">{t('noVideosDesc')}</p>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Images */}
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <SectionHeader
              title={t('images', { count: assets.length })}
              open={openSections.images}
              onToggle={() => toggleSection('images')}
            />
            {openSections.images && (
              <>
                {assetsLoading ? (
                  <div className="text-center py-8 text-gray-500">{t('loadingImages')}</div>
                ) : assets.length > 0 ? (
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                    {assets.map((asset) => (
                      <div key={asset.id} className="relative group aspect-square bg-gray-100 rounded-lg overflow-hidden">
                        <a
                          href={asset.asset_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block w-full h-full"
                        >
                          <img
                            src={asset.asset_url}
                            alt="Generated image"
                            className="w-full h-full object-cover group-hover:opacity-80 transition-opacity"
                          />
                        </a>
                        {/* Delete button — appears on hover */}
                        <button
                          onClick={() => handleDeleteImage(asset.id)}
                          title={t('deleteImage')}
                          className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity w-7 h-7 flex items-center justify-center rounded-md bg-white/90 text-gray-500 hover:text-red-500 hover:bg-red-50 shadow-sm"
                        >
                          <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
                            <path d="M1 3h12M5 3V2h4v1M2 3l1 9h8l1-9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-12 text-center text-gray-500">
                    <div className="text-4xl mb-2">🖼️</div>
                    <p className="text-sm">{t('noImages')}</p>
                    <p className="text-xs text-gray-400 mt-2">
                      {t('noImagesDesc')}
                    </p>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Articles */}
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <SectionHeader
              title={t('articles', { count: articles.length })}
              open={openSections.articles}
              onToggle={() => toggleSection('articles')}
            />
            {openSections.articles && (
              <>
                {articlesLoading ? (
                  <div className="text-center py-12 text-gray-500">{t('loadingArticles')}</div>
                ) : articles.length > 0 ? (
                  <div className="space-y-4">
                    {articles.map((article) => (
                      <div
                        key={article.id}
                        className="border border-gray-200 rounded-lg p-4 hover:border-blue-300 transition-colors"
                      >
                        <div>
                          <div className="flex gap-3 mb-2">
                            {article.image_urls?.[0] && (
                              <img
                                src={article.image_urls[0]}
                                alt={article.title}
                                className="w-14 h-14 rounded-lg object-cover flex-shrink-0"
                              />
                            )}
                            <div className="flex-1 min-w-0">
                              <a
                                href={`/dashboard/products/${productId}/article/${article.id}`}
                                className="block font-semibold text-gray-900 hover:text-blue-700 transition-colors mb-1 leading-snug"
                              >
                                {article.title}
                              </a>
                              <span className="inline-block px-2 py-0.5 text-xs font-medium rounded capitalize" style={{ backgroundColor: '#EBF4FF', color: '#185FA5' }}>
                                {article.platform}
                              </span>
                            </div>
                          </div>
                          <p className="text-sm text-gray-500 mb-2 line-clamp-2">
                            {article.content.replace(/\n/g, ' ').substring(0, 120)}...
                          </p>
                          <div className="flex items-center justify-between">
                            <p className="text-xs text-gray-400">
                              {new Date(article.created_at).toLocaleDateString('no-NO')}
                            </p>
                            <div className="flex gap-2">
                              <button
                                onClick={() =>
                                  router.push(
                                    `/dashboard/publish?type=article&content_id=${article.id}&product_id=${productId}`
                                  )
                                }
                                className="px-3 py-1.5 text-white rounded-lg text-xs font-semibold transition-colors"
                                style={{ backgroundColor: '#185FA5' }}
                              >
                                {t('publish')}
                              </button>
                              <button
                                onClick={() => handleDeleteArticle(article.id)}
                                className="px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-600 rounded-lg text-xs font-medium transition-colors"
                              >
                                {t('delete')}
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-12 border border-gray-200 rounded-lg">
                    <div className="text-4xl mb-2">📝</div>
                    <p className="text-sm text-gray-500">{t('noArticles')}</p>
                    <p className="text-xs text-gray-400 mt-2">
                      {t('noArticlesDesc')}
                    </p>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

