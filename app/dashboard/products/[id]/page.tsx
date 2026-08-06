'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/lib/authContext'
import { getSupabase } from '@/lib/supabaseClient'
import { useTranslations } from 'next-intl'
import { useTenant } from '@/lib/tenantContext'
import { verticalConfig } from '@/lib/verticals'
import { uploadTrack } from '@/lib/uploadTrack'

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
  article_logo_url: string | null
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
  video_format?: string | null
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
  const tenant = useTenant()
  const vcfg = verticalConfig(tenant.vertical)
  const productId = params.id as string

  const [product, setProduct] = useState<Product | null>(null)
  const [profile, setProfile] = useState<ProductProfile | null>(null)
  const [jobs, setJobs] = useState<ProductionJob[]>([])
  // Fra ferdig video tilbake til utkastet som lagde den (Lars 2/8)
  const [draftByJobId, setDraftByJobId] = useState<Record<string, string>>({})
  // Siste utvei naar koblingen mangler (Lars 3/8, fjerde runde paa samme knapp)
  const [nyesteDraftId, setNyesteDraftId] = useState<string | null>(null)
  const [titleByJobId, setTitleByJobId] = useState<Record<string, string>>({})
  const [jobsLoading, setJobsLoading] = useState(false)
  // Bildebiblioteket (artist-images/<productId> i R2): administreres her,
  // brukes som segmentbilder i editorene. For music-vertikalen er dette
  // KILDEN til videobilder (AI-generering er av som default der).
  const [imageLibrary, setImageLibrary] = useState<Array<{ url: string; name: string }>>([])
  const [imgLibUploading, setImgLibUploading] = useState(false)
  const [imgLibError, setImgLibError] = useState<string | null>(null)
  const refreshImageLibrary = async () => {
    try {
      const { data: sess } = await getSupabase().auth.getSession()
      const token = sess?.session?.access_token
      const d = await fetch(`/api/products/images?productId=${productId}`, token ? { headers: { Authorization: `Bearer ${token}` } } : undefined).then((r) => r.json())
      if (d.images) setImageLibrary(d.images)
    } catch { /* valgfritt */ }
  }
  useEffect(() => { if (productId) refreshImageLibrary() }, [productId]) // eslint-disable-line react-hooks/exhaustive-deps
  // Låtbanken (tracks-<productId> på musikkserveren): artistens egne låter —
  // brukes som bakgrunnsmusikk og medley i produksjonene. Permanent sletting
  // skjer HER, ikke i editorenes velgere (Lars 30/7).
  const [trackBank, setTrackBank] = useState<Array<{ filename: string; name: string; folder?: string }>>([])
  const [trackUploading, setTrackUploading] = useState(false)
  const [trackError, setTrackError] = useState<string | null>(null)
  const refreshTrackBank = async () => {
    try {
      const d = await fetch('/api/music').then((r) => r.json())
      if (d.files) setTrackBank(d.files.filter((f: { folder?: string }) => f.folder === `tracks-${productId}`))
    } catch { /* valgfritt */ }
  }
  useEffect(() => { if (productId) refreshTrackBank() }, [productId]) // eslint-disable-line react-hooks/exhaustive-deps
  const prevJobStatusesRef = useRef<Record<string, string>>({})
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
    avatarJobs: true,
    videos: false,
    images: false,
    articles: false,
    brandProfile: false,
  })
  const toggleSection = (key: keyof typeof openSections) =>
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }))

  const [profileForm, setProfileForm] = useState({
    logo_url: '',
    article_logo_url: '',
    primary_color: '',
    secondary_color: '',
    accent_color: '',
    font_family: '',
    brand_voice: '',
    brand_guidelines: '',
    website_url: '',
    cta_text: '',
    service_area: '',
    phone: '',
    address: '',
  })
  const [profileSaving, setProfileSaving] = useState(false)
  const [profileMessage, setProfileMessage] = useState<string | null>(null)
  const [logoUploading, setLogoUploading] = useState(false)
  const [articleLogoUploading, setArticleLogoUploading] = useState(false)

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
        article_logo_url: profile.article_logo_url || '',
        primary_color: profile.primary_color || '',
        secondary_color: profile.secondary_color || '',
        accent_color: profile.accent_color || '',
        font_family: profile.font_family || '',
        brand_voice: profile.brand_voice || '',
        brand_guidelines: profile.brand_guidelines ? String(profile.brand_guidelines) : '',
        website_url: (profile as any).website_url || '',
        cta_text: (profile as any).cta_text || '',
        service_area: (profile as any).service_area || '',
        phone: (profile as any).phone || '',
        address: (profile as any).address || '',
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
            article_logo_url: profileForm.article_logo_url || null,
            primary_color: profileForm.primary_color || null,
            secondary_color: profileForm.secondary_color || null,
            accent_color: profileForm.accent_color || null,
            font_family: profileForm.font_family || null,
            brand_voice: profileForm.brand_voice || null,
            brand_guidelines: profileForm.brand_guidelines || null,
            website_url: (profileForm as any).website_url || null,
            cta_text: (profileForm as any).cta_text || null,
            // Vertikal-felter kun for vertikal-tenants — kolonnene kan mangle i basen ellers
            ...(vcfg?.serviceAreaField ? { service_area: (profileForm as any).service_area || null } : {}),
            ...(vcfg?.contactFields ? {
              phone: (profileForm as any).phone || null,
              address: (profileForm as any).address || null,
            } : {}),
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
      const { data: sess } = await getSupabase().auth.getSession()
      const token = sess?.session?.access_token
      const res = await fetch('/api/products/upload-logo', {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
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

  const handleArticleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setArticleLogoUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('productId', productId)
      formData.append('logoType', 'article')
      const { data: sess } = await getSupabase().auth.getSession()
      const token = sess?.session?.access_token
      const res = await fetch('/api/products/upload-logo', {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        body: formData,
      })
      const data = await res.json()
      if (data.url) {
        setProfile((prev) => (prev ? { ...prev, article_logo_url: data.url } : null))
        setProfileForm((prev) => ({ ...prev, article_logo_url: data.url }))
      }
    } catch (err) {
      console.error('Article logo upload failed:', err)
    } finally {
      setArticleLogoUploading(false)
    }
  }

  const handleRemoveLogo = async () => {
    if (!productId) return
    const supabase = getSupabase()
    await supabase.from('products').update({ logo_url: null }).eq('id', productId)
    // Også profilen — video-outroen leser product_profiles.logo_url FØRST,
    // så uten denne blir gammel logo hengende på sluttplakaten
    await supabase.from('product_profiles').update({ logo_url: null }).eq('product_id', productId)
    setProduct((prev) => (prev ? { ...prev, logo_url: null } : null))
    setProfile((prev) => (prev ? { ...prev, logo_url: null } : null))
    setProfileForm((prev) => ({ ...prev, logo_url: '' }))
  }

  const handleDeleteJob = async (id: string) => {
    if (!confirm('Slette denne produksjonen?')) return
    const supabase = getSupabase()
    await supabase.from('production_jobs').delete().eq('id', id)
    setJobs((prev) => prev.filter((j) => j.id !== id))
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

    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      Notification.requestPermission()
    }

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

        const newJobs = jobsData || []
        const prev = prevJobStatusesRef.current

        // Detect jobs that just completed
        if (Object.keys(prev).length > 0) {
          for (const job of newJobs) {
            const wasActive = prev[job.id] && !['done', 'completed', 'failed'].includes(prev[job.id])
            const isNowDone = job.status === 'done' || job.status === 'completed'
            if (wasActive && isNowDone && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
              new Notification('Produksjon ferdig! 🎉', {
                body: job.title,
                icon: '/favicon.ico',
              })
            }
          }
        }

        prevJobStatusesRef.current = Object.fromEntries(newJobs.map((j: ProductionJob) => [j.id, j.status]))
        setJobs(newJobs)
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

        const jobIds = (videosData || []).map((v: any) => v.job_id).filter(Boolean)
        let formatByJobId: Record<string, string> = {}
        // Utkastene hentes ALLTID. Foer laa hele oppslaget bak «har videoene
        // job_id?» — mangler den koblingen, ble ingen utkast lest, og da fantes
        // det ikke engang et utkast aa falle tilbake paa. Da var «Rediger»
        // borte fra alle filmene uansett hva vi ellers fikset (Lars 3/8).
        // Sist ARBEIDET MED, ikke sist opprettet — et gammelt utkast Lars
        // redigerte i dag er riktigere fallback enn et nyere han forlot
        const { data: alleUtkast } = await supabase
          .from('production_drafts')
          .select('id, updated_at')
          .eq('product_id', productId)
          .order('updated_at', { ascending: false })
        if ((alleUtkast || []).length > 0) setNyesteDraftId((alleUtkast as any[])[0].id)
        if (jobIds.length > 0) {
          // Hent ALLE utkast for produktet, ikke bare de med treff paa job_id:
          // eldre utkast kan mangle koblingen, men har campaign_id — og jobben
          // husker campaignId i ai_parameters. To veier gir robust treff.
          const { data: drafts } = await supabase
            .from('production_drafts')
            .select('id, job_id, campaign_id, video_format, created_at')
            .order('created_at', { ascending: false })
            .eq('product_id', productId)
          const draftIds: Record<string, string> = {}
          const draftByCampaign: Record<string, string> = {}
          ;(drafts || []).forEach((d: any) => {
            if (d.job_id) {
              formatByJobId[d.job_id] = d.video_format || ''
              draftIds[d.job_id] = d.id
            }
            // Reserveveien MAA speile hva produksjonen faktisk sender:
            // `campaignId: draft.campaign_id || draft.id`. Uten fallbacken traff
            // den aldri utkast som mangler campaign_id — og siden utkastet bare
            // husker SISTE jobb, forsvant «Rediger» fra alle eldre videoer i det
            // en ny produksjon startet (Lars 3/8, etter en avbrutt jobb).
            draftByCampaign[d.campaign_id || d.id] = d.id
          })
          // Vei 2: via jobbens campaignId for de som mangler direkte kobling
          const utenTreff = jobIds.filter((j: string) => !draftIds[j])
          if (utenTreff.length > 0) {
            const { data: js } = await supabase
              .from('production_jobs')
              .select('id, ai_parameters')
              .in('id', utenTreff)
            ;(js || []).forEach((j: any) => {
              const c = j.ai_parameters?.campaignId
              if (c && draftByCampaign[c]) draftIds[j.id] = draftByCampaign[c]
            })
          }
          // Vei 3 (sikreste): utkast-ID stemplet paa selve videoen da den ble
          // laget. Vei 1 og 2 er gjetting i ettertid — denne er et faktum.
          // Vei 3b: videoens EGEN campaignId — ogsaa lagret i det filmen ble
          // til, og den peker paa utkastet som faktisk lagde akkurat denne
          // filmen. Gjelder ALLE filmene, ogsaa de fra foer draftId-stemplingen
          // (Lars 3/8: «Rediger *» aapnet feil utkast — norsk tekst og tale).
          ;(videosData || []).forEach((v: any) => {
            const d = v.metadata?.draftId || draftByCampaign[v.metadata?.campaignId]
            if (d && v.job_id) draftIds[v.job_id] = d
          })
          // Vei 4: har produktet KUN ETT utkast, finnes det ingen tvil om hvem
          // som lagde filmen. Dekker alle videoene fra foer stemplingen kom
          // (Lars 3/8: «fremdeles ingen redigeringsknapp»).
          if ((drafts || []).length === 1) {
            const eneste = (drafts as any[])[0].id
            jobIds.forEach((j: string) => { if (!draftIds[j]) draftIds[j] = eneste })
          }
          setDraftByJobId(draftIds)

          // Jobbens tittel gjoer filmene skillbare (Lars 2/8: alle het
          // «Video – 1 Aug 2026», umulig aa se hvilken som var hvilken)
          const { data: alleJobs } = await supabase
            .from('production_jobs')
            .select('id, title')
            .in('id', jobIds)
          const titler: Record<string, string> = {}
          ;(alleJobs || []).forEach((j: any) => { if (j.title) titler[j.id] = j.title })
          setTitleByJobId(titler)
        }

        setVideos((videosData || []).map((v: any) => ({ ...v, video_format: formatByJobId[v.job_id] || null })))
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
    // Seksjonen vises ikke for artist-tjenester — da er det ingen grunn til
    // aa hente artiklene heller.
    if (tenant.vertical === 'music') { setArticlesLoading(false); return }

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
  }, [productId, tenant.vertical])

  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--paper)] flex items-center justify-center">
        <div className="text-gray-600">{t('loading')}</div>
      </div>
    )
  }

  if (error || !product) {
    return (
      <div className="min-h-screen bg-[var(--paper)]">
        <div className="max-w-6xl mx-auto px-6 py-8">
          <Link href="/dashboard" className="text-[var(--ember-deep)] hover:text-[var(--ink)] mb-4 inline-block">
            {t('backToDashboard')}
          </Link>
          <div className="text-center py-12">
            <p className="text-red-600 text-lg">{error || t('notFound')}</p>
          </div>
        </div>
      </div>
    )
  }

  const R2_PUBLIC_URL = 'https://pub-5dcdfe9305a740febc87568c9ccb40a6.r2.dev'

  const activeJobs = jobs.filter(
    (j) => !['done', 'completed', 'failed'].includes(j.status)
  )
  const doneJobs = jobs.filter(
    (j) => (j.status === 'done' || j.status === 'completed') && j.content_type !== 'avatar' && j.content_type !== 'radio'
  )
  const radioDoneJobs = jobs.filter(
    (j) => (j.status === 'done' || j.status === 'completed') && j.content_type === 'radio'
  )
  const avatarDoneJobs = jobs.filter(
    (j) => (j.status === 'done' || j.status === 'completed') && j.content_type === 'avatar'
  )

  return (
    <div className="min-h-screen bg-[var(--paper)]">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        {/* Header */}
        <div className="mb-6">
          <Link href="/dashboard" className="text-sm font-medium mb-3 inline-block" style={{ color: 'var(--ember-deep)' }}>
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
                  className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--ember-deep)]"
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
              <label className="block text-sm font-medium text-gray-700 mb-2">Artikkellogo (vises på genererte bilder)</label>
              <div className="flex gap-2 items-center">
                <input
                  type="text"
                  value={profileForm.article_logo_url}
                  onChange={(e) => setProfileForm({ ...profileForm, article_logo_url: e.target.value })}
                  placeholder="https://example.com/article-logo.png"
                  className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--ember-deep)]"
                />
                <span className="text-gray-400 text-sm">{t('or')}</span>
                <label className="cursor-pointer px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm border border-gray-300 transition-colors">
                  {articleLogoUploading ? t('uploading') : t('upload')}
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/svg+xml,image/webp"
                    onChange={handleArticleLogoUpload}
                    className="hidden"
                  />
                </label>
              </div>
              {profileForm.article_logo_url && (
                <img
                  src={profileForm.article_logo_url}
                  alt="Artikkellogo preview"
                  className="mt-3 h-12 w-auto object-contain"
                />
              )}
              <p className="mt-1 text-xs text-gray-400">Brukes på illustrasjoner i artikler. Hvis ikke satt, brukes standard-logoen.</p>
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
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--ember-deep)]"
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
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--ember-deep)]"
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
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--ember-deep)]"
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
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--ember-deep)]"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('brandVoiceLabel')}</label>
              <textarea
                value={profileForm.brand_voice}
                onChange={(e) => setProfileForm({ ...profileForm, brand_voice: e.target.value })}
                placeholder={t('brandVoicePlaceholder')}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--ember-deep)]"
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
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--ember-deep)]"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('websiteUrlLabel')}</label>
              <input
                type="url"
                value={(profileForm as any).website_url || ""}
                onChange={(e) => setProfileForm({ ...profileForm, website_url: e.target.value } as any)}
                placeholder={t('websiteUrlPlaceholder')}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--ember-deep)]"
              />
              <p className="text-xs text-gray-400 mt-1">{t('websiteUrlHint')}</p>
            </div>

            {vcfg?.serviceAreaField && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('serviceAreaLabel')}</label>
                <input
                  type="text"
                  value={(profileForm as any).service_area || ''}
                  onChange={(e) => setProfileForm({ ...profileForm, service_area: e.target.value } as any)}
                  placeholder={t('serviceAreaPlaceholder')}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--ember-deep)]"
                />
              </div>
            )}

            {vcfg?.contactFields && (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('phoneLabel')}</label>
                  <input
                    type="tel"
                    value={(profileForm as any).phone || ''}
                    onChange={(e) => setProfileForm({ ...profileForm, phone: e.target.value } as any)}
                    placeholder={t('phonePlaceholder')}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--ember-deep)]"
                  />
                  <p className="text-xs text-gray-400 mt-1">{t('phoneHint')}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('addressLabel')}</label>
                  <input
                    type="text"
                    value={(profileForm as any).address || ''}
                    onChange={(e) => setProfileForm({ ...profileForm, address: e.target.value } as any)}
                    placeholder={t('addressPlaceholder')}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--ember-deep)]"
                  />
                </div>
              </>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('ctaTextLabel')}</label>
              <input
                type="text"
                value={(profileForm as any).cta_text || ''}
                onChange={(e) => setProfileForm({ ...profileForm, cta_text: e.target.value } as any)}
                placeholder={t('ctaTextPlaceholder')}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--ember-deep)]"
              />
              <p className="text-xs text-gray-400 mt-1">{t('ctaTextHint')}</p>
            </div>

            <button
              onClick={handleSaveProfile}
              disabled={profileSaving}
              className="w-full disabled:bg-gray-400 text-white font-medium py-2 px-4 rounded-lg transition-colors"
              style={{ backgroundColor: profileSaving ? undefined : 'var(--ember-deep)' }}
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
          <div className="grid sm:grid-cols-2 gap-3">
            <Link
              href={`/dashboard/products/${productId}/video/draft/new`}
              className="p-6 border-2 border-gray-200 rounded-lg hover:border-[var(--ember-deep)] hover:bg-[var(--ember-tint-bg)] transition-all text-left block"
            >
              <div className="text-2xl mb-2">🎬</div>
              <h3 className="font-semibold text-gray-900">{t('createVideoApproval')}</h3>
              <p className="text-sm text-gray-600 mt-1">{t('createVideoApprovalDesc')}</p>
            </Link>

            {/* Radioreklame og artikkel er ikke for artister (Lars 1/8:
                «IndigoBooms artister er mest interessert i video») — men
                bestaar for de andre vertikalene */}
            {tenant.vertical !== 'music' && (
            <Link
              href={`/dashboard/products/${productId}/radio`}
              className="p-6 border-2 border-gray-200 rounded-lg hover:border-[#D97706] hover:bg-[#FFFBEB] transition-all text-left block"
            >
              <div className="text-2xl mb-2">🎙️</div>
              <h3 className="font-semibold text-gray-900">Radioreklame</h3>
              <p className="text-sm text-gray-600 mt-1">Manus og innlest stemme — ferdig MP3 klar til nedlasting</p>
            </Link>
            )}

            <Link
              href={`/dashboard/products/${productId}/avatar`}
              className="p-6 border-2 border-gray-200 rounded-lg hover:border-[#7C3AED] hover:bg-[#F5F3FF] transition-all text-left block"
            >
              <div className="text-2xl mb-2">🧑‍💼</div>
              <h3 className="font-semibold text-gray-900">Avatar Video</h3>
              <p className="text-sm text-gray-600 mt-1">En AI-vert fremfører manuset ditt med lyd og leppebevegelser</p>
            </Link>

            {tenant.vertical !== 'music' && (
            <button
              onClick={() => router.push(`/dashboard/products/${productId}/article`)}
              className="p-6 border-2 border-gray-200 rounded-lg hover:border-[#3F7A4E] hover:bg-[#f0fdf8] transition-all text-left"
            >
              <div className="text-2xl mb-2">📝</div>
              <h3 className="font-semibold text-gray-900">{t('createArticle')}</h3>
              <p className="text-sm text-gray-600 mt-1">{t('createArticleDesc')}</p>
            </button>
            )}
          </div>
        </div>

        {/* Bildebiblioteket — pressebilder og artwork, gjenbrukes i produksjonene */}
        <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-1">
            📸 {tenant.vertical === 'music' ? 'Bildene dine' : 'Bildebibliotek'}
          </h2>
          <p className="text-sm text-gray-500 mb-4">
            {tenant.vertical === 'music'
              ? 'Pressebilder, konsertbilder og utgivelses-artwork — dette er bildene som brukes i videoene dine. Last opp én gang, bruk overalt.'
              : 'Egne bilder som kan brukes i produksjonene. Last opp én gang, bruk overalt.'}
          </p>
          {imgLibError && (
            <p className="text-sm font-medium text-[var(--ember-deep)] mb-3">{imgLibError}</p>
          )}
          <div className="grid grid-cols-3 sm:grid-cols-5 gap-3 mb-4">
            {imageLibrary.map((img) => (
              <div key={img.url} className="relative group aspect-square rounded-lg overflow-hidden border border-gray-200">
                <img src={img.url} alt={img.name} className="w-full h-full object-cover" />
                <button
                  type="button"
                  title="Slett bildet"
                  onClick={async () => {
                    if (!confirm('Slette dette bildet fra biblioteket? Segmenter som alt bruker det, beholder det.')) return
                    try {
                      const { data: sess } = await getSupabase().auth.getSession()
                      const token = sess?.session?.access_token
                      const res = await fetch(`/api/products/images?productId=${productId}&name=${encodeURIComponent(img.name)}`, {
                        method: 'DELETE',
                        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
                      })
                      if (!res.ok) { setImgLibError('Slettingen feilet — prøv igjen.'); return }
                      setImgLibError(null)
                      await refreshImageLibrary()
                    } catch { setImgLibError('Slettingen feilet — prøv igjen.') }
                  }}
                  className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/60 text-white text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  ✕
                </button>
              </div>
            ))}
            {imageLibrary.length === 0 && (
              <p className="col-span-full text-sm text-gray-400">Ingen bilder ennå.</p>
            )}
          </div>
          <label className="inline-block cursor-pointer">
            <span className={`px-4 py-2 rounded-lg text-sm font-medium text-[var(--on-ember)] bg-[var(--ember-deep)] hover:opacity-90 inline-block ${imgLibUploading ? 'opacity-50' : ''}`}>
              {imgLibUploading ? 'Laster opp…' : '+ Last opp bilder'}
            </span>
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              multiple
              className="hidden"
              disabled={imgLibUploading}
              onChange={async (e) => {
                const files = Array.from(e.currentTarget.files || [])
                e.currentTarget.value = ''
                if (!files.length) return
                setImgLibError(null)
                setImgLibUploading(true)
                try {
                  const { data: sess } = await getSupabase().auth.getSession()
                  const token = sess?.session?.access_token
                  for (const f of files) {
                    if (f.size > 8 * 1024 * 1024) { setImgLibError(`«${f.name}» er for stor (maks 8 MB) — hoppet over.`); continue }
                    const fd = new FormData()
                    fd.append('file', f)
                    fd.append('productId', productId)
                    const res = await fetch('/api/products/images', {
                      method: 'POST',
                      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
                      body: fd,
                    })
                    if (!res.ok) {
                      const d = await res.json().catch(() => null)
                      setImgLibError(d?.error ? `«${f.name}»: ${d.error}` : `«${f.name}» feilet.`)
                    }
                  }
                  await refreshImageLibrary()
                } finally {
                  setImgLibUploading(false)
                }
              }}
            />
          </label>
          <span className="text-xs text-gray-400 ml-3">PNG, JPG eller WebP — maks 8 MB per bilde. Velg gjerne flere samtidig.</span>
        </div>

        {/* Låtbanken — egne låter til bakgrunnsmusikk og medley */}
        <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-1">
            🎵 {tenant.vertical === 'music' ? 'Låtene dine' : 'Musikkbank'}
          </h2>
          <p className="text-sm text-gray-500 mb-4">
            {tenant.vertical === 'music'
              ? 'Egen musikk, eller musikk du har rett til å bruke — velges som bakgrunnsmusikk og medley i produksjonene. Sletting her er permanent.'
              : 'Egen musikk til produksjonene. Sletting her er permanent.'}
          </p>
          {trackError && <p className="text-sm font-medium text-[var(--ember-deep)] mb-3">{trackError}</p>}
          <div className="space-y-2 mb-4">
            {trackBank.map((t) => (
              <div key={t.filename} className="flex items-center gap-3 p-2 border border-gray-200 rounded-lg">
                <span className="text-sm font-medium text-gray-900 truncate flex-1">{t.name}</span>
                <audio controls preload="none" src={`/api/music/${encodeURIComponent(t.filename)}`} className="h-8 w-56 flex-none" />
                <button
                  type="button"
                  title="Slett låten permanent"
                  onClick={async () => {
                    if (!confirm(`Slette «${t.name}» permanent fra låtbanken? Produksjoner som alt bruker den, beholder lyden.`)) return
                    try {
                      const res = await fetch(`/api/music/${encodeURIComponent(t.filename)}`, { method: 'DELETE' })
                      if (!res.ok) { setTrackError('Slettingen feilet — prøv igjen.'); return }
                      setTrackError(null)
                      await refreshTrackBank()
                    } catch { setTrackError('Slettingen feilet — prøv igjen.') }
                  }}
                  className="flex-none text-gray-300 hover:text-red-500 text-sm px-1"
                >
                  ✕
                </button>
              </div>
            ))}
            {trackBank.length === 0 && <p className="text-sm text-gray-400">Ingen låter ennå.</p>}
          </div>
          <label className="inline-block cursor-pointer">
            <span className={`px-4 py-2 rounded-lg text-sm font-medium text-[var(--on-ember)] bg-[var(--ember-deep)] hover:opacity-90 inline-block ${trackUploading ? 'opacity-50' : ''}`}>
              {trackUploading ? 'Laster opp…' : '+ Last opp låter'}
            </span>
            <input
              type="file"
              accept=".mp3,audio/mpeg"
              multiple
              className="hidden"
              disabled={trackUploading}
              onChange={async (e) => {
                const files = Array.from(e.currentTarget.files || [])
                e.currentTarget.value = ''
                if (!files.length) return
                setTrackError(null)
                setTrackUploading(true)
                try {
                  for (const f of files) {
                    try {
                      await uploadTrack(f, `tracks-${productId}`)
                    } catch (err) {
                      setTrackError(`«${f.name}»: ${err instanceof Error ? err.message : 'feilet'}`)
                    }
                  }
                  await refreshTrackBank()
                } finally {
                  setTrackUploading(false)
                }
              }}
            />
          </label>
          <span className="text-xs text-gray-400 ml-3">MP3 — maks 50 MB per låt. Velg gjerne flere samtidig.</span>
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
                    <div className="mt-2 flex items-center justify-between gap-4 text-xs">
                      <div className="flex items-center gap-4">
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
                      <button
                        onClick={async () => {
                          if (!confirm('Fjern denne jobben?')) return
                          const { data: { session } } = await getSupabase().auth.getSession()
                          await fetch(`/api/productions/${job.id}`, {
                            method: 'DELETE',
                            headers: { Authorization: `Bearer ${session?.access_token}` },
                          })
                          setJobs((prev) => prev.filter((j) => j.id !== job.id))
                        }}
                        className="text-gray-400 hover:text-red-500 transition-colors px-1"
                        title="Fjern jobb"
                      >
                        ✕
                      </button>
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
                              className="flex-1 text-center text-white px-3 py-2 rounded-lg text-sm font-semibold transition-colors" style={{ backgroundColor: 'var(--ember-deep)' }}
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

        {/* Radio jobs */}
        {radioDoneJobs.length > 0 && (
          <div className="bg-white rounded-lg border border-gray-200 p-6 mb-8">
            <SectionHeader
              title={`Ferdigstilte radioreklamer (${radioDoneJobs.length})`}
              open={openSections.doneJobs}
              onToggle={() => toggleSection('doneJobs')}
            />
            {openSections.doneJobs && (
              <div className="grid gap-4 md:grid-cols-2">
                {radioDoneJobs.map((job) => {
                  const audioUrl =
                    (job.ai_parameters as any)?.video_url ||
                    (job.ai_parameters as any)?.r2_url ||
                    null
                  return (
                    <div key={job.id} className="p-4 rounded-lg border border-amber-200 bg-amber-50 hover:shadow-md transition-shadow">
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex-1">
                          <h3 className="font-semibold text-gray-900">{job.title}</h3>
                          <p className="text-xs text-gray-500 mt-1">✅ Ferdigstilt</p>
                        </div>
                        <button
                          onClick={() => handleDeleteJob(job.id)}
                          className="ml-2 text-gray-400 hover:text-red-500 transition-colors text-lg leading-none"
                          title="Slett"
                        >
                          ×
                        </button>
                      </div>
                      {audioUrl && (
                        <>
                          <audio src={audioUrl} controls className="w-full mb-3" />
                          <a
                            href={audioUrl}
                            download={`${job.title.replace(/\s+/g, '_')}.mp3`}
                            className="block text-center bg-green-600 hover:bg-green-700 text-white px-3 py-2 rounded-lg text-sm font-semibold transition-colors"
                          >
                            ⬇️ Last ned
                          </a>
                        </>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* Avatar jobs */}
        {avatarDoneJobs.length > 0 && (
          <div className="bg-white rounded-lg border border-gray-200 p-6 mb-8">
            <SectionHeader
              title={`Avatar-videoer (${avatarDoneJobs.length})`}
              open={openSections.avatarJobs}
              onToggle={() => toggleSection('avatarJobs')}
            />
            {openSections.avatarJobs && (
              <div className="grid gap-4 md:grid-cols-2">
                {avatarDoneJobs.map((job) => {
                  const videoUrl = `${R2_PUBLIC_URL}/avatars/${job.id}/output.mp4`
                  return (
                    <div
                      key={job.id}
                      className="p-4 rounded-lg border border-purple-200 bg-purple-50 hover:shadow-md transition-shadow"
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex-1">
                          <h3 className="font-semibold text-gray-900">{job.title}</h3>
                          <p className="text-xs text-gray-500 mt-1">
                            {job.completed_at ? formatDate(job.completed_at) : formatDate(job.updated_at)}
                          </p>
                        </div>
                      </div>
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
                              `/dashboard/publish?type=avatar&job_id=${job.id}&product_id=${productId}`
                            )
                          }
                          className="flex-1 text-center text-white px-3 py-2 rounded-lg text-sm font-semibold transition-colors"
                          style={{ backgroundColor: '#7C3AED' }}
                        >
                          Publiser
                        </button>
                        <a
                          href={videoUrl}
                          download={`${job.title.replace(/\s+/g, '_')}_avatar.mp4`}
                          className="flex-1 text-center bg-purple-600 hover:bg-purple-700 text-white px-3 py-2 rounded-lg text-sm font-semibold transition-colors"
                        >
                          Last ned
                        </a>
                      </div>
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
                      // Tittel fra utkastet naar den finnes; ellers dato.
                      // Klokkeslett ALLTID med — flere filmer samme dag var
                      // umulige aa skille (Lars 2/8).
                      const tid = new Date(video.created_at).toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit' })
                      const navn = video.metadata?.title || titleByJobId[video.job_id]
                      const title = navn
                        ? `${navn} — ${formatDate(video.created_at)} kl. ${tid}`
                        : `Video – ${formatDate(video.created_at)} kl. ${tid}`
                      return (
                        <div key={video.id} className="border border-gray-200 rounded-lg p-3">
                          <div className="flex items-center gap-2 mb-2">
                            <p className="text-sm font-medium text-gray-800 flex-1">{title}</p>
                            {video.video_format && (
                              <span className="text-xs px-2 py-0.5 rounded-full font-medium shrink-0"
                                style={{
                                  backgroundColor: video.video_format === '9:16' ? '#EDE9FE' : video.video_format === '16:9' ? '#E0F2FE' : '#FEF9C3',
                                  color: video.video_format === '9:16' ? '#6D28D9' : video.video_format === '16:9' ? '#0369A1' : '#854D0E',
                                }}>
                                {video.video_format === '9:16' ? 'Portrett' : video.video_format === '16:9' ? 'Landskap' : 'Kvadrat'}
                              </span>
                            )}
                          </div>
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
                              className="flex-1 text-center text-white px-3 py-2 rounded-lg text-sm font-semibold transition-colors" style={{ backgroundColor: 'var(--ember-deep)' }}
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
                            {/* Tilbake til utkastet som lagde filmen (Lars 2/8:
                                «det kan hende man plutselig ser en detalj man
                                vil forandre»). Aa endre én scene og produsere
                                paa nytt koster nesten ingenting — resten
                                gjenbrukes fra klipp-cachen. */}
                            {(() => {
                              // Knappen skal ALDRI vaere borte naar det finnes et
                              // utkast aa gaa til. Er koblingen sikker, gaar vi
                              // dit; ellers til nyeste utkast — og sier fra at
                              // det er en antakelse (Lars 3/8: fjerde runde).
                              const sikker = draftByJobId[video.job_id]
                              const maal = sikker || nyesteDraftId
                              if (!maal) return null
                              return (
                                <button
                                  onClick={() => router.push(`/dashboard/products/${productId}/video/draft/${maal}`)}
                                  className="flex-1 text-center bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-2 rounded-lg text-sm font-medium transition-colors"
                                  title={sikker
                                    ? 'Åpne utkastet som lagde denne filmen'
                                    : 'Koblingen til akkurat denne filmen mangler — åpner nyeste utkast'}
                                >
                                  {sikker ? 'Rediger' : 'Rediger *'}
                                </button>
                              )
                            })()}
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

          {/* Articles — artist-tjenester lager ikke artikler (Lars 5/8), samme
              vurdering som knappen paa publiseringssiden. Gamle artikler blir
              staaende i basen; de er bare ikke lenger et tema paa artistsiden. */}
          {tenant.vertical !== 'music' && (
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
                              <span className="inline-block px-2 py-0.5 text-xs font-medium rounded capitalize" style={{ backgroundColor: 'var(--ember-tint-bg)', color: 'var(--ember-deep)' }}>
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
                                style={{ backgroundColor: 'var(--ember-deep)' }}
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
          )}
        </div>
      </div>
    </div>
  )
}

