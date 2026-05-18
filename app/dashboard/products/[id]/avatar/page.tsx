'use client'

import { useState, useEffect, useRef } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { getSupabase } from '@/lib/supabaseClient'

const DEFAULT_VOICE_ID = 'nhvaqgRyAq6BmFs3WcdX'

const NORWEGIAN_VOICES = [
  { id: 'nhvaqgRyAq6BmFs3WcdX', name: 'Øyvind', desc: 'Dyp og rolig', preview: 'https://storage.googleapis.com/eleven-public-prod/database/workspace/7dc5c03caf8f40daa575fa9eacbf3de8/voices/nhvaqgRyAq6BmFs3WcdX/Z8yVliHOyn9eSmt4YEVw.mp3' },
  { id: 's2xtA7B2CTXPPlJzch1v', name: 'Dennis', desc: 'Klar og behagelig', preview: 'https://storage.googleapis.com/eleven-public-prod/database/workspace/15af1c0d0dcd479cb8376a767ab07b4c/voices/s2xtA7B2CTXPPlJzch1v/YB9DE4weRg6BTei8hVZ5.mp3' },
  { id: '2dhHLsmg0MVma2t041qT', name: 'Johannes', desc: 'Selvsikker', preview: 'https://storage.googleapis.com/eleven-public-prod/custom/voices/2dhHLsmg0MVma2t041qT/fX3l7ljt7bx6zRPz8VdC.mp3' },
  { id: 'BGEU6wFi2uNm6Kje1Yhk', name: 'Maja', desc: 'Nordisk, dramatisk', preview: 'https://storage.googleapis.com/eleven-public-prod/database/workspace/ed9b05e6324c457685490352e9a1ec90/voices/BGEU6wFi2uNm6Kje1Yhk/gCIHS9pPkrtwiAjN4VgG.mp3' },
  { id: 'CMbvLbbccSd611KtwxV3', name: 'Robert', desc: 'Oslo', preview: 'https://storage.googleapis.com/eleven-public-prod/database/workspace/2461cf568dc042a3bbfbf75522203b35/voices/CMbvLbbccSd611KtwxV3/fabf86a6-90db-42c2-9993-47fff3f73a80.mp3' },
  { id: 'vUmLiNBm6MDcy1NUHaVr', name: 'Helge', desc: '', preview: 'https://storage.googleapis.com/eleven-public-prod/database/workspace/3690d7df74c84d8880e0e0d0641de7f2/voices/vUmLiNBm6MDcy1NUHaVr/6JBvRVvXcssLtXlaqLg1.mp3' },
  { id: 'uNsWM1StCcpydKYOjKyu', name: 'Mia', desc: 'Norsk kvinne', preview: 'https://storage.googleapis.com/eleven-public-prod/database/workspace/a2175a4ce5a74c88868dd9d4a000c9a6/voices/uNsWM1StCcpydKYOjKyu/868f87d5-7724-4786-a7fa-a48e01b2ba54.mp3' },
]

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
  const [selectedMusicFolder, setSelectedMusicFolder] = useState('global')
  const [includeOutroCard, setIncludeOutroCard] = useState(false)
  const [productProfile, setProductProfile] = useState<{ logo_url?: string; primary_color?: string; secondary_color?: string; website_url?: string; cta_text?: string; avatar_image_url?: string } | null>(null)

  const saveAvatarImageUrl = async (url: string) => {
    if (!productId || !url) return
    const { getSupabase } = await import('@/lib/supabaseClient')
    getSupabase()
      .from('product_profiles')
      .upsert({ product_id: productId, avatar_image_url: url }, { onConflict: 'product_id' })
      .then(() => {})
  }

  const refreshMusicLibrary = () =>
    fetch('/api/music').then(r => r.json()).then(d => setMusicLibrary(d.files || [])).catch(() => {})

  useEffect(() => { refreshMusicLibrary() }, [])

  useEffect(() => {
    if (!productId) return
    import('@/lib/supabaseClient').then(({ getSupabase }) => {
      getSupabase()
        .from('product_profiles')
        .select('logo_url, primary_color, secondary_color, website_url, cta_text, avatar_image_url')
        .eq('product_id', productId)
        .maybeSingle()
        .then(({ data }: { data: any }) => {
          if (data) {
            setProductProfile(data)
            if (data.avatar_image_url) setAvatarImageUrl(data.avatar_image_url)
          }
        })
    })
  }, [productId])

  // UI state
  const [generating, setGenerating] = useState(false)
  const [loading, setLoading] = useState(false)
  const [uploadingImage, setUploadingImage] = useState(false)
  const [playingVoice, setPlayingVoice] = useState<string | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
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
      setError('Avatar-bilde er påkrevd. Last opp et bilde eller lim inn en URL.')
      return
    }
    if (!/\.(jpg|jpeg|png|webp)(\?.*)?$/i.test(avatarImageUrl.trim())) {
      setError('Avatar-bilde URL må peke til et bilde (jpg, png eller webp).')
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
          outroCard: includeOutroCard && productProfile ? {
            logoUrl: productProfile.logo_url || null,
            primaryColor: productProfile.primary_color || '#1a1a2e',
            secondaryColor: productProfile.secondary_color || '#ffffff',
            url: (productProfile as any).website_url || '',
            cta: (productProfile as any).cta_text || '',
            durationSeconds: 3,
          } : null,
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
                Avatar-bilde <span className="text-red-500">*</span>
              </label>
              <div className="flex gap-2 mb-2">
                <label className={`flex-1 flex items-center justify-center gap-2 border-2 border-dashed rounded-lg px-3 py-2 text-sm cursor-pointer transition-colors ${uploadingImage ? 'border-gray-200 text-gray-400' : 'border-[#185FA5] text-[#185FA5] hover:bg-[#EBF4FF]'}`}>
                  {uploadingImage ? 'Laster opp…' : '📁 Last opp fra datamaskin'}
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    disabled={uploadingImage}
                    onChange={async (e) => {
                      const file = e.currentTarget.files?.[0]
                      if (!file) return
                      setUploadingImage(true)
                      setError(null)
                      try {
                        const formData = new FormData()
                        formData.append('file', file)
                        const res = await fetch('/api/avatar/upload-image', { method: 'POST', body: formData })
                        const data = await res.json()
                        if (!res.ok) throw new Error(data.error || 'Opplasting feilet')
                        setAvatarImageUrl(data.url)
                        saveAvatarImageUrl(data.url)
                      } catch (err) {
                        setError(err instanceof Error ? err.message : 'Opplasting feilet')
                      } finally {
                        setUploadingImage(false)
                        e.currentTarget.value = ''
                      }
                    }}
                  />
                </label>
              </div>
              <div className="flex gap-2">
                <input
                  type="url"
                  value={avatarImageUrl}
                  onChange={(e) => setAvatarImageUrl(e.target.value)}
                  onBlur={(e) => { if (e.target.value) saveAvatarImageUrl(e.target.value) }}
                  placeholder="https://eksempel.com/mitt-avatar-bilde.jpg"
                  className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#185FA5]"
                />
                {avatarImageUrl && avatarImageUrl !== productProfile?.avatar_image_url && (
                  <button
                    type="button"
                    onClick={() => saveAvatarImageUrl(avatarImageUrl)}
                    className="px-3 py-2 text-xs bg-[#185FA5] text-white rounded-lg hover:bg-[#1450a0]"
                  >
                    Lagre
                  </button>
                )}
              </div>
              <p className="text-xs text-gray-400 mt-1">
                Last opp eller lim inn URL — bildet huskes til neste gang. Anbefalt: god belysning, nøytral bakgrunn, ansiktet tydelig synlig.
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
              <label className="block text-sm font-medium text-gray-700 mb-2">Stemme</label>
              <div className="grid grid-cols-2 gap-2 mb-3">
                {NORWEGIAN_VOICES.map((v) => {
                  const isSelected = voiceId === v.id
                  const isPlaying = playingVoice === v.id
                  return (
                    <button
                      key={v.id}
                      type="button"
                      onClick={() => setVoiceId(v.id)}
                      className={`flex items-center gap-2 p-2.5 rounded-lg border-2 text-left transition-all ${
                        isSelected
                          ? 'border-[#7C3AED] bg-[#F5F3FF]'
                          : 'border-gray-200 hover:border-gray-300 bg-white'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          if (isPlaying) {
                            audioRef.current?.pause()
                            setPlayingVoice(null)
                          } else {
                            if (audioRef.current) {
                              audioRef.current.pause()
                            }
                            const audio = new Audio(v.preview)
                            audioRef.current = audio
                            audio.play()
                            setPlayingVoice(v.id)
                            audio.onended = () => setPlayingVoice(null)
                          }
                        }}
                        className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center transition-colors ${
                          isPlaying ? 'bg-[#7C3AED] text-white' : 'bg-gray-100 hover:bg-[#EDE9FE] text-gray-600'
                        }`}
                        title={isPlaying ? 'Stopp' : 'Hør stemmen'}
                      >
                        {isPlaying ? (
                          <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor"><rect x="1" y="1" width="3" height="8"/><rect x="6" y="1" width="3" height="8"/></svg>
                        ) : (
                          <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor"><polygon points="2,1 9,5 2,9"/></svg>
                        )}
                      </button>
                      <div className="min-w-0">
                        <div className={`text-sm font-medium leading-tight ${isSelected ? 'text-[#7C3AED]' : 'text-gray-900'}`}>{v.name}</div>
                        {v.desc && <div className="text-xs text-gray-400 leading-tight truncate">{v.desc}</div>}
                      </div>
                    </button>
                  )
                })}
              </div>
              <input
                type="text"
                value={voiceId}
                onChange={(e) => setVoiceId(e.target.value)}
                placeholder="Eller lim inn Voice ID fra ElevenLabs…"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#185FA5]"
              />
              <p className="text-xs text-gray-400 mt-1">
                Velg stemme ovenfor, eller lim inn ID direkte fra{' '}
                <a href="https://elevenlabs.io/voice-library" target="_blank" rel="noopener noreferrer" className="text-[#185FA5] hover:underline">
                  ElevenLabs voice library →
                </a>
              </p>
            </div>
          </div>

          {/* Section 4: Music */}
          <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-3">
            <h2 className="text-xs font-bold text-gray-900 uppercase tracking-wide">Bakgrunnsmusikk (valgfritt)</h2>
            <p className="text-xs text-gray-500">Musikken mikses inn på 12% volum bak voiceover-lyden.</p>

            {/* Upload */}
            <div className="border-2 border-dashed border-gray-200 rounded-lg p-4">
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-xs font-medium text-gray-700 block mb-1">Mappe</span>
                  <select
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                    value={selectedMusicFolder}
                    onChange={(e) => setSelectedMusicFolder(e.target.value)}
                  >
                    <option value="global">Global</option>
                    <option value="bildeal">BilDeal</option>
                    <option value="reforhandle">Reforhandle</option>
                    <option value="singlepicker">SinglePicker</option>
                  </select>
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-gray-700 block mb-1">Last opp MP3</span>
                  <input
                    type="file"
                    accept=".mp3"
                    onChange={async (e) => {
                      const input = e.currentTarget
                      const file = input.files?.[0]
                      if (!file) return
                      if (!file.name.toLowerCase().endsWith('.mp3')) {
                        alert('Kun MP3-filer støttes.')
                        input.value = ''
                        return
                      }
                      if (file.size > 4 * 1024 * 1024) {
                        alert(`Filen er for stor (${(file.size / 1024 / 1024).toFixed(1)} MB). Maks 4 MB.`)
                        input.value = ''
                        return
                      }
                      const formData = new FormData()
                      formData.append('file', file)
                      try {
                        const res = await fetch(`/api/music/upload?folder=${selectedMusicFolder}`, {
                          method: 'POST',
                          body: formData,
                        })
                        if (res.ok) {
                          await refreshMusicLibrary()
                          alert('Lastet opp!')
                        } else {
                          alert('Opplasting feilet: ' + await res.text())
                        }
                      } catch (err) {
                        alert('Opplasting feilet.')
                      }
                      input.value = ''
                    }}
                    className="block w-full text-sm text-gray-500 file:mr-2 file:rounded file:border-0 file:bg-[#185FA5] file:px-2 file:py-1 file:text-xs file:font-medium file:text-white hover:file:bg-[#0C447C]"
                  />
                </label>
              </div>
            </div>

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
                  <div
                    key={m.filename}
                    onClick={() => setMusicFile(m.filename)}
                    className={`w-full text-left p-3 border-2 rounded-lg transition-colors cursor-pointer ${
                      musicFile === m.filename
                        ? 'border-green-500 bg-green-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium text-gray-900">{m.name}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">{m.folder || 'global'}</span>
                        <button
                          type="button"
                          onClick={async (e) => {
                            e.stopPropagation()
                            if (!confirm(`Slett «${m.name}»?`)) return
                            await fetch(`/api/music/${encodeURIComponent(m.filename)}`, { method: 'DELETE' })
                            if (musicFile === m.filename) setMusicFile(null)
                            await refreshMusicLibrary()
                          }}
                          className="text-gray-300 hover:text-red-500 transition-colors text-xs px-1"
                          title="Slett fil"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                    <audio controls className="w-full h-6" src={`/api/music/${encodeURIComponent(m.filename)}`} onClick={(e) => e.stopPropagation()} />
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Outro card */}
          <div className="border border-gray-200 rounded-lg p-4">
            <label className="flex items-center justify-between cursor-pointer">
              <div>
                <span className="text-sm font-medium text-gray-900">Avslutt med logo-plakat</span>
                <p className="text-xs text-gray-400 mt-0.5">
                  {productProfile?.logo_url
                    ? 'Legger til 3 sek. brandingplakat fra produktprofilen'
                    : 'Sett logo i produktprofilen for å aktivere dette'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIncludeOutroCard((v) => !v)}
                disabled={!productProfile?.logo_url}
                className={`relative w-10 h-6 rounded-full transition-colors flex-shrink-0 ${
                  includeOutroCard && productProfile?.logo_url ? 'bg-[#7C3AED]' : 'bg-gray-200'
                } disabled:opacity-40`}
              >
                <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                  includeOutroCard && productProfile?.logo_url ? 'translate-x-4' : ''
                }`} />
              </button>
            </label>
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
