'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { useTranslations } from 'next-intl'

const NORWEGIAN_VOICES = [
  { id: 'nhvaqgRyAq6BmFs3WcdX', name: 'Øyvind', desc: 'Dyp og rolig', preview: 'https://storage.googleapis.com/eleven-public-prod/database/workspace/7dc5c03caf8f40daa575fa9eacbf3de8/voices/nhvaqgRyAq6BmFs3WcdX/Z8yVliHOyn9eSmt4YEVw.mp3' },
  { id: 's2xtA7B2CTXPPlJzch1v', name: 'Dennis', desc: 'Klar og behagelig', preview: 'https://storage.googleapis.com/eleven-public-prod/database/workspace/15af1c0d0dcd479cb8376a767ab07b4c/voices/s2xtA7B2CTXPPlJzch1v/YB9DE4weRg6BTei8hVZ5.mp3' },
  { id: '2dhHLsmg0MVma2t041qT', name: 'Johannes', desc: 'Selvsikker', preview: 'https://storage.googleapis.com/eleven-public-prod/custom/voices/2dhHLsmg0MVma2t041qT/fX3l7ljt7bx6zRPz8VdC.mp3' },
  { id: 'BGEU6wFi2uNm6Kje1Yhk', name: 'Maja', desc: 'Nordisk, dramatisk', preview: 'https://storage.googleapis.com/eleven-public-prod/database/workspace/ed9b05e6324c457685490352e9a1ec90/voices/BGEU6wFi2uNm6Kje1Yhk/gCIHS9pPkrtwiAjN4VgG.mp3' },
  { id: 'CMbvLbbccSd611KtwxV3', name: 'Robert', desc: 'Oslo', preview: 'https://storage.googleapis.com/eleven-public-prod/database/workspace/2461cf568dc042a3bbfbf75522203b35/voices/CMbvLbbccSd611KtwxV3/fabf86a6-90db-42c2-9993-47fff3f73a80.mp3' },
  { id: 'vUmLiNBm6MDcy1NUHaVr', name: 'Helge', desc: '', preview: 'https://storage.googleapis.com/eleven-public-prod/database/workspace/3690d7df74c84d8880e0e0d0641de7f2/voices/vUmLiNBm6MDcy1NUHaVr/6JBvRVvXcssLtXlaqLg1.mp3' },
  { id: 'uNsWM1StCcpydKYOjKyu', name: 'Mia', desc: 'Norsk kvinne', preview: 'https://storage.googleapis.com/eleven-public-prod/database/workspace/a2175a4ce5a74c88868dd9d4a000c9a6/voices/uNsWM1StCcpydKYOjKyu/868f87d5-7724-4786-a7fa-a48e01b2ba54.mp3' },
]

const VIDEO_FORMATS = [
  { value: '9:16', label: 'Portrait (TikTok)', color: 'blue' },
  { value: '16:9', label: 'Landscape', color: 'blue' },
  { value: '1:1', label: 'Square', color: 'blue' },
]

export default function NewDraftPage() {
  const router = useRouter()
  const params = useParams()
  const t = useTranslations('newDraft')
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
  const [outroJingle, setOutroJingle] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [playingVoice, setPlayingVoice] = useState<string | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)

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
      setError(t('errorNoTitle'))
      return
    }
    if (!topic.trim()) {
      setError(t('errorNoTopic'))
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
        throw new Error(data.error || 'Error creating draft')
      }

      const data = await response.json()
      router.push(`/dashboard/products/${productId}/video/draft/${data.draftId}?imageStyle=${imageStyle}&format=${encodeURIComponent(videoFormat)}&outro=${includeOutroCard ? '1' : '0'}&jingle=${encodeURIComponent(outroJingle || '')}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[var(--paper)]">
      <div className="max-w-2xl mx-auto px-4 py-8">
        {/* Header */}
        <Link href={`/dashboard/products/${productId}`} className="text-[#C5451B] hover:text-[#1C1A16] mb-4 inline-block">
          {t('backToProduct')}
        </Link>

        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">{t('title')}</h1>
          <p className="text-gray-600 mt-2">{t('subtitle')}</p>
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
                {t('sectionBasic')}
              </h2>
              <div className="space-y-4">
                {/* Title */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">{t('titleLabel')}</label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#C5451B] focus:border-transparent"
                    placeholder={t('titlePlaceholder')}
                  />
                </div>

                {/* Topic */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">{t('topicLabel')}</label>
                  <textarea
                    value={topic}
                    onChange={(e) => setTopic(e.target.value)}
                    placeholder={t('topicPlaceholder')}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#C5451B] focus:border-transparent"
                    rows={4}
                  />
                </div>

                {/* Segment Count */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">{t('segmentsLabel')}</label>
                  <select
                    value={segmentCount}
                    onChange={(e) => setSegmentCount(Number(e.target.value))}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#C5451B] focus:border-transparent"
                  >
                    <option value={2}>{t('seg2')}</option>
                    <option value={3}>{t('seg3')}</option>
                    <option value={4}>{t('seg4')}</option>
                    <option value={5}>{t('seg5')}</option>
                    <option value={6}>{t('seg6')}</option>
                  </select>
                </div>

                {/* Target Audience */}
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">{t('targetAudienceLabel')}</label>
                  <input
                    type="text"
                    value={targetAudience}
                    onChange={(e) => setTargetAudience(e.target.value)}
                    placeholder={t('targetAudiencePlaceholder')}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#C5451B] focus:border-transparent"
                  />
                </div>

                {/* Problem */}
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">{t('problemLabel')}</label>
                  <input
                    type="text"
                    value={problem}
                    onChange={(e) => setProblem(e.target.value)}
                    placeholder={t('problemPlaceholder')}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#C5451B] focus:border-transparent"
                  />
                </div>

                {/* CTA */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">{t('ctaLabel')}</label>
                  <input
                    type="text"
                    value={cta}
                    onChange={(e) => setCta(e.target.value)}
                    placeholder={t('ctaPlaceholder')}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#C5451B] focus:border-transparent"
                  />
                </div>
              </div>
            </div>

            {/* INNHOLD Section */}
            <div>
              <h2 className="text-xs font-bold text-gray-900 uppercase tracking-wide mb-4 block">
                {t('sectionContent')}
              </h2>
              <div className="space-y-4">
                {/* Voice */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">{t('voiceLabel')}</label>
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
                              ? 'border-[#C5451B] bg-[#F8E7DB]'
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
                              isPlaying ? 'bg-[#C5451B] text-white' : 'bg-gray-100 hover:bg-[#F8E7DB] text-gray-600'
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
                            <div className={`text-sm font-medium leading-tight ${isSelected ? 'text-[#C5451B]' : 'text-gray-900'}`}>{v.name}</div>
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
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-[#C5451B] focus:border-transparent"
                  />
                  <p className="text-xs text-gray-400 mt-1">
                    Velg stemme ovenfor, eller lim inn ID direkte fra{' '}
                    <a href="https://elevenlabs.io/voice-library" target="_blank" rel="noopener noreferrer" className="text-[#C5451B] hover:underline">
                      ElevenLabs voice library →
                    </a>
                  </p>
                </div>

                {/* Tone */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-3">{t('toneLabel')}</label>
                  <div className="flex gap-2 flex-wrap">
                    {[
                      { key: 'Vennlig', label: t('toneFriendly') },
                      { key: 'Energisk', label: t('toneEnergetic') },
                      { key: 'Profesjonell', label: t('toneProfessional') },
                      { key: 'Rolig', label: t('toneCalm') },
                    ].map(({ key, label }) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setTone(key)}
                        className={`px-4 py-2 rounded-full border text-sm font-medium transition-colors ${
                          tone === key
                            ? 'bg-green-600 text-white border-green-600'
                            : 'bg-white text-gray-700 border-gray-300 hover:border-gray-400'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Perspective */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-3">{t('perspectiveLabel')}</label>
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
                      {t('perspectiveYou')} <span className="text-xs opacity-70 ml-1">{t('perspectiveYouExample')}</span>
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
                      {t('perspectiveI')} <span className="text-xs opacity-70 ml-1">{t('perspectiveIExample')}</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* MEDIA Section */}
            <div>
              <h2 className="text-xs font-bold text-gray-900 uppercase tracking-wide mb-4 block">
                {t('sectionMedia')}
              </h2>
              <div className="space-y-4">
                {/* Video Format */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-3">{t('videoFormatLabel')}</label>
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

                {/* Music */}
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-1">{t('musicLabel')}</label>
                  <p className="text-xs text-gray-500 mb-3">{t('musicHint')}</p>

                  {/* Upload form */}
                  <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 mb-4">
                    <div className="grid grid-cols-2 gap-3">
                      <label className="block">
                        <span className="text-xs font-medium text-gray-700 block mb-1">{t('musicFolder')}</span>
                        <select
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                          value={selectedMusicFolder}
                          onChange={(e) => setSelectedMusicFolder(e.target.value)}
                        >
                          <option value="global">{t('musicFolderGlobal')}</option>
                          <option value="bildeal">BilDeal</option>
                          <option value="reforhandle">Reforhandle</option>
                          <option value="singlepicker">SinglePicker</option>
                        </select>
                      </label>
                      <label className="block">
                        <span className="text-xs font-medium text-gray-700 block mb-1">{t('uploadMP3')}</span>
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
                              alert(t('alertMp3Only'))
                              inputElement.value = ''
                              return
                            }

                            const maxSize = 4 * 1024 * 1024
                            if (file.size > maxSize) {
                              alert(t('alertFileTooLarge', { size: (file.size / 1024 / 1024).toFixed(1) }))
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
                                alert(t('alertUploaded'))
                                inputElement.value = ''
                              } else {
                                const error = await res.text()
                                console.error('[music upload] Server error:', error)
                                alert(`Upload failed: ${error}`)
                                inputElement.value = ''
                              }
                            } catch (err) {
                              console.error('[music upload] Error:', err)
                              alert('Upload failed: ' + (err instanceof Error ? err.message : 'Unknown error'))
                              inputElement.value = ''
                            }
                          }}
                          className="block w-full text-sm text-gray-500 file:mr-2 file:rounded file:border-0 file:bg-[#C5451B] file:px-2 file:py-1 file:text-xs file:font-medium file:text-white hover:file:bg-[#1C1A16]"
                        />
                      </label>
                    </div>
                  </div>

                  {musicLibrary.length > 0 ? (
                    <div className="grid gap-2">
                      {musicLibrary.map((music) => (
                        <div
                          key={music.filename}
                          onClick={() => setMusicFile(music.filename)}
                          className={`text-left p-3 border-2 rounded-lg transition-colors cursor-pointer ${
                            musicFile === music.filename
                              ? 'border-green-500 bg-green-50'
                              : 'border-gray-300 hover:border-blue-500 hover:bg-blue-50'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <div className="font-medium text-gray-900">{music.name}</div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs bg-gray-200 text-gray-700 px-2 py-1 rounded">
                                {music.folder || 'global'}
                              </span>
                              <button
                                type="button"
                                onClick={async (e) => {
                                  e.stopPropagation()
                                  if (!confirm(`Slett «${music.name}»?`)) return
                                  await fetch(`/api/music/${encodeURIComponent(music.filename)}`, { method: 'DELETE' })
                                  if (musicFile === music.filename) setMusicFile(null)
                                  const data = await fetch('/api/music').then(r => r.json())
                                  if (data.files) setMusicLibrary(data.files)
                                }}
                                className="text-gray-300 hover:text-red-500 transition-colors text-xs px-1"
                                title="Slett fil"
                              >
                                ✕
                              </button>
                            </div>
                          </div>
                          <div className="text-xs text-gray-500 mt-1">
                            {(music.size / 1024 / 1024).toFixed(1)}MB
                          </div>
                          <audio controls preload="none" className="mt-2 w-full" src={`/api/music/${encodeURIComponent(music.filename)}`} onClick={(e) => e.stopPropagation()} />
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-gray-500 text-sm">{t('loadingMusic')}</p>
                  )}
                </div>
              </div>
            </div>

            {/* BILDESTIL Section */}
            <div>
              <h2 className="text-xs font-bold text-gray-900 uppercase tracking-wide mb-4 block">
                {t('sectionImageStyle')}
              </h2>
              <div className="flex flex-wrap gap-2">
                {[
                  { id: 'editorial', label: t('styleEditorialLabel'), desc: t('styleEditorialDesc') },
                  { id: 'tech',      label: t('styleTechLabel'),      desc: t('styleTechDesc') },
                  { id: 'warm',      label: t('styleWarmLabel'),      desc: t('styleWarmDesc') },
                  { id: 'minimal',   label: t('styleMinimalLabel'),   desc: t('styleMinimalDesc') },
                  { id: 'painterly', label: t('stylePainterlyLabel'), desc: t('stylePainterlyDesc') },
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
                {t('sectionOutro')}
              </h2>
              <label className="flex items-start gap-3 cursor-pointer p-4 rounded-lg border border-gray-200 hover:border-gray-300">
                <input
                  type="checkbox"
                  checked={includeOutroCard}
                  onChange={(e) => setIncludeOutroCard(e.target.checked)}
                  className="mt-1 h-4 w-4 text-[#C5451B] border-gray-300 rounded focus:ring-[#C5451B]"
                />
                <div>
                  <div className="text-sm font-medium text-gray-900">
                    {t('outroLabel')}
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    {t('outroDesc')}
                  </div>
                </div>
              </label>

              {includeOutroCard && (
                <div className="mt-3 pl-4">
                  <label className="block text-xs font-medium text-gray-700 mb-1">Jingle på sluttplakaten (valgfritt)</label>
                  <select
                    value={outroJingle || ''}
                    onChange={(e) => setOutroJingle(e.target.value || null)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  >
                    <option value="">Ingen jingle</option>
                    {musicLibrary.filter((m) => m.folder === 'jingles').map((j) => (
                      <option key={j.filename} value={j.filename}>{j.name}</option>
                    ))}
                  </select>
                  {outroJingle && (
                    <audio controls preload="none" className="mt-2 w-full" src={`/api/music/${encodeURIComponent(outroJingle)}`} />
                  )}
                  <p className="text-xs text-gray-400 mt-1">Spilles på sluttplakaten. Last opp flere jingles via radio-siden (mappe «jingles»).</p>
                </div>
              )}
            </div>

            {/* Buttons */}
            <div className="flex gap-3 pt-4">
              <button
                type="submit"
                disabled={loading}
                className={`flex-1 px-6 py-3 rounded-lg font-semibold text-white transition-colors ${
                  loading ? 'bg-gray-400 cursor-not-allowed' : 'bg-[#C5451B] hover:bg-[#1C1A16]'
                }`}
              >
                {loading ? t('creatingDraft') : t('createDraft')}
              </button>

              <button
                type="button"
                onClick={() => router.back()}
                className="px-6 py-3 rounded-lg font-semibold text-gray-900 bg-gray-200 hover:bg-gray-300 transition-colors"
              >
                {t('cancel')}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
