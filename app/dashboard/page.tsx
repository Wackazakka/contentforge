'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from "next/link"
import { useAuth } from "@/lib/authContext"
import { getSupabase } from "@/lib/supabaseClient"
import { useTenant } from '@/lib/tenantContext'
import { useProducts } from "@/lib/useProducts"
import { ProductModal, type CreateProductFormInput } from "@/components/ProductModal"
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

  const tenant = useTenant()
  const { products, loading: productsLoading, createProduct, deleteProduct } = useProducts(organizationId)

  useEffect(() => {
    if (!session?.user?.id) return

    const fetchOrganization = async () => {
      try {
        const supabase = getSupabase()
        // Brukeren kan ha flere organisasjoner (f.eks. sentinel-org for anonyme
        // produksjoner) — velg den som faktisk har produktene, ellers den eldste
        // Kun organisasjoner som hører til DETTE domenets tenant — produkter
        // skal ikke følge brukeren på tvers av white-labels
        let q = supabase
          .from('organizations')
          .select('id, name')
          .eq('owner_id', session.user.id)
        q = tenant.slug === 'centerforge' ? q.or(`tenant_id.eq.${tenant.id},tenant_id.is.null`) : q.eq('tenant_id', tenant.id)
        const { data: orgs, error } = await q.order('created_at', { ascending: true })

        if (error) throw error
        let orgList: Array<{ id: string; name: string }> = orgs || []

        // Selvreparasjon, to tilfeller med samme løsning:
        // (1) Helt fersk konto: registreringens org-insert ble RLS-blokkert
        //     (e-postbekreftelse på → ingen sesjon ved registrering).
        // (2) Konto fra en ANNEN white-label (Lars' funn 2026-07-30): samme
        //     e-post kan ikke registreres på nytt (Supabase-auth deles på
        //     tvers av tenants), så uten dette var «Registrer deg på dette
        //     domenet» en blindvei. Produkter lekker ikke — de filtreres
        //     fortsatt per tenant; brukeren får et tomt arbeidsområde her.
        // Har brukeren ingen organisasjon på DETTE domenets tenant, opprettes
        // den nå (sesjonen finnes, så RLS godtar insert-en).
        if (orgList.length === 0) {
          const fullName = (session.user.user_metadata as any)?.full_name || session.user.email?.split('@')[0] || 'Min'
          const { data: newOrg, error: createErr } = await supabase
            .from('organizations')
            .insert({
              name: fullName + "'s Organization",
              owner_id: session.user.id,
              slug: (session.user.email?.split('@')[0] || 'org').toLowerCase().replace(/[^a-z0-9]/g, '-') + '-' + session.user.id.substring(0, 8) + (tenant.slug !== 'centerforge' ? '-' + tenant.slug : ''),
              description: 'Default organization for ' + fullName,
              ...(/^[0-9a-f-]{36}$/i.test(tenant.id) ? { tenant_id: tenant.id } : {}),
            })
            .select('id, name')
            .single()
          if (createErr) console.error('[Dashboard] Selvreparasjon av org feilet:', createErr.message)
          else if (newOrg) orgList = [newOrg]
        }

        if (orgList.length > 0) {
          let chosen = orgList[0]
          if (orgList.length > 1) {
            const { data: prods } = await supabase
              .from('products')
              .select('id, organization_id')
              .in('organization_id', orgList.map((o) => o.id))
            const counts = new Map<string, number>()
            for (const p of (prods || []) as Array<{ organization_id: string }>) {
              counts.set(p.organization_id, (counts.get(p.organization_id) || 0) + 1)
            }
            chosen = orgList.reduce((best, o) => ((counts.get(o.id) || 0) > (counts.get(best.id) || 0) ? o : best), orgList[0])
          }
          setOrganizationId(chosen.id)
          setOrganizationName(chosen.name)
        }
      } catch (err) {
        console.error('[Dashboard] Fetch organization error:', err)
      } finally {
        setLoadingOrg(false)
      }
    }

    fetchOrganization()
  }, [session?.user?.id])

  const handleCreateProduct = async (input: CreateProductFormInput) => {
    setCreatingProduct(true)
    try {
      // Uten org på DETTE domenet kan ingenting lagres — si det, ikke lukk stille
      if (!organizationId) throw new Error(t('errorNoOrgOnDomain'))
      const created = await createProduct(input)
      if (!created) throw new Error(t('errorCreateFailed'))
      return created
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
        <div style={{ fontFamily: HANKEN, fontSize: 14.5, color: 'var(--text-muted)', marginBottom: 26 }}>
          <span style={{ fontWeight: 700, color: 'var(--ink)' }}>{organizationName}</span>
          {' · '}
          {products.length} {products.length !== 1 ? t('products') : t('product')}
        </div>
      )}

      {/* Header */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'center', justifyContent: 'space-between', marginBottom: 26 }}>
        <h1 style={{ fontFamily: SERIF, fontWeight: 400, fontSize: 'clamp(32px,4vw,42px)', lineHeight: 1, letterSpacing: '-0.01em', color: 'var(--ink)', margin: 0 }}>{t('yourProducts')}</h1>
        {/* Er lista tom, staar den samme oppfordringen i velkomstkortet rett
            under — to like knapper med et par centimeter mellom seg (Lars 3/8).
            Kortets knapp er den tydeligste, saa denne viker til det finnes noe
            aa se paa. */}
        {products.length > 0 && tenant.vertical === 'rights' && (
          <Link href="/dashboard/voice-bank" style={{ fontFamily: HANKEN, fontWeight: 600, fontSize: 14.5, color: 'var(--ember-deep)', textDecoration: 'none', marginLeft: 'auto' }}>
            {t('goToVoiceBank')} →
          </Link>
        )}
        {products.length > 0 && (
          <button
            onClick={() => setShowProductModal(true)}
            className="cf-btn-ink"
            style={{ fontFamily: HANKEN, fontWeight: 700, fontSize: 15, color: 'var(--paper)', background: 'var(--ink)', border: 'none', borderRadius: 999, padding: '12px 22px', cursor: 'pointer', boxShadow: '0 10px 24px -12px color-mix(in srgb, var(--ink) 50%, transparent)' }}
          >
            {t('newProduct')}
          </button>
        )}
      </div>

      {productsLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="cf-spinner" />
        </div>
      ) : products.length === 0 ? (
        <div style={{ background: 'var(--paper-raised)', border: '1px solid var(--ds-border)', borderRadius: 18, padding: 32, boxShadow: '0 1px 2px rgba(70,45,20,0.04)' }}>
          <div style={{ maxWidth: 380, margin: '0 auto', textAlign: 'center' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>🚀</div>
            <h3 style={{ fontFamily: HANKEN, fontWeight: 700, fontSize: 20, color: 'var(--ink)', margin: '0 0 8px' }}>{t('welcomeTitle', { name: tenant.app_name })}</h3>
            <p style={{ fontFamily: HANKEN, fontSize: 14.5, lineHeight: 1.55, color: 'var(--text-muted)', margin: '0 0 26px' }}>{t('welcomeSubtitle')}</p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap', marginBottom: 28 }}>
              <button
                onClick={() => setShowProductModal(true)}
                className="cf-btn-ink"
                style={{ fontFamily: HANKEN, fontWeight: 700, fontSize: 15, color: 'var(--paper)', background: 'var(--ink)', border: 'none', borderRadius: 999, padding: '12px 24px', cursor: 'pointer' }}
              >
                {t('createFirstProduct')}
              </button>
              {/* Rights-vertikalen: velkomstteksten sier «gaa rett til stemmebanken»
                  — da maa lenken finnes. Ingen admin-sjekk her (NavBar-ens fetch
                  dupliseres ikke); API-guarden paa maalsiden svarer uautoriserte
                  med klar melding. */}
              {tenant.vertical === 'rights' && (
                <Link
                  href="/dashboard/voice-bank"
                  style={{ fontFamily: HANKEN, fontWeight: 700, fontSize: 15, color: 'var(--ink)', background: 'transparent', border: '1.5px solid var(--ds-border)', borderRadius: 999, padding: '11px 22px', textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}
                >
                  {t('goToVoiceBank')}
                </Link>
              )}
            </div>
            <div style={{ textAlign: 'left', borderTop: '1px solid var(--ds-border-faint)', paddingTop: 24 }}>
              <p style={{ fontFamily: MONO, fontSize: 11, fontWeight: 500, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--text-faint)', margin: '0 0 16px' }}>{t('howItWorksTitle')}</p>
              {[
                { step: '1', title: t('step1Title'), desc: t('step1Desc') },
                { step: '2', title: t('step2Title'), desc: t('step2Desc') },
                { step: '3', title: t('step3Title'), desc: t('step3Desc', { name: tenant.app_name }) },
              ].map(({ step, title, desc }) => (
                <div key={step} style={{ display: 'flex', gap: 12, marginBottom: 14 }}>
                  <div style={{ width: 24, height: 24, borderRadius: '50%', flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: HANKEN, fontSize: 12, fontWeight: 700, color: 'var(--ember-deep)', background: 'var(--ember-tint-bg)', border: '1px solid var(--ember-tint-border)', marginTop: 2 }}>{step}</div>
                  <div>
                    <p style={{ fontFamily: HANKEN, fontSize: 14, fontWeight: 600, color: 'var(--ink-soft)', margin: 0 }}>{title}</p>
                    <p style={{ fontFamily: HANKEN, fontSize: 13, color: 'var(--text-muted)', margin: '2px 0 0' }}>{desc}</p>
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
                style={{ display: 'block', background: 'var(--paper-raised)', border: '1px solid var(--ds-border)', borderRadius: 18, padding: 26, boxShadow: '0 1px 2px rgba(70,45,20,0.04)', textDecoration: 'none' }}
              >
                <h3 style={{ fontFamily: HANKEN, fontWeight: 700, fontSize: 21, letterSpacing: '-0.01em', color: 'var(--ink)', margin: '0 0 12px', paddingRight: 24, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {product.name}
                </h3>
                {product.category && (
                  <span style={{ display: 'inline-block', fontFamily: HANKEN, fontSize: 12, fontWeight: 600, letterSpacing: '0.02em', color: 'var(--ember-deep)', background: 'var(--ember-tint-bg)', border: '1px solid var(--ember-tint-border)', borderRadius: 999, padding: '3px 11px', marginBottom: 14, textTransform: 'capitalize' }}>
                    {product.category}
                  </span>
                )}
                {product.description && (
                  <p style={{ fontFamily: HANKEN, fontSize: 15, lineHeight: 1.55, color: 'var(--text-muted)', margin: '0 0 18px', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{product.description}</p>
                )}
                <div style={{ fontFamily: MONO, fontSize: 11, letterSpacing: '0.06em', color: 'var(--text-faint)' }}>{t('created', { date: formatDate(product.created_at) })}</div>
              </Link>
              {/* Delete — top-right, only visible on hover */}
              <button
                onClick={() => handleDeleteProduct(product.id)}
                title="Slett produkt"
                className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity w-7 h-7 flex items-center justify-center rounded-md"
                style={{ color: 'var(--text-faint)' }}
                onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--ember-deep)'; e.currentTarget.style.background = '#FBEAE6' }}
                onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-faint)'; e.currentTarget.style.background = 'transparent' }}
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
