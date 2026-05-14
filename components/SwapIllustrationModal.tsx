'use client'

import { useEffect, useState } from 'react'
import { getSupabase } from '@/lib/supabaseClient'
import { useTranslations } from 'next-intl'

interface SwapIllustrationModalProps {
  articleId: string
  productId: string
  topic: string
  currentImageUrl?: string
  onClose: () => void
  onImageUpdated: (newUrl: string) => void
}

const STYLE_KEYS = ['tech', 'editorial', 'warm', 'minimal', 'painterly'] as const
const STYLE_NAMES: Record<string, string> = {
  tech: 'Tech',
  editorial: 'Editorial',
  warm: 'Warm',
  minimal: 'Minimal',
  painterly: 'Painterly',
}

interface AssetRow {
  id: string
  asset_url: string
}

export default function SwapIllustrationModal({
  articleId,
  productId,
  topic,
  currentImageUrl,
  onClose,
  onImageUpdated,
}: SwapIllustrationModalProps) {
  const t = useTranslations('swapIllustration')
  const STYLES = STYLE_KEYS.map((key) => ({
    key,
    name: STYLE_NAMES[key],
    desc: t(`style${key.charAt(0).toUpperCase() + key.slice(1)}Desc` as any),
  }))
  const [tab, setTab] = useState<'generate' | 'bank'>('generate')
  const [selectedStyle, setSelectedStyle] = useState<string>('tech')
  const [generating, setGenerating] = useState(false)
  const [assets, setAssets] = useState<AssetRow[]>([])
  const [assetsLoading, setAssetsLoading] = useState(false)
  const [selectedAssetUrl, setSelectedAssetUrl] = useState<string | null>(null)
  const [applying, setApplying] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    if (tab !== 'bank' || !productId) return
    const fetchAssets = async () => {
      try {
        setAssetsLoading(true)
        const supabase = getSupabase()
        const { data, error } = await supabase
          .from('asset_banks')
          .select('id, asset_url')
          .eq('product_id', productId)
          .eq('asset_type', 'image')
          .order('created_at', { ascending: false })
        if (error) throw error
        setAssets(data || [])
      } catch (err) {
        console.error('[SwapIllustration] Assets fetch error:', err)
      } finally {
        setAssetsLoading(false)
      }
    }
    fetchAssets()
  }, [tab, productId])

  const handleGenerate = async () => {
    setGenerating(true)
    setMessage(null)
    try {
      const res = await fetch(`/api/content/articles/${articleId}/image`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          regenerate: true,
          imageStyle: selectedStyle,
          topic,
          productId,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Error generating image')
      }
      setMessage(t('generatingMsg'))
      setTimeout(() => {
        onClose()
      }, 1500)
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setGenerating(false)
    }
  }

  const handleApplyAsset = async () => {
    if (!selectedAssetUrl) return
    setApplying(true)
    setMessage(null)
    try {
      const res = await fetch(`/api/content/articles/${articleId}/image`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageUrl: selectedAssetUrl }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Error updating image')
      }
      onImageUpdated(selectedAssetUrl)
      onClose()
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setApplying(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h2 className="text-xl font-semibold text-gray-900">{t('title')}</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-2xl leading-none"
            aria-label={t('close')}
          >
            ×
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200">
          <button
            onClick={() => setTab('generate')}
            className={`flex-1 px-6 py-3 text-sm font-medium transition-colors ${
              tab === 'generate'
                ? 'text-blue-600 border-b-2 border-blue-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {t('tabGenerate')}
          </button>
          <button
            onClick={() => setTab('bank')}
            className={`flex-1 px-6 py-3 text-sm font-medium transition-colors ${
              tab === 'bank'
                ? 'text-blue-600 border-b-2 border-blue-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {t('tabBank')}
          </button>
        </div>

        <div className="p-6">
          {tab === 'generate' && (
            <>
              <p className="text-sm text-gray-600 mb-4">{t('selectStyle')}</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
                {STYLES.map((s) => (
                  <button
                    key={s.key}
                    onClick={() => setSelectedStyle(s.key)}
                    className={`text-left p-4 border rounded-lg transition-colors ${
                      selectedStyle === s.key
                        ? 'border-blue-600 bg-blue-50 ring-2 ring-blue-200'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <div className="font-semibold text-gray-900 mb-1">{s.name}</div>
                    <div className="text-xs text-gray-500">{s.desc}</div>
                  </button>
                ))}
              </div>
              {message && (
                <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded text-sm text-blue-700">
                  {message}
                </div>
              )}
              <button
                onClick={handleGenerate}
                disabled={generating}
                className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-medium py-2.5 px-4 rounded-lg transition-colors"
              >
                {generating ? t('generatingButton') : t('generateButton')}
              </button>
            </>
          )}

          {tab === 'bank' && (
            <>
              {assetsLoading ? (
                <div className="text-center py-12 text-gray-500">{t('loadingImages')}</div>
              ) : assets.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  {t('noImages')}
                </div>
              ) : (
                <>
                  <p className="text-sm text-gray-600 mb-4">
                    {t('clickToSelect')}
                  </p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6 max-h-[50vh] overflow-y-auto">
                    {assets.map((a) => (
                      <button
                        key={a.id}
                        onClick={() => setSelectedAssetUrl(a.asset_url)}
                        className={`relative border-2 rounded-lg overflow-hidden transition-all ${
                          selectedAssetUrl === a.asset_url
                            ? 'border-blue-600 ring-2 ring-blue-200'
                            : 'border-transparent hover:border-gray-300'
                        }`}
                      >
                        <img
                          src={a.asset_url}
                          alt=""
                          className="w-full h-32 object-cover"
                        />
                      </button>
                    ))}
                  </div>
                  {message && (
                    <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">
                      {message}
                    </div>
                  )}
                  <button
                    onClick={handleApplyAsset}
                    disabled={!selectedAssetUrl || applying}
                    className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-medium py-2.5 px-4 rounded-lg transition-colors"
                  >
                    {applying ? t('applyingButton') : t('applyButton')}
                  </button>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
