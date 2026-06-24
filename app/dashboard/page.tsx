'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from "next/link"
import { useAuth } from "@/lib/authContext"
import { getSupabase } from "@/lib/supabaseClient"
import { useProducts } from "@/lib/useProducts"
import { ProductModal } from "@/components/ProductModal"
import { useTranslations } from 'next-intl'

const HANKEN = 'var(--font-hanken), sans-serif'
const SERIF = 'var(--font-serif), serif'
const MONO = 'var(--font-cfmono), monospace'

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
        <div style={{ fontFamily: HANKEN, fontSize: 14.5, color: '#6B6358', marginBottom: 26 }}>
          <span style={{ fontWeight: 700, color: '#1C1A16' }}>{organizationName}</span>
          {' · '}
          {products.length} {products.length !== 1 ? t('products') : t('product')}
        </div>
      )}

      {/* Header */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'center', justifyContent: 'space-between', marginBottom: 26 }}>
        <h1 style={{ fontFamily: SERIF, fontWeight: 400, fontSize: 'clamp(32px,4vw,42px)', lineHeight: 1, letterSpacing: '-0.01em', color: '#1C1A16', margin: 0 }}>{t('yourProducts')}</h1>
        <button
          onClick={() => setShowProductModal(true)}
          className="cf-btn-ink"
          style={{ fontFamily: HANKEN, fontWeight: 700, fontSize: 15, color: '#F4EEE2', background: '#1C1A16', border: 'none', borderRadius: 999, padding: '12px 22px', cursor: 'pointer', boxShadow: '0 10px 24px -12px rgba(28,26,22,0.5)' }}
        >
          {t('newProduct')}
        </button>
      </div>

      {productsLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="cf-spinner" />
        </div>
      ) : products.length === 0 ? (
        <div style={{ background: '#FFFDF8', border: '1px solid #E6DDCC', borderRadius: 18, padding: 32, boxShadow: '0 1px 2px rgba(70,45,20,0.04)' }}>
          <div style={{ maxWidth: 380, margin: '0 auto', textAlign: 'center' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>🚀</div>
            <h3 style={{ fontFamily: HANKEN, fontWeight: 700, fontSize: 20, color: '#1C1A16', margin: '0 0 8px' }}>{t('welcomeTitle')}</h3>
            <p style={{ fontFamily: HANKEN, fontSize: 14.5, lineHeight: 1.55, color: '#6B6358', margin: '0 0 26px' }}>{t('welcomeSubtitle')}</p>
            <button
              onClick={() => setShowProductModal(true)}
              className="cf-btn-ink"
              style={{ fontFamily: HANKEN, fontWeight: 700, fontSize: 15, color: '#F4EEE2', background: '#1C1A16', border: 'none', borderRadius: 999, padding: '12px 24px', cursor: 'pointer', marginBottom: 28 }}
            >
              {t('createFirstProduct')}
            </button>
            <div style={{ textAlign: 'left', borderTop: '1px solid #EFE7D8', paddingTop: 24 }}>
              <p style={{ fontFamily: MONO, fontSize: 11, fontWeight: 500, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#A89C88', margin: '0 0 16px' }}>{t('howItWorksTitle')}</p>
              {[
                { step: '1', title: t('step1Title'), desc: t('step1Desc') },
                { step: '2', title: t('step2Title'), desc: t('step2Desc') },
                { step: '3', title: t('step3Title'), desc: t('step3Desc') },
              ].map(({ step, title, desc }) => (
                <div key={step} style={{ display: 'flex', gap: 12, marginBottom: 14 }}>
                  <div style={{ width: 24, height: 24, borderRadius: '50%', flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: HANKEN, fontSize: 12, fontWeight: 700, color: '#C5451B', background: '#F8E7DB', border: '1px solid #EBC9B2', marginTop: 2 }}>{step}</div>
                  <div>
                    <p style={{ fontFamily: HANKEN, fontSize: 14, fontWeight: 600, color: '#3A352C', margin: 0 }}>{title}</p>
                    <p style={{ fontFamily: HANKEN, fontSize: 13, color: '#6B6358', margin: '2px 0 0' }}>{desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(320px,1fr))', gap: 18 }}>
          {products.map((product) => (
            <div key={product.id} className="group" style={{ position: 'relative' }}>
              <Link
                href={`/dashboard/products/${product.id}`}
                className="cf-card"
                style={{ display: 'block', background: '#FFFDF8', border: '1px solid #E6DDCC', borderRadius: 18, padding: 26, boxShadow: '0 1px 2px rgba(70,45,20,0.04)', textDecoration: 'none' }}
              >
                <h3 style={{ fontFamily: HANKEN, fontWeight: 700, fontSize: 21, letterSpacing: '-0.01em', color: '#1C1A16', margin: '0 0 12px', paddingRight: 24, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {product.name}
                </h3>
                {product.category && (
                  <span style={{ display: 'inline-block', fontFamily: HANKEN, fontSize: 12, fontWeight: 600, letterSpacing: '0.02em', color: '#C5451B', background: '#F8E7DB', border: '1px solid #EBC9B2', borderRadius: 999, padding: '3px 11px', marginBottom: 14, textTransform: 'capitalize' }}>
                    {product.category}
                  </span>
                )}
                {product.description && (
                  <p style={{ fontFamily: HANKEN, fontSize: 15, lineHeight: 1.55, color: '#6B6358', margin: '0 0 18px', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{product.description}</p>
                )}
                <div style={{ fontFamily: MONO, fontSize: 11, letterSpacing: '0.06em', color: '#A89C88' }}>{t('created', { date: formatDate(product.created_at) })}</div>
              </Link>
              {/* Delete — top-right, only visible on hover */}
              <button
                onClick={() => handleDeleteProduct(product.id)}
                title="Slett produkt"
                className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity w-7 h-7 flex items-center justify-center rounded-md"
                style={{ color: '#A89C88' }}
                onMouseEnter={(e) => { e.currentTarget.style.color = '#C5451B'; e.currentTarget.style.background = '#FBEAE6' }}
                onMouseLeave={(e) => { e.currentTarget.style.color = '#A89C88'; e.currentTarget.style.background = 'transparent' }}
              >
                <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
                  <path d="M1 3h12M5 3V2h4v1M2 3l1 9h8l1-9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </div>
          ))}
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
