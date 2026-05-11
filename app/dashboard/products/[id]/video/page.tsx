'use client'

import { useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/lib/authContext'
import { getSupabase } from '@/lib/supabaseClient'

export default function VideoProductionPage() {
  const router = useRouter()
  const params = useParams()
  const { session } = useAuth()
  const productId = params.id as string

  const [campaignName, setCampaignName] = useState('')
  const [headline, setHeadline] = useState('')
  const [bodyCopy, setBodyCopy] = useState('')
  const [cta, setCta] = useState('')
  const [tone, setTone] = useState('professional')
  const [formats, setFormats] = useState<string[]>(['9:16'])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const handleFormatToggle = (format: string) => {
    if (formats.includes(format)) {
      // Remove format, but keep at least one
      if (formats.length > 1) {
        setFormats(formats.filter((f) => f !== format))
      }
    } else {
      // Add format
      setFormats([...formats, format])
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSuccess(null)

    // Validation
    if (!campaignName.trim()) {
      setError('Campaign name is required')
      return
    }
    if (!headline.trim()) {
      setError('Headline is required')
      return
    }
    if (!bodyCopy.trim()) {
      setError('Campaign description is required')
      return
    }
    if (formats.length === 0) {
      setError('Select at least one format')
      return
    }

    setLoading(true)

    try {
      // Get session to include Authorization header
      const { data: { session } } = await getSupabase().auth.getSession()
      
      if (!session?.access_token) {
        setError('Not authenticated. Please log in again.')
        setLoading(false)
        return
      }

      const response = await fetch('/api/productions/video', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          productId,
          campaignName,
          headline,
          bodyCopy,
          cta,
          tone,
          formats,
        }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Feil ved oppstart av videogen')
      }

      const { jobId } = await response.json()
      setSuccess(`Videogen startet! Job ID: ${jobId}`)
      
      // Clear form
      setCampaignName('')
      setHeadline('')
      setBodyCopy('')
      setCta('')
      
      // Redirect to product page after 2 seconds
      setTimeout(() => {
        router.push(`/dashboard/products/${productId}`)
      }, 2000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
      console.error('[VideoProduction] Error:', err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-cf-bg">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-40">
        <div className="max-w-2xl mx-auto px-6 py-6">
          <Link
            href={`/dashboard/products/${productId}`}
            className="text-blue-600 hover:text-blue-700 text-sm font-medium mb-2 inline-block"
          >
            ← Back to product
          </Link>
          <h1 className="text-3xl font-bold text-gray-900">Create video</h1>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-6 py-8">
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-red-700 font-medium">{error}</p>
          </div>
        )}

        {success && (
          <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg">
            <p className="text-green-700 font-medium">{success}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="bg-white rounded-lg border border-gray-200 p-8">
          {/* Campaign Name */}
          <div className="mb-6">
            <label className="block text-sm font-semibold text-gray-900 mb-2">
              Campaign name *
            </label>
            <input
              type="text"
              value={campaignName}
              onChange={(e) => setCampaignName(e.target.value)}
              disabled={loading}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
              placeholder="e.g. Summer campaign 2026"
            />
          </div>

          {/* Headline */}
          <div className="mb-6">
            <label className="block text-sm font-semibold text-gray-900 mb-2">
              Headline *
            </label>
            <input
              type="text"
              value={headline}
              onChange={(e) => setHeadline(e.target.value)}
              disabled={loading}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
              placeholder="Main message for the campaign"
            />
          </div>

          {/* Body Copy */}
          <div className="mb-6">
            <label className="block text-sm font-semibold text-gray-900 mb-2">
              Campaign description *
            </label>
            <textarea
              value={bodyCopy}
              onChange={(e) => setBodyCopy(e.target.value)}
              disabled={loading}
              rows={4}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
              placeholder="Detailed description of what the campaign is about"
            />
          </div>

          {/* CTA */}
          <div className="mb-6">
            <label className="block text-sm font-semibold text-gray-900 mb-2">
              Call-to-Action (optional)
            </label>
            <input
              type="text"
              value={cta}
              onChange={(e) => setCta(e.target.value)}
              disabled={loading}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
              placeholder="e.g. Visit now, Try for free, etc."
            />
          </div>

          {/* Tone */}
          <div className="mb-6">
            <label className="block text-sm font-semibold text-gray-900 mb-2">
              Tone
            </label>
            <select
              value={tone}
              onChange={(e) => setTone(e.target.value)}
              disabled={loading}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
            >
              <option value="professional">Professional</option>
              <option value="friendly">Friendly</option>
              <option value="energetic">Energetic</option>
              <option value="calm">Calm</option>
            </select>
          </div>

          {/* Formats */}
          <div className="mb-8">
            <label className="block text-sm font-semibold text-gray-900 mb-3">
              Format * (select at least one)
            </label>
            <div className="space-y-2">
              {['9:16', '1:1', '16:9'].map((format) => (
                <label key={format} className="flex items-center">
                  <input
                    type="checkbox"
                    checked={formats.includes(format)}
                    onChange={() => handleFormatToggle(format)}
                    disabled={loading}
                    className="w-4 h-4 rounded border-gray-300 cursor-pointer"
                  />
                  <span className="ml-3 text-gray-700">
                    {format === '9:16' && '📱 Mobile vertical (9:16)'}
                    {format === '1:1' && '⬜ Square (1:1)'}
                    {format === '16:9' && '🖥️ Desktop (16:9)'}
                  </span>
                </label>
              ))}
            </div>
          </div>

          {/* Submit */}
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => router.back()}
              disabled={loading}
              className="flex-1 px-4 py-3 border border-gray-300 rounded-lg text-gray-700 font-semibold hover:bg-gray-50 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-4 py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? 'Starting...' : '🎬 Start production'}
            </button>
          </div>
        </form>

        {/* Info box */}
        <div className="mt-8 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <p className="text-sm text-blue-900">
            <strong>ℹ️ Info:</strong> Video production automatically generates voiceover, images and music based on your input.
            The process may take a few minutes. You will be notified when the video is ready.
          </p>
        </div>
      </div>
    </div>
  )
}
