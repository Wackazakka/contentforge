'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { getSupabase } from '@/lib/supabaseClient'

const DEFAULT_VOICE_ID = 'nPczCjzI2devNBz1zQrb'

const TONES = ['Vennlig', 'Energisk', 'Profesjonell', 'Rolig']
const DURATIONS = [
  { value: '30', label: '30 sek', hint: '~70 ord' },
  { value: '60', label: '60 sek', hint: '~135 ord' },
  { value: '90', label: '90 sek', hint: '~200 ord' },
]

export default function AvatarVideoPage() {
  const params = useParams()
  const productId = params.id as string

  // Context fields
  const [campaignName, setCampaignName] = useState('')
  const [topic, setTopic] = useState('')
  const [targetAudience, setTargetAudience] = useState('')
  const [problem, setProblem] = useState('')
  const [cta, setCta] = useState('')
  const [tone, setTone] = useState('Energisk')
  const [duration, setDuration] = useState('60')
  const [perspective, setPerspective] = useState<'du' | 'jeg'>('du')

  // Production fields
  const [script, setScript] = useState('')
  const [avatarImageUrl, setAvatarImageUrl] = useState('')
  const [voiceId, setVoiceId] = useState(DEFAULT_VOICE_ID)
  const [musicFile, setMusicFile] = useState<string | null>(null)
  const [musicLibrary, setMusicLibrary] = useState<Array<{ filename: string; name: string; folder?: string; url: string; size: number }>>([])

  useEffect(() => {
    fetch('/api/music').then(r => r.json()).then(d => setMusicLibrary(d.files || [])).catch(() => {})
  }, [])

  // UI state
  const [generating, setGenerating] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [jobId, setJobId] = useState<string | null>(null)

  const handleGenerateScript = async () => {
    if (!topic.trim()) {
      setError('Fyll inn emnet først.')
      return
    }
    setError(null)
    setGenerating(true)
    try {
      const res = await fetch('/api/content/produce/avatar-script', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic, targetAudience, problem, tone, cta, duration, perspective }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Feil ved manus-generering')
      }
      const { script: generated } = await res.json()
      setScript(generated)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ukjent feil')
    } finally {
      setGenerating(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setJobId(null)

    if (!script.trim()) {
      setError('Manus er påkrevd. Generer eller skriv inn manus.')
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

      const res = await fetch('/api/productions/avatar', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          productId,
          campaignName: campaignName || topic || 'Avatar Video',
          script,
          avatarImageUrl,
          voiceId: voiceId || DEFAULT_VOICE_ID,
          musicFile: musicFile || null,
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Feil ved oppstart av avatar-produksjon')
      }

      const { jobId: newJobId } = await res.json()
      setJobId(newJobId)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ukjent feil')
    } finally {
      setLoading(false)
    }
  }

  if (jobId) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-2xl mx-auto px-4 py-10">
          <div className="bg-green-50 border border-green-200 rounded-xl p-8 text-center">
            <div className="text-4xl mb-4">🎬</div>
            <h2 className="text-xl font-semibold text-green-800 mb-2">Produksjon startet!</h2>
            <p className="text-green-700 text-sm mb-1">
              Job ID: <code className="bg-green-100 px-1 rounded font-mono">{jobId}</code>
            </p>
            <p className="text-green-700 text-sm mb-6">
              Videoen genereres i bakgrunn (typisk 2–5 minutter). Du finner den under{' '}
              <Link href={`/dashboard/products/${productId}`} className="underline font-medium">
                produktsiden
              </Link>{' '}
              når den er klar.
            </p>
            <button
              onClick={() => { setJobId(null); setScript(''); setTopic('') }}
              className="text-sm text-[#185FA5] hover:underline"
            >
              Lag en ny avatar-video
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-2xl mx-auto px-4 py-10">
        <div className="mb-8">
          <Link href={`/dashboard/products/${productId}`} className="text-[#185FA5] hover:text-[#0C447C] text-sm mb-4 inline-block">
            ← Tilbake til produkt
          </Link>
          <h1 className="text-3xl font-bold text-gray-900">Avatar Video</h1>
          <p className="text-gray-500 mt-1">Fyll inn kontekst — AI skriver manus, ElevenLabs leser det opp, fal.ai lager lip-sync video.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">

          {/* Section 1: Context */}
          <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
            <h2 className="text-xs font-bold text-gray-900 uppercase tracking-wide">Innhold</h2>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Navn på produksjon (valgfritt)</label>
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
                Emne / hva handler videoen om? <span className="text-red-500">*</span>
              </label>
              <textarea
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="F.eks. «Slik sparer du 10 000 kr på bilkjøpet» eller «5 grunner til å velge oss»"
                rows={3}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#185FA5] resize-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Målgruppe</label>
                <input
                  type="text"
                  value={targetAudience}
                  onChange={(e) => setTargetAudience(e.target.value)}
                  placeholder="F.eks. «Førstegangskjøpere 25–40 år»"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#185FA5]"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Problem som løses</label>
                <input
                  type="text"
                  value={problem}
                  onChange={(e) => setProblem(e.target.value)}
                  placeholder="F.eks. «Usikker på hva bilen er verdt»"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#185FA5]"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Call-to-action</label>
              <input
                type="text"
                value={cta}
                onChange={(e) => setCta(e.target.value)}
                placeholder="F.eks. «Gå til nettsiden vår» eller «Book gratis vurdering»"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#185FA5]"
              />
            </div>

            <div className="grid grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Tone</label>
                <div className="flex flex-wrap gap-2">
                  {TONES.map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setTone(t)}
                      className={`px-3 py-1.5 rounded-full border text-sm font-medium transition-colors ${
                        tone === t
                          ? 'bg-green-600 text-white border-green-600'
                          : 'bg-white text-gray-700 border-gray-300 hover:border-gray-400'
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Perspektiv</label>
                <div className="flex gap-2">
                  {(['du', 'jeg'] as const).map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setPerspective(p)}
                      className={`px-3 py-1.5 rounded-full border text-sm font-medium transition-colors ${
                        perspective === p
                          ? 'bg-green-600 text-white border-green-600'
                          : 'bg-white text-gray-700 border-gray-300 hover:border-gray-400'
                      }`}
                    >
                      {p === 'du' ? '"Du"' : '"Jeg"'}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Varighet</label>
              <div className="flex gap-2">
                {DURATIONS.map((d) => (
                  <button
                    key={d.value}
                    type="button"
                    onClick={() => setDuration(d.value)}
                    className={`px-4 py-2 rounded-lg border text-sm font-medium transition-colors ${
                      duration === d.value
                        ? 'bg-[#185FA5] text-white border-[#185FA5]'
                        : 'bg-white text-gray-700 border-gray-300 hover:border-gray-400'
                    }`}
                  >
                    {d.label}
                    <span className="block text-xs font-normal opacity-70">{d.hint}</span>
                  </button>
                ))}
              </div>
            </div>

            <button
              type="button"
              onClick={handleGenerateScript}
              disabled={generating || !topic.trim()}
              className="w-full border-2 border-[#185FA5] text-[#185FA5] hover:bg-[#EBF4FF] disabled:border-gray-300 disabled:text-gray-400 font-semibold py-2.5 px-4 rounded-lg transition-colors text-sm"
            >
              {generating ? 'Genererer manus…' : '✨ Generer manus'}
            </button>
          </div>

          {/* Section 2: Manus */}
          <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-2">
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-bold text-gray-900 uppercase tracking-wide">
                Manus <span className="text-red-500">*</span>
              </label>
              <span className="text-xs text-gray-400">{script.length} tegn</span>
            </div>
            <textarea
              value={script}
              onChange={(e) => setScript(e.target.value)}
              placeholder="Klikk «Generer manus» ovenfor, eller skriv manus direkte her…"
              rows={10}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#185FA5] resize-none"
            />
          </div>

          {/* Section 3: Avatar + Voice */}
          <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
            <h2 className="text-xs font-bold text-gray-900 uppercase tracking-wide">Avatar & stemme</h2>

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
              />
              <p className="text-xs text-gray-400 mt-1">
                Offentlig URL til portrettbilde. Anbefalt: god belysning, nøytral bakgrunn, ansiktet tydelig synlig.
              </p>
            </div>

            {avatarImageUrl && (
              <div className="flex justify-center">
                <img
                  src={avatarImageUrl}
                  alt="Avatar preview"
                  className="w-28 h-28 object-cover rounded-full border-2 border-gray-200 shadow"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                />
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Voice ID (ElevenLabs)</label>
              <input
                type="text"
                value={voiceId}
                onChange={(e) => setVoiceId(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#185FA5]"
              />
              <p className="text-xs text-gray-400 mt-1">
                Standard: norsk stemme (Brian).{' '}
                <a href="https://elevenlabs.io/voice-library" target="_blank" rel="noopener noreferrer" className="text-[#185FA5] hover:underline">
                  Finn andre stemmer →
                </a>
              </p>
            </div>
          </div>

          {/* Section 4: Music */}
          <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-3">
            <h2 className="text-xs font-bold text-gray-900 uppercase tracking-wide">Bakgrunnsmusikk (valgfritt)</h2>
            <p className="text-xs text-gray-500">Musikken mikses inn på 12% volum bak voiceover-lyden.</p>
            {musicLibrary.length === 0 ? (
              <p className="text-sm text-gray-400">Laster musikk-bibliotek…</p>
            ) : (
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => setMusicFile(null)}
                  className={`w-full text-left p-3 border-2 rounded-lg text-sm transition-colors ${
                    musicFile === null
                      ? 'border-[#185FA5] bg-[#EBF4FF] text-[#185FA5] font-medium'
                      : 'border-gray-200 text-gray-500 hover:border-gray-300'
                  }`}
                >
                  Ingen musikk
                </button>
                {musicLibrary.map((m) => (
                  <button
                    key={m.filename}
                    type="button"
                    onClick={() => setMusicFile(m.filename)}
                    className={`w-full text-left p-3 border-2 rounded-lg transition-colors ${
                      musicFile === m.filename
                        ? 'border-green-500 bg-green-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium text-gray-900">{m.name}</span>
                      <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">{m.folder || 'global'}</span>
                    </div>
                    <audio controls className="w-full h-6" src={`/api/music/${encodeURIComponent(m.filename)}`} onClick={(e) => e.stopPropagation()} />
                  </button>
                ))}
              </div>
            )}
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !script.trim() || !avatarImageUrl.trim()}
            className="w-full bg-[#185FA5] hover:bg-[#0C447C] disabled:bg-gray-300 text-white font-semibold py-3 px-4 rounded-lg transition-colors"
          >
            {loading ? 'Starter produksjon…' : 'Generer avatar-video'}
          </button>

          <p className="text-xs text-gray-400 text-center">
            Videoen tar typisk 2–5 minutter. Du kan lukke siden og hente resultatet fra produktsiden.
          </p>
        </form>
      </div>
    </div>
  )
}
