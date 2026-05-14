'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from "next/link"
import { useAuth } from "@/lib/authContext"
import { getSupabase } from "@/lib/supabaseClient"
import { useProducts } from "@/lib/useProducts"
import { ProductModal } from "@/components/ProductModal"
import { useTranslations } from 'next-intl'

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  })
}

export default function DashboardPage() {
  const router = useRouter()
  const { session } = useAuth()
  const t = useTranslations('dashboard')
  const [organizationId, setOrganizationId] = useState<string | null>(null)
  const [organizationName, setOrganizationName] = useState<string>('')
  const [loadingOrg, setLoadingOrg] = useState(true)
  const [showProductModal, setShowProductModal] = useState(false)
  const [creatingProduct, setCreatingProduct] = useState(false)

  const { products, loading: productsLoading, createProduct, deleteProduct } = useProducts(organizationId)

  useEffect(() => {
    if (!session?.user?.id) return

    const fetchOrganization = async () => {
      try {
        const supabase = getSupabase()
        const { data, error } = await supabase
          .from('organizations')
          .select('id, name')
          .eq('owner_id', session.user.id)
          .single()

        if (error) throw error
        if (data) {
          setOrganizationId(data.id)
          setOrganizationName(data.name)
        }
      } catch (err) {
        console.error('[Dashboard] Fetch organization error:', err)
      } finally {
        setLoadingOrg(false)
      }
    }

    fetchOrganization()
  }, [session?.user?.id])

  const handleCreateProduct = async (name: string, description: string, category: string) => {
    setCreatingProduct(true)
    try {
      await createProduct({ name, description, category })
    } finally {
      setCreatingProduct(false)
    }
  }

  const handleDeleteProduct = async (productId: string) => {
    if (confirm(t('deleteConfirm'))) {
      await deleteProduct(productId)
    }
  }

  if (loadingOrg) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="cf-spinner" />
      </div>
    )
  }

  return (
    <div>
      {organizationName && (
        <div className="mb-5 flex items-center justify-between">
          <p className="text-sm font-medium" style={{ color: '#6b7280' }}>
            <span style={{ color: '#2C2C2A', fontWeight: 600 }}>{organizationName}</span>
            {' · '}
            {products.length} {products.length !== 1 ? t('products') : t('product')}
          </p>
        </div>
      )}

      {/* Products */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-gray-900">{t('yourProducts')}</h2>
          <button
            onClick={() => setShowProductModal(true)}
            className="rounded-lg text-white text-sm font-semibold px-3 py-2 transition-colors"
            style={{ backgroundColor: '#185FA5' }}
          >
            {t('newProduct')}
          </button>
        </div>

        {productsLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="cf-spinner" />
          </div>
        ) : products.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-8">
            <div className="max-w-sm mx-auto text-center">
              <div className="text-4xl mb-4">🚀</div>
              <h3 className="text-lg font-bold text-gray-900 mb-2">{t('welcomeTitle')}</h3>
              <p className="text-sm text-gray-500 mb-8">
                {t('welcomeSubtitle')}
              </p>
              <button
                onClick={() => setShowProductModal(true)}
                className="rounded-lg text-white text-sm font-semibold px-5 py-2.5 transition-colors mb-8"
                style={{ backgroundColor: '#185FA5' }}
              >
                {t('createFirstProduct')}
              </button>
              <div className="text-left space-y-4 border-t border-gray-100 pt-6">
                <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-3">{t('howItWorksTitle')}</p>
                {[
                  { step: '1', title: t('step1Title'), desc: t('step1Desc') },
                  { step: '2', title: t('step2Title'), desc: t('step2Desc') },
                  { step: '3', title: t('step3Title'), desc: t('step3Desc') },
                ].map(({ step, title, desc }) => (
                  <div key={step} className="flex gap-3">
                    <div
                      className="w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-bold text-white mt-0.5"
                      style={{ backgroundColor: '#185FA5' }}
                    >
                      {step}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-gray-800">{title}</p>
                      <p className="text-xs text-gray-500">{desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {products.map((product) => (
              <div key={product.id} className="relative group">
                <Link
                  href={`/dashboard/products/${product.id}`}
                  className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md hover:border-blue-200 transition-all block"
                >
                  <h3 className="font-semibold text-gray-900 group-hover:text-blue-700 transition-colors truncate pr-6">
                    {product.name}
                  </h3>
                  {product.category && (
                    <span
                      className="inline-block mt-1 text-xs px-2 py-0.5 rounded-full capitalize"
                      style={{ backgroundColor: '#EBF4FF', color: '#185FA5' }}
                    >
                      {product.category}
                    </span>
                  )}
                  {product.description && (
                    <p className="text-sm text-gray-500 mt-2 mb-3 line-clamp-2 leading-relaxed">{product.description}</p>
                  )}
                  <p className="text-xs text-gray-400 mt-3">{t('created', { date: formatDate(product.created_at) })}</p>
                </Link>
                {/* Delete — top-right, only visible on hover */}
                <button
                  onClick={() => handleDeleteProduct(product.id)}
                  title="Slett produkt"
                  className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity w-7 h-7 flex items-center justify-center rounded-md text-gray-400 hover:text-red-500 hover:bg-red-50"
                >
                  <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
                    <path d="M1 3h12M5 3V2h4v1M2 3l1 9h8l1-9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <ProductModal
        isOpen={showProductModal}
        onClose={() => setShowProductModal(false)}
        onSubmit={handleCreateProduct}
        isLoading={creatingProduct}
      />
    </div>
  )
}
