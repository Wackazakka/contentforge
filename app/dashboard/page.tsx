'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from "next/link"
import { useAuth } from "@/lib/authContext"
import { getSupabase } from "@/lib/supabaseClient"
import { useProducts } from "@/lib/useProducts"
import { ProductModal } from "@/components/ProductModal"
import { DEMO_CAMPAIGNS } from "@/lib/campaigns"

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
  const [organizationId, setOrganizationId] = useState<string | null>(null)
  const [organizationName, setOrganizationName] = useState<string>('')
  const [loadingOrg, setLoadingOrg] = useState(true)
  const [showProductModal, setShowProductModal] = useState(false)
  const [creatingProduct, setCreatingProduct] = useState(false)

  const campaigns = DEMO_CAMPAIGNS
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
    if (confirm('Are you sure you want to delete this product?')) {
      await deleteProduct(productId)
    }
  }

  if (loadingOrg) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="text-gray-500">Loading...</div>
      </div>
    )
  }

  return (
    <div>
      {organizationName && (
        <div className="mb-6 p-4 rounded-xl border" style={{ backgroundColor: '#EBF4FF', borderColor: '#378ADD' }}>
          <p className="text-sm font-medium" style={{ color: '#185FA5' }}>
            {organizationName} · {products.length} product{products.length !== 1 ? 's' : ''}
          </p>
        </div>
      )}

      {/* Products */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-gray-900">Your products</h2>
          <button
            onClick={() => setShowProductModal(true)}
            className="rounded-lg text-white text-sm font-semibold px-3 py-2 transition-colors"
            style={{ backgroundColor: '#185FA5' }}
          >
            + New product
          </button>
        </div>

        {productsLoading ? (
          <div className="text-center text-gray-500 py-8">Loading products...</div>
        ) : products.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-xl border border-gray-200">
            <p className="text-gray-500 mb-4">No products created yet</p>
            <button
              onClick={() => setShowProductModal(true)}
              className="rounded-lg text-white text-sm font-semibold px-4 py-2 transition-colors"
              style={{ backgroundColor: '#185FA5' }}
            >
              Create first product
            </button>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {products.map((product) => (
              <Link
                key={product.id}
                href={`/dashboard/products/${product.id}`}
                className="bg-white rounded-xl border border-gray-200 p-4 hover:shadow-md hover:border-blue-300 transition-all group"
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-gray-900 group-hover:text-blue-600 transition-colors truncate">
                      {product.name}
                    </h3>
                    {product.category && (
                      <p className="text-xs text-gray-500 mt-0.5 capitalize">{product.category}</p>
                    )}
                  </div>
                  <button
                    onClick={(e) => { e.preventDefault(); handleDeleteProduct(product.id) }}
                    className="text-gray-300 hover:text-red-500 text-sm ml-2 transition-colors flex-shrink-0"
                  >
                    🗑
                  </button>
                </div>
                {product.description && (
                  <p className="text-sm text-gray-500 mb-3 line-clamp-2">{product.description}</p>
                )}
                <p className="text-xs text-gray-400">Created {formatDate(product.created_at)}</p>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Campaigns (legacy) */}
      {campaigns.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-gray-900">Campaigns</h2>
            <Link
              href="/dashboard/new"
              className="rounded-lg bg-gray-700 hover:bg-gray-800 text-white text-sm font-semibold px-3 py-2 transition-colors"
            >
              + New campaign
            </Link>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {campaigns.map((campaign) => (
              <div key={campaign.id} className="bg-white rounded-xl border border-gray-200 p-4">
                <h3 className="font-semibold text-gray-900 mb-2">{campaign.name}</h3>
                <p className="text-sm text-gray-500 mb-3 line-clamp-2">{campaign.bodyCopy}</p>
                <Link href={`/dashboard/${campaign.id}`} className="text-sm font-medium" style={{ color: '#185FA5' }}>
                  Open →
                </Link>
              </div>
            ))}
          </div>
        </div>
      )}

      <ProductModal
        isOpen={showProductModal}
        onClose={() => setShowProductModal(false)}
        onSubmit={handleCreateProduct}
        isLoading={creatingProduct}
      />
    </div>
  )
}
