'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslations } from 'next-intl'
import { useTenant } from '@/lib/tenantContext'
import { verticalConfig } from '@/lib/verticals'
import { normalizeUrl, normalizePhone } from '@/lib/validate'
import { getSupabase } from '@/lib/supabaseClient'

const HANKEN = 'var(--font-hanken), sans-serif'
const SERIF = 'var(--font-serif), serif'

export interface CreateProductFormInput {
  name: string
  description: string
  category: string
  serviceArea?: string
  websiteUrl?: string
  phone?: string
  address?: string
}

interface ProductModalProps {
  isOpen: boolean
  onClose: () => void
  // Returnerer det opprettede produktet så logo-fasen kan kjøre mot id-en
  onSubmit: (input: CreateProductFormInput) => Promise<{ id: string } | null>
  isLoading?: boolean
}

const labelStyle = { display: 'block', fontFamily: HANKEN, fontSize: 14, fontWeight: 600, color: 'var(--ink-soft)', marginBottom: 8 } as const

export function ProductModal({ isOpen, onClose, onSubmit, isLoading = false }: ProductModalProps) {
  const t = useTranslations('productModal')
  const tenant = useTenant()
  const vcfg = verticalConfig(tenant.vertical) // vertikal (f.eks. håndverker) = egne kategorier + Område-felt
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState(vcfg ? vcfg.categoryOptions[0].value : 'product')
  // «Annet»-valget åpner fritekst: det brukeren skriver LAGRES som kategorien
  // (products.category), så prompt-konteksten får «Genre: shoegaze» i stedet
  // for «Genre: annet». Tomt felt faller tilbake til 'annet'.
  const [customCategory, setCustomCategory] = useState('')
  const [serviceArea, setServiceArea] = useState('')
  const [websiteUrl, setWebsiteUrl] = useState('')
  const [phone, setPhone] = useState('')
  const [address, setAddress] = useState('')
  const [logoFile, setLogoFile] = useState<File | null>(null)
  // Feltnær feilmelding for logoen: brukeren står NEDERST i skjemaet når
  // fila avvises — en melding øverst i modalen er utenfor synsfeltet
  // (Lars' funn 2026-07-30: «skjer ingenting» ved for stor fil).
  const [logoError, setLogoError] = useState<string | null>(null)
  const [logoUploading, setLogoUploading] = useState(false)
  // Modalen eier sin egen opptatt-tilstand: isLoading-propen settes ikke av
  // alle foreldre, og da sto knappen aktiv i hele lagringssekvensen (Lars'
  // funn 2026-07-30: ~5 s uten respons = invitasjon til dobbeltklikk).
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const errorRef = useRef<HTMLDivElement | null>(null)

  // Dialogen scroller — sørg for at feilmeldingen faktisk kommer i synsfeltet
  useEffect(() => {
    if (error) errorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [error])

  const busy = isLoading || submitting || logoUploading

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (busy) return // dobbeltklikk-vern
    setError(null)

    if (!name.trim()) {
      setError(t('errorNameRequired'))
      return
    }
    if (phone.trim() && !normalizePhone(phone)) {
      setError(t('errorPhoneInvalid'))
      return
    }

    // Settes ETTER valideringene — en tidlig retur skal aldri låse knappen
    setSubmitting(true)
    try {
      const created = await onSubmit({
        name,
        description,
        category: category === 'annet' ? (customCategory.trim() || 'annet') : category,
        serviceArea: serviceArea.trim() || undefined,
        websiteUrl: normalizeUrl(websiteUrl) || undefined,
        phone: normalizePhone(phone) || undefined,
        address: address.trim() || undefined,
      })

      // Logo-fase (valgfri, ikke-fatal): bedriften er alt lagret — feiler
      // opplastingen kan logoen legges til på bedriftssiden etterpå.
      if (created?.id && logoFile) {
        setLogoUploading(true)
        try {
          const { data: sess } = await getSupabase().auth.getSession()
          const token = sess?.session?.access_token
          const fd = new FormData()
          fd.append('file', logoFile)
          fd.append('productId', created.id)
          const upRes = await fetch('/api/products/upload-logo', {
            method: 'POST',
            headers: token ? { Authorization: `Bearer ${token}` } : undefined,
            body: fd,
          })
          // Ikke-fatal, men ALDRI stille: bandet er lagret, logoen kan tas om igjen
          if (!upRes.ok) alert(t('logoUploadFailedNonFatal'))
        } catch { alert(t('logoUploadFailedNonFatal')) } finally {
          setLogoUploading(false)
        }
      }

      // Reset form
      setName('')
      setDescription('')
      setCategory(vcfg ? vcfg.categoryOptions[0].value : 'product')
      setCustomCategory('')
      setServiceArea('')
      setWebsiteUrl('')
      setPhone('')
      setAddress('')
      setLogoFile(null)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errorCreating'))
    } finally {
      setSubmitting(false)
    }
  }

  if (!isOpen) return null

  // Modalen laa inne i sidetreet, og toppmenyen har backdrop-filter — som
  // lager sin egen stablingskontekst. Da hjelper ingen z-index: toppen la seg
  // over modalens oeverste felt, saa tittelen og foerste etikett forsvant bak
  // den (Lars 3/8). Portal til <body> tar modalen ut av treet, og da gjelder
  // z-index igjen. Nav er 50; 1000 gir rikelig klaring.
  const innhold = (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'color-mix(in srgb, var(--ink) 45%, transparent)', backdropFilter: 'blur(2px)', WebkitBackdropFilter: 'blur(2px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
      }}
      onClick={onClose}
    >
      <div
        className="cf-anim-modal"
        onClick={(e) => e.stopPropagation()}
        style={{ width: '100%', maxWidth: 520, maxHeight: 'calc(100vh - 48px)', overflowY: 'auto', background: 'var(--paper-raised)', border: '1px solid var(--ds-border)', borderRadius: 20, padding: 32, boxShadow: '0 40px 80px -30px rgba(40,25,10,0.5)' }}
      >
        <h2 style={{ fontFamily: SERIF, fontWeight: 400, fontSize: 32, lineHeight: 1, color: 'var(--ink)', margin: '0 0 22px' }}>{t('title')}</h2>

        {error && (
          <div ref={errorRef} style={{ background: '#FBEAE6', border: '1px solid #F0C4B8', borderRadius: 11, padding: '13px 16px', fontFamily: HANKEN, fontSize: 14.5, fontWeight: 600, color: 'var(--ember-deep)', marginBottom: 20 }}>
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

          {vcfg && category === 'annet' && (
            <>
              <label style={labelStyle}>{t('categoryOtherLabel')}</label>
              <input
                type="text"
                value={customCategory}
                onChange={(e) => setCustomCategory(e.target.value)}
                placeholder={t('categoryOtherPlaceholder')}
                disabled={isLoading}
                className="cf-input"
                style={{ marginBottom: 20 }}
              />
            </>
          )}

          {vcfg?.serviceAreaField && (
            <>
              <label style={labelStyle}>{t('serviceAreaLabel')}</label>
              <input
                type="text"
                value={serviceArea}
                onChange={(e) => setServiceArea(e.target.value)}
                disabled={isLoading}
                className="cf-input"
                style={{ marginBottom: vcfg?.contactFields ? 20 : 28 }}
                placeholder={t('serviceAreaPlaceholder')}
              />
            </>
          )}

          {vcfg?.contactFields && (
            <>
              <label style={labelStyle}>{t('websiteLabel')}</label>
              <input
                type="text"
                value={websiteUrl}
                onChange={(e) => setWebsiteUrl(e.target.value)}
                disabled={isLoading}
                className="cf-input"
                style={{ marginBottom: 20 }}
                placeholder={t('websitePlaceholder')}
              />
              <label style={labelStyle}>{t('phoneLabel')}</label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                disabled={isLoading}
                className="cf-input"
                style={{ marginBottom: 20 }}
                placeholder={t('phonePlaceholder')}
              />
              <label style={labelStyle}>{t('addressLabel')}</label>
              <input
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                disabled={isLoading}
                className="cf-input"
                style={{ marginBottom: vcfg?.logoUpload ? 20 : 28 }}
                placeholder={t('addressPlaceholder')}
              />
            </>
          )}

          {vcfg?.logoUpload && (
            <>
              <label style={labelStyle}>{t('logoLabel')}</label>
              <input
                type="file"
                accept="image/png,image/jpeg,image/svg+xml,image/webp"
                disabled={isLoading || logoUploading}
                onChange={(e) => {
                  const f = e.target.files?.[0] || null
                  if (f && f.size > 4 * 1024 * 1024) {
                    setLogoError(t('errorLogoTooBig') + ` (${(f.size / 1024 / 1024).toFixed(1)} MB)`)
                    setLogoFile(null)
                    e.target.value = ''
                    return
                  }
                  setLogoError(null)
                  setLogoFile(f)
                }}
                className="cf-input"
                style={{ marginBottom: 8, ...(logoError ? { borderColor: 'var(--ember-deep)' } : {}) }}
              />
              {logoError && (
                <p style={{ fontFamily: HANKEN, fontSize: 13.5, fontWeight: 600, color: 'var(--ember-deep)', margin: '0 0 8px' }}>
                  {logoError}
                </p>
              )}
              <p style={{ fontFamily: HANKEN, fontSize: 13, color: '#8C8272', margin: '0 0 28px' }}>{t('logoHint')}</p>
            </>
          )}

          <div style={{ display: 'flex', gap: 12 }}>
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="cf-btn-ghost"
              style={{ flex: 1, fontFamily: HANKEN, fontWeight: 600, fontSize: 15, color: 'var(--ink)', background: 'transparent', border: '1px solid #D2C7B2', borderRadius: 11, padding: 13, cursor: busy ? 'not-allowed' : 'pointer', opacity: busy ? 0.5 : 1 }}
            >
              {t('cancel')}
            </button>
            <button
              type="submit"
              disabled={busy}
              className="cf-btn-ink"
              style={{ flex: 1.4, fontFamily: HANKEN, fontWeight: 700, fontSize: 15, color: 'var(--paper)', background: 'var(--ink)', border: 'none', borderRadius: 11, padding: 13, cursor: busy ? 'not-allowed' : 'pointer', opacity: busy ? 0.7 : 1 }}
            >
              {busy ? t('creating') : t('createProduct')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )

  // Under serverrendering finnes ingen document — da rendres ingenting, og
  // klienten setter den inn straks etter.
  return typeof document === 'undefined' ? null : createPortal(innhold, document.body)
}
