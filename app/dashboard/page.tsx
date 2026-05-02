'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from "next/link"
import { useAuth } from "@/lib/authContext"
import { getSupabase } from "@/lib/supabaseClient"
import { useProducts } from "@/lib/useProducts"
import { ProductModal } from "@/components/ProductModal"
import { DEMO_CAMPAIGNS, STATUS_LABELS, STATUS_COLORS } from "@/lib/campaigns"

export type HistoryEntry = {
  jobId: string
  campaignId: string
  service: string
  status: "pending" | "processing" | "done" | "failed"
  downloadUrl: string | null
  createdAt: string
  completedAt: string | null
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("nb-NO", {
    day: "numeric",
    month: "short",
    year: "numeric",
  })
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("nb-NO", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

const HISTORY_STATUS_LABEL: Record<HistoryEntry["status"], string> = {
  pending: "Venter",
  processing: "Produserer...",
  done: "Fullført",
  failed: "Feil",
}

const HISTORY_STATUS_COLOR: Record<HistoryEntry["status"], string> = {
  pending: "text-gray-600 bg-gray-100",
  processing: "text-yellow-700 bg-yellow-100",
  done: "text-green-700 bg-green-100",
  failed: "text-red-700 bg-red-100",
}

export default function DashboardPage() {
  const router = useRouter()
  const { session, signOut } = useAuth()
  const [organizationId, setOrganizationId] = useState<string | null>(null)
  const [organizationName, setOrganizationName] = useState<string>('')
  const [loadingOrg, setLoadingOrg] = useState(true)
  const [showProductModal, setShowProductModal] = useState(false)
  const [creatingProduct, setCreatingProduct] = useState(false)

  const campaigns = DEMO_CAMPAIGNS
  const history: HistoryEntry[] = []
  const { products, loading: productsLoading, createProduct, deleteProduct } = useProducts(organizationId)

  const completedHistory = history.filter((e) => e.status === "done").length
  const processingHistory = history.filter(
    (e) => e.status === "processing" || e.status === "pending"
  ).length

  // Fetch organization for current user
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

  const handleLogout = async () => {
    await signOut()
    router.push('/login')
  }

  const handleCreateProduct = async (name: string, description: string, category: string) => {
    setCreatingProduct(true)
    try {
      await createProduct({ name, description, category })
    } finally {
      setCreatingProduct(false)
    }
  }

  const handleDeleteProduct = async (productId: string) => {
    if (confirm('Er du sikker på at du vil slette dette produktet?')) {
      await deleteProduct(productId)
    }
  }

  if (loadingOrg) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-600">Laster...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top nav with user info */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">ContentForge</h1>
            {session?.user?.email && (
              <p className="text-gray-500 text-sm mt-1">Logget inn som {session.user.email}</p>
            )}
          </div>
          <button
            onClick={handleLogout}
            className="rounded-lg border border-gray-200 hover:border-red-200 hover:bg-red-50 text-gray-700 hover:text-red-700 text-sm font-medium px-4 py-2 transition-colors"
          >
            Logg ut
          </button>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-8">
        {/* Organization info */}
        {organizationName && (
          <div className="mb-8 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <h2 className="text-lg font-semibold text-blue-900">Organisasjon: {organizationName}</h2>
            <p className="text-sm text-blue-700 mt-1">{products.length} produkt{products.length !== 1 ? 'er' : ''}</p>
          </div>
        )}

        {/* Products Section */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-gray-900">Dine produkter</h2>
            <button
              onClick={() => setShowProductModal(true)}
              className="rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-4 py-2 transition-colors"
            >
              + Nytt produkt
            </button>
          </div>

          {productsLoading ? (
            <div className="text-center text-gray-600">Laster produkter...</div>
          ) : products.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-gray-600 mb-4">Ingen produkter opprettet ennå</p>
              <button
                onClick={() => setShowProductModal(true)}
                className="inline-block rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-4 py-2 transition-colors"
              >
                Opprett første produkt
              </button>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {products.map((product) => (
                <Link
                  key={product.id}
                  href={`/dashboard/products/${product.id}`}
                  className="bg-white rounded-lg border border-gray-200 p-4 hover:shadow-md hover:border-blue-300 transition-all cursor-pointer group"
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1">
                      <h3 className="font-semibold text-gray-900 group-hover:text-blue-600 transition-colors">{product.name}</h3>
                      {product.category && (
                        <p className="text-xs text-gray-500 mt-1 capitalize">{product.category}</p>
                      )}
                    </div>
                    <button
                      onClick={(e) => {
                        e.preventDefault()
                        handleDeleteProduct(product.id)
                      }}
                      className="text-red-600 hover:text-red-700 text-sm font-medium"
                    >
                      Slett
                    </button>
                  </div>
                  {product.description && (
                    <p className="text-sm text-gray-600 mb-3">{product.description}</p>
                  )}
                  <p className="text-xs text-gray-400">Opprettet {formatDate(product.created_at)}</p>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Campaigns Section (legacy) */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-xl font-bold text-gray-900">Kampanjer</h2>
              <p className="text-gray-500 text-sm mt-1">
                {campaigns.length} kampanje{campaigns.length !== 1 ? "r" : ""}
              </p>
            </div>
            <Link
              href="/dashboard/new"
              className="rounded-lg bg-green-600 hover:bg-green-500 text-white text-sm font-semibold px-4 py-2 transition-colors"
            >
              + Ny kampanje
            </Link>
          </div>

          {campaigns.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              Ingen kampanjer opprettet ennå
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {campaigns.map((campaign) => (
                <div key={campaign.id} className="bg-white rounded-lg border border-gray-200 p-4">
                  <h3 className="font-semibold text-gray-900 mb-2">{campaign.name}</h3>
                  <p className="text-sm text-gray-600 mb-3">{campaign.bodyCopy}</p>
                  <Link
                    href={`/dashboard/${campaign.id}`}
                    className="text-blue-600 hover:text-blue-700 text-sm font-medium"
                  >
                    Åpne →
                  </Link>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Product Modal */}
      <ProductModal
        isOpen={showProductModal}
        onClose={() => setShowProductModal(false)}
        onSubmit={handleCreateProduct}
        isLoading={creatingProduct}
      />
    </div>
  )
}
