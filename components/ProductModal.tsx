'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'

interface ProductModalProps {
  isOpen: boolean
  onClose: () => void
  onSubmit: (name: string, description: string, category: string) => Promise<void>
  isLoading?: boolean
}

export function ProductModal({ isOpen, onClose, onSubmit, isLoading = false }: ProductModalProps) {
  const t = useTranslations('productModal')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState('produkt')
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!name.trim()) {
      setError(t('errorNameRequired'))
      return
    }

    try {
      await onSubmit(name, description, category)
      // Reset form
      setName('')
      setDescription('')
      setCategory('product')
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errorCreating'))
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-lg p-6 w-full max-w-md mx-4">
        <h2 className="text-2xl font-bold text-gray-900 mb-4">{t('title')}</h2>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('productNameLabel')}
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={isLoading}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#185FA5] disabled:bg-gray-100"
              placeholder={t('productNamePlaceholder')}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('descriptionLabel')}
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={isLoading}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#185FA5] disabled:bg-gray-100"
              rows={3}
              placeholder={t('descriptionPlaceholder')}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('categoryLabel')}
            </label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              disabled={isLoading}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#185FA5] disabled:bg-gray-100"
            >
              <option value="product">{t('categoryProduct')}</option>
              <option value="brand">{t('categoryBrand')}</option>
              <option value="service">{t('categoryService')}</option>
            </select>
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              disabled={isLoading}
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 font-medium hover:bg-gray-50 disabled:opacity-50"
            >
              {t('cancel')}
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="flex-1 px-4 py-2 bg-[#185FA5] text-white rounded-lg font-medium hover:bg-[#0C447C] disabled:opacity-50"
            >
              {isLoading ? t('creating') : t('createProduct')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
