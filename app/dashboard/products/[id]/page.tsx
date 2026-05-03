'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/lib/authContext'
import { getSupabase } from '@/lib/supabaseClient'

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
  brand_guidelines: Record<string, any> | null
}

interface ProductionJob {
  id: string
  product_id: string
  created_by: string
  title: string
  description: string | null
  status: 'draft' | 'queued' | 'generating' | 'rendering' | 'done' | 'failed'
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
  return new Date(iso).toLocaleDateString('nb-NO', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

export default function ProductPage() {
  const router = useRouter()
  const params = useParams()
  const { session } = useAuth()
  const productId = params.id as string

  const [product, setProduct] = useState<Product | null>(null)
  const [profile, setProfile] = useState<ProductProfile | null>(null)
  const [jobs, setJobs] = useState<ProductionJob[]>([])
  const [jobsLoading, setJobsLoading] = useState(false)
  const [assets, setAssets] = useState<AssetBank[]>([])
  const [assetsLoading, setAssetsLoading] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Fetch product data
  useEffect(() => {
    if (!productId || !session?.user?.id) return

    const fetchProduct = async () => {
      try {
        const supabase = getSupabase()

        // Fetch product
        const { data: productData, error: productError } = await supabase
          .from('products')
          .select('*')
          .eq('id', productId)
          .single()

        if (productError) throw productError
        if (!productData) {
          setError('Produktet ble ikke funnet')
          return
        }

        setProduct(productData)

        // Fetch product profile
        const { data: profileData } = await supabase
          .from('product_profiles')
          .select('*')
          .eq('product_id', productId)
          .single()

        if (profileData) {
          setProfile(profileData)
        }
      } catch (err) {
        console.error('[ProductPage] Fetch error:', err)
        setError(err instanceof Error ? err.message : 'Feil ved henting av produkt')
      } finally {
        setLoading(false)
      }
    }

    fetchProduct()
  }, [productId, session?.user?.id])

  // Fetch production jobs and poll every 5 seconds
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

    // Initial fetch
    fetchJobs()

    // Poll every 5 seconds for status updates
    const interval = setInterval(fetchJobs, 5000)

    return () => clearInterval(interval)
  }, [productId, session?.user?.id])

  // Fetch asset bank images
  useEffect(() => {
    if (!productId) return

    const fetchAssets = async () => {
      try {
        setAssetsLoading(true)
        const supabase = getSupabase()

        const { data: assetsData, error: assetsError } = await supabase
          .from('asset_banks')
          .select('*')
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

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-600">Laster produkt...</div>
      </div>
    )
  }

  if (error || !product) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-6xl mx-auto px-6 py-8">
          <Link href="/dashboard" className="text-blue-600 hover:text-blue-700 mb-4 inline-block">
            ← Tilbake til dashboard
          </Link>
          <div className="text-center py-12">
            <p className="text-red-600 text-lg">{error || 'Produktet ble ikke funnet'}</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-6 py-6 flex items-center justify-between">
          <div>
            <Link href="/dashboard" className="text-blue-600 hover:text-blue-700 text-sm font-medium mb-2 inline-block">
              ← Tilbake til dashboard
            </Link>
            <h1 className="text-3xl font-bold text-gray-900">{product.name}</h1>
            {product.description && (
              <p className="text-gray-600 mt-2">{product.description}</p>
            )}
          </div>
          {profile?.logo_url && (
            <img
              src={profile.logo_url}
              alt={product.name}
              className="w-24 h-24 rounded-lg object-cover"
            />
          )}
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-8">
        {/* Product Info */}
        <div className="bg-white rounded-lg border border-gray-200 p-6 mb-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Produktinformasjon</h2>
          <div className="grid grid-cols-2 gap-6">
            <div>
              <label className="text-sm font-medium text-gray-700">Type</label>
              <p className="text-gray-900 capitalize mt-1">{product.category || 'Ikke angitt'}</p>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700">Opprettet</label>
              <p className="text-gray-900 mt-1">{formatDate(product.created_at)}</p>
            </div>
          </div>

          {profile && (
            <div className="mt-6 pt-6 border-t border-gray-200">
              <h3 className="text-md font-semibold text-gray-900 mb-4">Merkevareprofil</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {profile.primary_color && (
                  <div>
                    <label className="text-xs font-medium text-gray-700">Primærfarge</label>
                    <div className="mt-2 flex items-center gap-2">
                      <div
                        className="w-12 h-12 rounded-lg border border-gray-300"
                        style={{ backgroundColor: profile.primary_color }}
                      />
                      <p className="text-sm text-gray-900">{profile.primary_color}</p>
                    </div>
                  </div>
                )}
                {profile.secondary_color && (
                  <div>
                    <label className="text-xs font-medium text-gray-700">Sekundærfarge</label>
                    <div className="mt-2 flex items-center gap-2">
                      <div
                        className="w-12 h-12 rounded-lg border border-gray-300"
                        style={{ backgroundColor: profile.secondary_color }}
                      />
                      <p className="text-sm text-gray-900">{profile.secondary_color}</p>
                    </div>
                  </div>
                )}
                {profile.font_family && (
                  <div>
                    <label className="text-xs font-medium text-gray-700">Font</label>
                    <p className="text-sm text-gray-900 mt-2">{profile.font_family}</p>
                  </div>
                )}
                {profile.brand_voice && (
                  <div>
                    <label className="text-xs font-medium text-gray-700">Brand Voice</label>
                    <p className="text-sm text-gray-900 mt-2 capitalize">{profile.brand_voice}</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Content Production */}
        <div className="bg-white rounded-lg border border-gray-200 p-6 mb-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Innholdsproduksjon</h2>
          <div className="grid md:grid-cols-2 gap-4">
            <button
              onClick={() => router.push(`/dashboard/new?productId=${productId}`)}
              className="p-6 border-2 border-gray-200 rounded-lg hover:border-blue-500 hover:bg-blue-50 transition-all text-left"
            >
              <div className="text-2xl mb-2">🎬</div>
              <h3 className="font-semibold text-gray-900">Lag video</h3>
              <p className="text-sm text-gray-600 mt-1">Generer AI-drevet videoinnhold</p>
            </button>

            <button
              onClick={() => router.push(`/dashboard/products/${productId}/article`)}
              className="p-6 border-2 border-gray-200 rounded-lg hover:border-green-500 hover:bg-green-50 transition-all text-left"
            >
              <div className="text-2xl mb-2">📝</div>
              <h3 className="font-semibold text-gray-900">Lag artikkel</h3>
              <p className="text-sm text-gray-600 mt-1">Generer AI-drevet artikkelinnhold</p>
            </button>
          </div>
        </div>

        {/* Pågående produksjonsjobber */}
        {jobs.length > 0 && (
          <div className="bg-white rounded-lg border border-gray-200 p-6 mb-8">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              Pågående produksjonsjobber {jobsLoading && <span className="text-sm text-gray-500">(oppdateres...)</span>}
            </h2>
            <div className="space-y-3">
              {jobs
                .filter(
                  (job) =>
                    job.status === 'queued' || job.status === 'generating' || job.status === 'rendering'
                )
                .map((job) => (
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
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <h3 className="font-semibold text-gray-900">{job.title}</h3>
                        <p className="text-sm text-gray-600 mt-1">{job.description}</p>
                        <div className="mt-2 flex items-center gap-4 text-xs">
                          <span className="text-gray-500">
                            Status:{' '}
                            <span className="font-semibold">
                              {job.status === 'queued'
                                ? '⏳ Venter'
                                : job.status === 'generating'
                                ? '⚙️ Genererer innhold'
                                : '🎬 Rendrer video'}
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
                    </div>
                  </div>
                ))}
              {jobs.filter(
                (job) => job.status === 'queued' || job.status === 'generating' || job.status === 'rendering'
              ).length === 0 && (
                <p className="text-gray-500 text-center py-4">Ingen aktive jobber</p>
              )}
            </div>
          </div>
        )}

        {/* Ferdigstilte videoer */}
        {jobs.filter((job) => job.status === 'done').length > 0 && (
          <div className="bg-white rounded-lg border border-gray-200 p-6 mb-8">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              Ferdigstilte videoer ({jobs.filter((job) => job.status === 'done').length})
            </h2>
            <div className="grid gap-4 md:grid-cols-2">
              {jobs
                .filter((job) => job.status === 'done')
                .map((job) => {
                  const videoUrl =
                    (job.ai_parameters as any)?.video_url ||
                    `http://139.59.212.218:3002/videos/${job.id}/output.mp4`
                  return (
                    <div
                      key={job.id}
                      className="p-4 rounded-lg border border-green-200 bg-green-50 hover:shadow-md transition-shadow"
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex-1">
                          <h3 className="font-semibold text-gray-900">{job.title}</h3>
                          <p className="text-xs text-gray-500 mt-1">✅ Ferdigstilt</p>
                        </div>
                      </div>

                      {/* Video preview */}
                      <video
                        src={videoUrl}
                        controls
                        className="w-full rounded-lg mb-3 bg-black"
                        style={{ aspectRatio: '9/16', maxHeight: '300px' }}
                      />

                      {/* Download link */}
                      <a
                        href={videoUrl}
                        download={`${job.title.replace(/\s+/g, '_')}.mp4`}
                        className="inline-block px-4 py-2 bg-green-600 text-white text-sm font-semibold rounded-lg hover:bg-green-700 transition-colors"
                      >
                        ⬇️ Last ned video
                      </a>
                    </div>
                  )
                })}
            </div>
          </div>
        )}

        {/* Content Banks */}
        <div className="grid md:grid-cols-3 gap-6">
          {/* Videos */}
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Videoer</h3>
            <div className="flex flex-col items-center justify-center py-12 text-center text-gray-500">
              <div className="text-4xl mb-2">🎥</div>
              <p className="text-sm">Ingen videoer opprettet ennå</p>
              <p className="text-xs text-gray-400 mt-2">Videoer du genererer vil vises her</p>
            </div>
          </div>

          {/* Articles */}
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Artikler</h3>
            <div className="flex flex-col items-center justify-center py-12 text-center text-gray-500">
              <div className="text-4xl mb-2">📰</div>
              <p className="text-sm">Ingen artikler opprettet ennå</p>
              <p className="text-xs text-gray-400 mt-2">Artikler du genererer vil vises her</p>
            </div>
          </div>

          {/* Images */}
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Bilder ({assets.length})</h3>
            {assetsLoading ? (
              <div className="text-center py-8 text-gray-500">Laster bilder...</div>
            ) : assets.length > 0 ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                {assets.map((asset) => (
                  <div key={asset.id} className="group relative bg-gray-100 rounded-lg overflow-hidden aspect-square">
                    <img
                      src={asset.asset_url}
                      alt="Generated image"
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-40 transition-all flex items-center justify-center opacity-0 group-hover:opacity-100">
                      <button
                        className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium"
                        onClick={() => {
                          // TODO: Use in production
                          alert('Funksjon kommer snart!')
                        }}
                      >
                        Bruk i produksjon
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-center text-gray-500">
                <div className="text-4xl mb-2">🖼️</div>
                <p className="text-sm">Ingen bilder opprettet ennå</p>
                <p className="text-xs text-gray-400 mt-2">Bilder du genererer vil vises her</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
