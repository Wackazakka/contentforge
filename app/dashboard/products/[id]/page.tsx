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
              onClick={() => router.push(`/dashboard/products/${productId}/video`)}
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
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Bilder</h3>
            <div className="flex flex-col items-center justify-center py-12 text-center text-gray-500">
              <div className="text-4xl mb-2">🖼️</div>
              <p className="text-sm">Ingen bilder opprettet ennå</p>
              <p className="text-xs text-gray-400 mt-2">Bilder du genererer vil vises her</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
