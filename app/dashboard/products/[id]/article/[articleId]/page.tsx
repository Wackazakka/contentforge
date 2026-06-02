'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { getSupabase } from '@/lib/supabaseClient'
import SwapIllustrationModal from '@/components/SwapIllustrationModal'
import { useTranslations } from 'next-intl'

interface Article {
  id: string
  product_id: string
  title: string
  platform: string
  content: string
  image_urls: string[] | null
  created_at: string
}

function renderMarkdown(text: string) {
  const [mainContent, ctaContent] = text.split('\n\n---CTA---\n')

  const renderParagraphs = (str: string) =>
    str
      .split(/\n{2,}/)
      .map((para) =>
        para
          .replace(/\n/g, ' ')
          .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
          .replace(/\*(.+?)\*/g, '<em>$1</em>')
          .trim()
      )
      .filter(Boolean)

  const mainParagraphs = renderParagraphs(mainContent)
  const ctaParagraphs = ctaContent ? renderParagraphs(ctaContent) : []

  return (
    <div className="space-y-4">
      {mainParagraphs.map((p, i) => (
        <p key={i} dangerouslySetInnerHTML={{ __html: p }} />
      ))}
      {ctaParagraphs.length > 0 && (
        <>
          <hr className="border-gray-200 my-2" />
          <div className="space-y-1">
            {ctaParagraphs.map((p, i) => (
              <p
                key={i}
                className="text-sm text-gray-500 italic"
                dangerouslySetInnerHTML={{ __html: p }}
              />
            ))}
          </div>
        </>
      )}
    </div>
  )
}

export default function ArticleDetailPage() {
  const router = useRouter()
  const params = useParams()
  const t = useTranslations('articleDetail')
  const productId = params?.id as string
  const articleId = params?.articleId as string

  const [article, setArticle] = useState<Article | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [swapOpen, setSwapOpen] = useState(false)
  const [productLogoUrl, setProductLogoUrl] = useState<string | null>(null)

  // Edit state
  const [editing, setEditing] = useState(false)
  const [editDraft, setEditDraft] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState<string | null>(null)

  useEffect(() => {
    if (!articleId) return
    const fetchArticle = async () => {
      try {
        setLoading(true)
        const supabase = getSupabase()
        const { data, error: fetchError } = await supabase
          .from('articles')
          .select('*')
          .eq('id', articleId)
          .single()
        if (fetchError) throw fetchError
        setArticle(data)
        // Fetch logo for this product
        if (data?.product_id) {
          const supabase2 = getSupabase()
          const { data: pp } = await supabase2.from('product_profiles').select('logo_url, article_logo_url').eq('product_id', data.product_id).maybeSingle()
          if (pp) setProductLogoUrl((pp as any).article_logo_url || pp.logo_url || null)
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : t('errorFetching'))
      } finally {
        setLoading(false)
      }
    }
    fetchArticle()
  }, [articleId])

  const startEdit = () => {
    setEditDraft(article?.content || '')
    setEditing(true)
    setSaveMsg(null)
  }

  const cancelEdit = () => {
    setEditing(false)
    setEditDraft('')
  }

  const saveEdit = async () => {
    if (!article) return
    setSaving(true)
    try {
      const supabase = getSupabase()
      const { error } = await supabase
        .from('articles')
        .update({ content: editDraft })
        .eq('id', article.id)
      if (error) throw error
      setArticle((prev) => prev ? { ...prev, content: editDraft } : prev)
      setEditing(false)
      setSaveMsg(t('saved'))
      setTimeout(() => setSaveMsg(null), 3000)
    } catch (err) {
      alert('Error saving: ' + (err instanceof Error ? err.message : String(err)))
    } finally {
      setSaving(false)
    }
  }

  const copyToClipboard = () => {
    if (article?.content) {
      navigator.clipboard.writeText(article.content)
      alert(t('copiedAlert'))
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-cf-bg flex items-center justify-center">
        <div className="text-gray-600">{t('loading')}</div>
      </div>
    )
  }

  if (error || !article) {
    return (
      <div className="min-h-screen bg-cf-bg">
        <div className="max-w-3xl mx-auto px-4 py-8">
          <Link href={`/dashboard/products/${productId}`} className="hover:underline mb-4 inline-block">
            {t('backToProduct')}
          </Link>
          <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-red-700">
            {error || t('notFound')}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-cf-bg">
      <div className="max-w-3xl mx-auto px-4 py-8">
        <Link href={`/dashboard/products/${productId}`} className="hover:underline mb-6 inline-block">
          {t('backToProduct')}
        </Link>

        <div className="bg-white rounded-lg border border-gray-200 p-8">
          {/* Platform Badge */}
          <div className="mb-6">
            <span className="inline-block px-4 py-2 bg-[#EBF4FF] text-[#185FA5] rounded-full text-sm font-medium capitalize">
              {article.platform}
            </span>
          </div>

          {/* Title */}
          <h1 className="text-4xl font-bold text-gray-900 mb-2">{article.title}</h1>
          <p className="text-sm text-gray-500 mb-8">
            {t('created', { date: new Date(article.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) })}
          </p>

          {/* Illustration */}
          {article.image_urls?.[0] ? (
            <div className="mb-8">
              <img
                src={article.image_urls[0]}
                alt={article.title}
                className="w-full rounded-xl object-contain bg-gray-50"
              />
              <button
                onClick={() => setSwapOpen(true)}
                className="mt-3 inline-flex items-center px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium rounded-lg transition-colors"
              >
                {t('swapIllustration')}
              </button>
            </div>
          ) : (
            <div className="mb-8">
              <button
                onClick={() => setSwapOpen(true)}
                className="inline-flex items-center px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium rounded-lg transition-colors"
              >
                {t('addIllustration')}
              </button>
            </div>
          )}

          {swapOpen && (
            <SwapIllustrationModal
              articleId={article.id}
              productId={article.product_id}
              topic={article.title}
              logoUrl={productLogoUrl || undefined}
              currentImageUrl={article.image_urls?.[0]}
              onClose={() => setSwapOpen(false)}
              onImageUpdated={(newUrl) =>
                setArticle((prev) => (prev ? { ...prev, image_urls: [newUrl] } : prev))
              }
            />
          )}

          <div className="border-t border-gray-200 my-8" />

          {/* Content — view or edit */}
          {editing ? (
            <div className="mb-6">
              <textarea
                value={editDraft}
                onChange={(e) => setEditDraft(e.target.value)}
                rows={16}
                className="w-full px-3 py-2 border border-blue-400 rounded-lg text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-[#185FA5] resize-y"
              />
              <div className="flex gap-2 mt-3">
                <button
                  onClick={saveEdit}
                  disabled={saving}
                  className="px-4 py-2 bg-[#185FA5] hover:bg-[#0C447C] disabled:bg-gray-400 text-white text-sm font-medium rounded-lg transition-colors"
                >
                  {saving ? t('saving') : t('save')}
                </button>
                <button
                  onClick={cancelEdit}
                  className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium rounded-lg transition-colors"
                >
                  {t('cancelEdit')}
                </button>
              </div>
            </div>
          ) : (
            <div className="prose prose-sm max-w-none mb-6 text-gray-700 leading-relaxed">
              {renderMarkdown(article.content)}
            </div>
          )}

          <div className="border-t border-gray-200 my-6" />

          {/* Action bar */}
          <div className="flex flex-wrap gap-3 items-center">
            <Link
              href={`/dashboard/publish?type=article&content_id=${article.id}&product_id=${productId}`}
              className="inline-flex items-center px-5 py-2 bg-[#185FA5] hover:bg-[#0C447C] text-white font-medium rounded-lg transition-colors"
            >
              {t('publish')}
            </Link>
            {!editing && (
              <button
                onClick={startEdit}
                className="inline-flex items-center px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium rounded-lg transition-colors"
              >
                {t('editText')}
              </button>
            )}
            <button
              onClick={copyToClipboard}
              className="inline-flex items-center px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium rounded-lg transition-colors"
            >
              {t('copyContent')}
            </button>
            {saveMsg && <span className="text-sm text-green-600 font-medium">{saveMsg}</span>}
          </div>
        </div>
      </div>
    </div>
  )
}
