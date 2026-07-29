'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { useTenant } from '@/lib/tenantContext'
import { verticalConfig } from '@/lib/verticals'

const HANKEN = 'var(--font-hanken), sans-serif'
const SERIF = 'var(--font-serif), serif'

interface ProductModalProps {
  isOpen: boolean
  onClose: () => void
  onSubmit: (name: string, description: string, category: string, serviceArea?: string) => Promise<void>
  isLoading?: boolean
}

const labelStyle = { display: 'block', fontFamily: HANKEN, fontSize: 14, fontWeight: 600, color: '#3A352C', marginBottom: 8 } as const

export function ProductModal({ isOpen, onClose, onSubmit, isLoading = false }: ProductModalProps) {
  const t = useTranslations('productModal')
  const tenant = useTenant()
  const vcfg = verticalConfig(tenant.vertical) // vertikal (f.eks. håndverker) = egne kategorier + Område-felt
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState(vcfg ? vcfg.categoryOptions[0].value : 'product')
  const [serviceArea, setServiceArea] = useState('')
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!name.trim()) {
      setError(t('errorNameRequired'))
      return
    }

    try {
      await onSubmit(name, description, category, serviceArea.trim() || undefined)
      // Reset form
      setName('')
      setDescription('')
      setCategory(vcfg ? vcfg.categoryOptions[0].value : 'product')
      setServiceArea('')
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errorCreating'))
    }
  }

  if (!isOpen) return null

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 100,
        background: 'rgba(28,26,22,0.45)', backdropFilter: 'blur(2px)', WebkitBackdropFilter: 'blur(2px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
      }}
      onClick={onClose}
    >
      <div
        className="cf-anim-modal"
        onClick={(e) => e.stopPropagation()}
        style={{ width: '100%', maxWidth: 520, background: '#FFFDF8', border: '1px solid #E6DDCC', borderRadius: 20, padding: 32, boxShadow: '0 40px 80px -30px rgba(40,25,10,0.5)' }}
      >
        <h2 style={{ fontFamily: SERIF, fontWeight: 400, fontSize: 32, lineHeight: 1, color: '#1C1A16', margin: '0 0 22px' }}>{t('title')}</h2>

        {error && (
          <div style={{ background: '#FBEAE6', border: '1px solid #F0C4B8', borderRadius: 11, padding: '13px 16px', fontFamily: HANKEN, fontSize: 14.5, fontWeight: 600, color: 'var(--ember-deep)', marginBottom: 20 }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <label style={labelStyle}>{t('productNameLabel')}</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={isLoading}
            className="cf-input"
            style={{ marginBottom: 20 }}
            placeholder={t('productNamePlaceholder')}
          />

          <label style={labelStyle}>{t('descriptionLabel')}</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            disabled={isLoading}
            className="cf-input"
            style={{ marginBottom: vcfg ? 8 : 20, resize: 'vertical' }}
            rows={3}
            placeholder={t('descriptionPlaceholder')}
          />
          {vcfg && (
            <p style={{ fontFamily: HANKEN, fontSize: 13, color: '#8C8272', margin: '0 0 20px' }}>{t('descriptionHint')}</p>
          )}

          <label style={labelStyle}>{t('categoryLabel')}</label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            disabled={isLoading}
            className="cf-input"
            style={{ marginBottom: vcfg?.serviceAreaField ? 20 : 28, cursor: 'pointer' }}
          >
            {vcfg ? (
              vcfg.categoryOptions.map((o) => (
                <option key={o.value} value={o.value}>{t(o.labelKey)}</option>
              ))
            ) : (
              <>
                <option value="product">{t('categoryProduct')}</option>
                <option value="brand">{t('categoryBrand')}</option>
                <option value="service">{t('categoryService')}</option>
              </>
            )}
          </select>

          {vcfg?.serviceAreaField && (
            <>
              <label style={labelStyle}>{t('serviceAreaLabel')}</label>
              <input
                type="text"
                value={serviceArea}
                onChange={(e) => setServiceArea(e.target.value)}
                disabled={isLoading}
                className="cf-input"
                style={{ marginBottom: 28 }}
                placeholder={t('serviceAreaPlaceholder')}
              />
            </>
          )}

          <div style={{ display: 'flex', gap: 12 }}>
            <button
              type="button"
              onClick={onClose}
              disabled={isLoading}
              className="cf-btn-ghost"
              style={{ flex: 1, fontFamily: HANKEN, fontWeight: 600, fontSize: 15, color: '#1C1A16', background: 'transparent', border: '1px solid #D2C7B2', borderRadius: 11, padding: 13, cursor: isLoading ? 'not-allowed' : 'pointer', opacity: isLoading ? 0.5 : 1 }}
            >
              {t('cancel')}
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="cf-btn-ink"
              style={{ flex: 1.4, fontFamily: HANKEN, fontWeight: 700, fontSize: 15, color: '#F4EEE2', background: '#1C1A16', border: 'none', borderRadius: 11, padding: 13, cursor: isLoading ? 'not-allowed' : 'pointer', opacity: isLoading ? 0.7 : 1 }}
            >
              {isLoading ? t('creating') : t('createProduct')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
