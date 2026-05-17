'use client'

import { useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { getSupabase } from '@/lib/supabaseClient'

const DEFAULT_VOICE_ID = 'nPczCjzI2devNBz1zQrb'

export default function AvatarVideoPage() {
  const params = useParams()
  const productId = params.id as string

  const [campaignName, setCampaignName] = useState('')
  const [script, setScript] = useState('')
  const [avatarImageUrl, setAvatarImageUrl] = useState('')
  const [voiceId, setVoiceId] = useState(DEFAULT_VOICE_ID)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [jobId, setJobId] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setJobId(null)

    if (!script.trim()) {
      setError('Manus er påkrevd.')
      return
    }
    if (!avatarImageUrl.trim()) {
      setError('Avatar-bilde URL er påkrevd.')
      return
    }

    setLoading(true)
    try {
      const { data: { session } } = await getSupabase().auth.getSession()
      if (!session?.access_token) {
        setError('Du er ikke innlogget.')
        setLoading(false)
        return
      }

      const response = await fetch('/api/productions/avatar', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          productId,
          campaignName: campaignName || 'Avatar Video',
          script,
          avatarImageUrl,
          voiceId: voiceId || DEFAULT_VOICE_ID,
        }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Feil ved oppstart av avatar-produksjon')
      }

      const { jobId: newJobId } = await response.json()
      setJobId(newJobId)
      setScript('')
      setAvatarImageUrl('')
      setCampaignName('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ukjent feil')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-2xl mx-auto px-4 py-10">
        <div className="mb-8">
          <Link
            href={`/dashboard/products/${productId}`}
            className="text-[#185FA5] hover:text-[#0C447C] text-sm mb-4 inline-block"
          >
            ← Tilbake til produkt
          </Link>
          <h1 className="text-3xl font-bold text-gray-900">Avatar Video</h1>
          <p className="text-gray-500 mt-1">
            Lag en lip-sync avatar-video fra manus og et bilde via ElevenLabs + fal.ai VEED Fabric.
          </p>
        </div>

        {jobId ? (
          <div className="bg-green-50 border border-green-200 rounded-xl p-6">
            <h2 className="text-lg font-semibold text-green-800 mb-2">Produksjon startet!</h2>
            <p className="text-green-700 text-sm mb-1">
              Job ID: <code className="bg-green-100 px-1 rounded font-mono">{jobId}</code>
            </p>
            <p className="text-green-700 text-sm">
              Videoen genereres i bakgrunn (typisk 2–5 minutter). Du finner den ferdige videoen under{' '}
              <Link href={`/dashboard/products/${productId}`} className="underline">
                produktsiden
              </Link>{' '}
              når den er klar.
            </p>
            <button
              onClick={() => setJobId(null)}
              className="mt-4 text-sm text-[#185FA5] hover:underline"
            >
              Lag en ny avatar-video
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-6 bg-white rounded-xl border border-gray-200 p-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Navn på produksjon (valgfritt)
              </label>
              <input
                type="text"
                value={campaignName}
                onChange={(e) => setCampaignName(e.target.value)}
                placeholder="F.eks. «Produktlansering mai»"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#185FA5]"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Manus <span className="text-red-500">*</span>
              </label>
              <textarea
                value={script}
                onChange={(e) => setScript(e.target.value)}
                placeholder="Skriv manuset som avataren skal lese opp. Hold det kort og tydelig — ca. 30–90 sekunder."
                rows={8}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#185FA5] resize-none"
                required
              />
              <p className="text-xs text-gray-400 mt-1">{script.length} tegn</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Avatar-bilde URL <span className="text-red-500">*</span>
              </label>
              <input
                type="url"
                value={avatarImageUrl}
                onChange={(e) => setAvatarImageUrl(e.target.value)}
                placeholder="https://eksempel.com/mitt-avatar-bilde.jpg"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#185FA5]"
                required
              />
              <p className="text-xs text-gray-400 mt-1">
                Bruk en offentlig tilgjengelig URL til bildet. Anbefalt: portrettbilde, god belysning, nøytral bakgrunn.
              </p>
            </div>

            {avatarImageUrl && (
              <div className="flex justify-center">
                <img
                  src={avatarImageUrl}
                  alt="Avatar preview"
                  className="w-32 h-32 object-cover rounded-full border-2 border-gray-200"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                />
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Voice ID (ElevenLabs)
              </label>
              <input
                type="text"
                value={voiceId}
                onChange={(e) => setVoiceId(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#185FA5]"
              />
              <p className="text-xs text-gray-400 mt-1">
                Standard er ContentForge sin norske stemme. Du kan bytte til en annen stemme fra{' '}
                <a
                  href="https://elevenlabs.io/voice-library"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[#185FA5] hover:underline"
                >
                  ElevenLabs Voice Library
                </a>
                .
              </p>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#185FA5] hover:bg-[#0C447C] disabled:bg-gray-300 text-white font-semibold py-3 px-4 rounded-lg transition-colors"
            >
              {loading ? 'Starter produksjon…' : 'Generer avatar-video'}
            </button>

            <p className="text-xs text-gray-400 text-center">
              Videoen tar typisk 2–5 minutter å generere. Du kan lukke siden og hente resultatet fra produktsiden.
            </p>
          </form>
        )}
      </div>
    </div>
  )
}
