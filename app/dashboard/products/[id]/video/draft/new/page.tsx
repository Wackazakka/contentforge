'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'

const NORWEGIAN_VOICES = [
  { id: 'nhvaqgRyAq6BmFs3WcdX', name: 'Norsk stemme 1' },
  { id: 's2xtA7B2CTXPPlJzch1v', name: 'Norsk stemme 2' },
  { id: '2dhHLsmg0MVma2t041qT', name: 'Norsk stemme 3' },
  { id: 'BGEU6wFi2uNm6Kje1Yhk', name: 'Norsk stemme 4' },
  { id: 'CMbvLbbccSd611KtwxV3', name: 'Norsk stemme 5' },
  { id: 'vUmLiNBm6MDcy1NUHaVr', name: 'Norsk stemme 6' },
  { id: 'uNsWM1StCcpydKYOjKyu', name: 'Norsk stemme 7' },
]

const VIDEO_FORMATS = [
  { value: '9:16', label: 'Portrait (TikTok)', color: 'blue' },
  { value: '16:9', label: 'Landscape', color: 'blue' },
  { value: '1:1', label: 'Square', color: 'blue' },
]

export default function NewDraftPage() {
  const router = useRouter()
  const params = useParams()
  const productId = params?.id as string

  const [topic, setTopic] = useState('')
  const [title, setTitle] = useState('')
  const [segmentCount, setSegmentCount] = useState(4)
  const [targetAudience, setTargetAudience] = useState('')
  const [problem, setProblem] = useState('')
  const [voiceId, setVoiceId] = useState('nhvaqgRyAq6BmFs3WcdX')
  const [tone, setTone] = useState('Energisk')
  const [perspective, setPerspective] = useState<'du' | 'jeg'>('du')
  const [cta, setCta] = useState('')
  const [videoFormat, setVideoFormat] = useState('9:16')
  const [musicStyle, setMusicStyle] = useState('Upbeat')
  const [musicFile, setMusicFile] = useState<string | null>(null)
  const [musicLibrary, setMusicLibrary] = useState<Array<{ filename: string; name: string; folder?: string; url: string; size: number }>>([])
  const [selectedMusicFolder, setSelectedMusicFolder] = useState('global')
  const [imageStyle, setImageStyle] = useState('editorial')
  const [includeOutroCard, setIncludeOutroCard] = useState(true)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchMusic = async () => {
      try {
        const res = await fetch('/api/music')
        const data = await res.json()
        console.log('[music] fetched:', data.files?.length, 'files')
        setMusicLibrary(data.files || [])
      } catch (err) {
        console.error('Failed to fetch music list:', err)
      }
    }
    fetchMusic()
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!title.trim()) {
      setError('Vennligst skriv inn en tittel')
      return
    }
    if (!topic.trim()) {
      setError('Vennligst skriv inn et tema')
      return
    }

    try {
      setLoading(true)
      setError(null)

      const campaignId = `campaign-${Date.now()}`

      const response = await fetch('/api/content/produce/draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId,
          campaignId,
          topic,
          title,
          segmentCount,
          targetAudience,
          problem,
          voiceId,
          tone,
          perspective,
          cta,
          videoFormat,
          musicStyle,
          musicFile,
          includeOutroCard,
        }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Feil ved opprettelse av draft')
      }

      const data = await response.json()
      router.push(`/dashboard/products/${productId}/video/draft/${data.draftId}?imageStyle=${imageStyle}&format=${encodeURIComponent(videoFormat)}&outro=${includeOutroCard ? '1' : '0'}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Noe gikk galt')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-cf-bg">
      <div className="max-w-2xl mx-auto px-4 py-8">
        {/* Header */}
        <Link href={`/dashboard/products/${productId}`} className="text-blue-600 hover:text-blue-700 mb-4 inline-block">
          ← Tilbake til produkt
        </Link>

        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Opprett ny video-draft</h1>
          <p className="text-gray-600 mt-2">Definer tema og innstillinger for videoen</p>
        </div>

        {/* Form */}
        <div className="bg-white rounded-lg border border-gray-200 p-8 space-y-8">
          <form onSubmit={handleSubmit} className="space-y-8">
            {/* Error */}
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
                {error}
              </div>
            )}

            {/* GRUNNINFO Section */}
            <div>
              <h2 className="text-xs font-bold text-gray-900 uppercase tracking-wide mb-4 block">
                Grunninfo
              </h2>
              <div className="space-y-4">
                {/* Title */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Tittel på video *</label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="F.eks. Bruktbil-tips vår 2026"
                  />
                </div>

                {/* Topic */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Tema for video *</label>
                  <textarea
                    value={topic}
                    onChange={(e) => setTopic(e.target.value)}
                    placeholder="F.eks. Hvordan velge riktig bil for familiebruk"
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    rows={4}
                  />
                </div>

                {/* Segment Count */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Antall segmenter</label>
                  <select
                    value={segmentCount}
                    onChange={(e) => setSegmentCount(Number(e.target.value))}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value={2}>2 segmenter</option>
                    <option value={3}>3 segmenter</option>
                    <option value={4}>4 segmenter (anbefalt)</option>
                    <option value={5}>5 segmenter</option>
                    <option value={6}>6 segmenter</option>
                  </select>
                </div>

                {/* Target Audience */}
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">Målgruppe</label>
                  <input
                    type="text"
                    value={targetAudience}
                    onChange={(e) => setTargetAudience(e.target.value)}
                    placeholder="F.eks. Huseiere, 35-55 år, bor i Norge"
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                {/* Problem */}
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">Problem som løses</label>
                  <input
                    type="text"
                    value={problem}
                    onChange={(e) => setProblem(e.target.value)}
                    placeholder="F.eks. Betaler for mye på strøm og internett"
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                {/* CTA */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Call-to-Action (CTA)</label>
                  <input
                    type="text"
                    value={cta}
                    onChange={(e) => setCta(e.target.value)}
                    placeholder="F.eks. Besøk nettstedet vårt i dag!"
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              </div>
            </div>

            {/* INNHOLD Section */}
            <div>
              <h2 className="text-xs font-bold text-gray-900 uppercase tracking-wide mb-4 block">
                Innhold
              </h2>
              <div className="space-y-4">
                {/* Voice */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Stemme</label>
                  <select
                    value={voiceId}
                    onChange={(e) => setVoiceId(e.target.value)}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    {NORWEGIAN_VOICES.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Tone */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-3">Tone</label>
                  <div className="flex gap-2 flex-wrap">
                    {['Vennlig', 'Energisk', 'Profesjonell', 'Rolig'].map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setTone(t)}
                        className={`px-4 py-2 rounded-full border text-sm font-medium transition-colors ${
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

                {/* Perspective */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-3">Fortellerperspektiv</label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setPerspective('du')}
                      className={`px-4 py-2 rounded-full border text-sm font-medium transition-colors ${
                        perspective === 'du'
                          ? 'bg-green-600 text-white border-green-600'
                          : 'bg-white text-gray-700 border-gray-300 hover:border-gray-400'
                      }`}
                    >
                      Du-form <span className="text-xs opacity-70 ml-1">«Du gjør dette…»</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setPerspective('jeg')}
                      className={`px-4 py-2 rounded-full border text-sm font-medium transition-colors ${
                        perspective === 'jeg'
                          ? 'bg-green-600 text-white border-green-600'
                          : 'bg-white text-gray-700 border-gray-300 hover:border-gray-400'
                      }`}
                    >
                      Jeg-form <span className="text-xs opacity-70 ml-1">«Jeg gjorde dette…»</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* MEDIA Section */}
            <div>
              <h2 className="text-xs font-bold text-gray-900 uppercase tracking-wide mb-4 block">
                Media
              </h2>
              <div className="space-y-4">
                {/* Video Format */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-3">Videoformat</label>
                  <div className="flex gap-2 flex-wrap">
                    {VIDEO_FORMATS.map((fmt) => (
                      <button
                        key={fmt.value}
                        type="button"
                        onClick={() => setVideoFormat(fmt.value)}
                        className={`px-4 py-2 rounded-full border text-sm font-medium transition-colors ${
                          videoFormat === fmt.value
                            ? 'bg-green-600 text-white border-green-600'
                            : 'bg-white text-gray-700 border-gray-300 hover:border-gray-400'
                        }`}
                      >
                        {fmt.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Music Style */}
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">Musikk-stil</label>
                  <div className="flex gap-2">
                    {['Upbeat', 'Minimal', 'Cinematisk'].map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setMusicStyle(s)}
                        className={`px-4 py-2 rounded-full border text-sm font-medium transition-colors ${
                          musicStyle === s
                            ? 'bg-green-600 text-white border-green-600'
                            : 'bg-white text-gray-700 border-gray-300 hover:border-gray-400'
                        }`}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Music */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-3">Bakgrunnsmusikk</label>
                  
                  {/* Upload form */}
                  <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 mb-4">
                    <div className="grid grid-cols-2 gap-3">
                      <label className="block">
                        <span className="text-xs font-medium text-gray-700 block mb-1">Mappe</span>
                        <select
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                          value={selectedMusicFolder}
                          onChange={(e) => setSelectedMusicFolder(e.target.value)}
                        >
                          <option value="global">Global (alle produkter)</option>
                          <option value="bildeal">BilDeal</option>
                          <option value="reforhandle">Reforhandle</option>
                          <option value="singlepicker">SinglePicker</option>
                        </select>
                      </label>
                      <label className="block">
                        <span className="text-xs font-medium text-gray-700 block mb-1">Fil</span>
                        <input
                          type="file"
                          accept=".mp3"
                          onChange={async (e) => {
                            const inputElement = e.currentTarget
                            if (!inputElement) {
                              console.error('[music upload] Input element is null')
                              return
                            }
                            
                            const file = inputElement.files?.[0]
                            if (!file) return
                            
                            if (!file.name.toLowerCase().endsWith('.mp3')) {
                              alert('Kun MP3-filer er tillatt')
                              inputElement.value = ''
                              return
                            }
                            
                            const maxSize = 4 * 1024 * 1024
                            if (file.size > maxSize) {
                              alert(`Filen er for stor (${(file.size / 1024 / 1024).toFixed(1)}MB). Maksimum er 4MB.`)
                              inputElement.value = ''
                              return
                            }
                            
                            const formData = new FormData()
                            formData.append('file', file)
                            
                            try {
                              const res = await fetch('/api/music/upload?' + new URLSearchParams({ folder: selectedMusicFolder }).toString(), {
                                method: 'POST',
                                body: formData,
                              })
                              if (res.ok) {
                                const data = await fetch('/api/music').then(r => r.json())
                                if (data.files) setMusicLibrary(data.files)
                                alert('Musikk lastet opp!')
                                inputElement.value = ''
                              } else {
                                const error = await res.text()
                                console.error('[music upload] Server error:', error)
                                alert(`Upload feilet: ${error}`)
                                inputElement.value = ''
                              }
                            } catch (err) {
                              console.error('[music upload] Error:', err)
                              alert('Upload feilet: ' + (err instanceof Error ? err.message : 'Ukjent feil'))
                              inputElement.value = ''
                            }
                          }}
                          className="block w-full text-sm text-gray-500 file:mr-2 file:rounded file:border-0 file:bg-blue-600 file:px-2 file:py-1 file:text-xs file:font-medium file:text-white hover:file:bg-blue-500"
                        />
                      </label>
                    </div>
                  </div>

                  {musicLibrary.length > 0 ? (
                    <div className="grid gap-2">
                      {musicLibrary.map((music) => (
                        <button
                          key={music.filename}
                          type="button"
                          onClick={() => setMusicFile(music.filename)}
                          className={`text-left p-3 border-2 rounded-lg transition-colors ${
                            musicFile === music.filename
                              ? 'border-green-500 bg-green-50'
                              : 'border-gray-300 hover:border-blue-500 hover:bg-blue-50'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <div className="font-medium text-gray-900">{music.name}</div>
                            <span className="text-xs bg-gray-200 text-gray-700 px-2 py-1 rounded">
                              {music.folder || 'global'}
                            </span>
                          </div>
                          <div className="text-xs text-gray-500 mt-1">
                            {(music.size / 1024 / 1024).toFixed(1)}MB
                          </div>
                          <audio controls className="mt-2 w-full h-6" src={`/api/music/${encodeURIComponent(music.filename)}`} />
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="text-gray-500 text-sm">Laster musikk-bibliotek...</p>
                  )}
                </div>
              </div>
            </div>

            {/* BILDESTIL Section */}
            <div>
              <h2 className="text-xs font-bold text-gray-900 uppercase tracking-wide mb-4 block">
                Bildestil
              </h2>
              <div className="flex flex-wrap gap-2">
                {[
                  { id: 'editorial', label: '📸 Editorial', desc: 'Høykontrast foto' },
                  { id: 'tech',      label: '🖥️ Tech',      desc: '3D CGI render' },
                  { id: 'warm',      label: '🌅 Varm',      desc: 'Livsstilsfoto' },
                  { id: 'minimal',   label: '⬜ Minimal',   desc: 'Ryddig og stille' },
                  { id: 'painterly', label: '🎨 Maleri',    desc: 'Kunstnerisk' },
                ].map(({ id, label, desc }) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setImageStyle(id)}
                    className={`px-4 py-3 rounded-lg border text-sm font-medium transition-colors ${
                      imageStyle === id
                        ? 'border-blue-600 bg-blue-50 text-blue-700'
                        : 'border-gray-200 bg-white text-gray-600 hover:border-gray-400'
                    }`}
                  >
                    <span>{label}</span>
                    <span className="block text-xs font-normal text-gray-400 mt-0.5">{desc}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* OUTRO Section */}
            <div>
              <h2 className="text-xs font-bold text-gray-900 uppercase tracking-wide mb-4 block">
                Avslutning
              </h2>
              <label className="flex items-start gap-3 cursor-pointer p-4 rounded-lg border border-gray-200 hover:border-gray-300">
                <input
                  type="checkbox"
                  checked={includeOutroCard}
                  onChange={(e) => setIncludeOutroCard(e.target.checked)}
                  className="mt-1 h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                />
                <div>
                  <div className="text-sm font-medium text-gray-900">
                    Avslutt med produktlenke 🔗
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    Legger til 3 sekunder branded sluttbilde med produktets nettside, logo og CTA.
                  </div>
                </div>
              </label>
            </div>

            {/* Buttons */}
            <div className="flex gap-3 pt-4">
              <button
                type="submit"
                disabled={loading}
                className={`flex-1 px-6 py-3 rounded-lg font-semibold text-white transition-colors ${
                  loading ? 'bg-gray-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'
                }`}
              >
                {loading ? '⏳ Genererer draft...' : '🎬 Opprett draft'}
              </button>

              <button
                type="button"
                onClick={() => router.back()}
                className="px-6 py-3 rounded-lg font-semibold text-gray-900 bg-gray-200 hover:bg-gray-300 transition-colors"
              >
                Avbryt
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
