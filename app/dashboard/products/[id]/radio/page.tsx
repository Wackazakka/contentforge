'use client'

import { useState, useEffect, useRef } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { getSupabase } from '@/lib/supabaseClient'
import { useTenant } from '@/lib/tenantContext'
import { ownTracks, sharedMusic, tracksFolder, TRACK_MAX_BYTES } from '@/lib/musicLibrary'
import { uploadTrack } from '@/lib/uploadTrack'

const DEFAULT_VOICE_ID = 'nhvaqgRyAq6BmFs3WcdX'

const EMOTIONS = [
  { id: 'nøytral',      label: 'Nøytral',      emoji: '😐' },
  { id: 'entusiastisk', label: 'Entusiastisk',  emoji: '🔥' },
  { id: 'glad',         label: 'Glad',          emoji: '😊' },
  { id: 'trist',        label: 'Trist',         emoji: '😢' },
  { id: 'nølende',      label: 'Nølende',       emoji: '🤔' },
  { id: 'rolig',        label: 'Rolig',         emoji: '😌' },
  { id: 'dramatisk',    label: 'Dramatisk',     emoji: '🎭' },
]

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
  { value: '15', label: '15 sek', hint: '~35 ord' },
  { value: '30', label: '30 sek', hint: '~70 ord' },
  { value: '60', label: '60 sek', hint: '~135 ord' },
]

export default function RadioAdPage() {
  const params = useParams()
  const productId = params.id as string
  const tenantInfo = useTenant()

  const [campaignName, setCampaignName] = useState('')
  const [topic, setTopic] = useState('')
  const [targetAudience, setTargetAudience] = useState('')
  const [problem, setProblem] = useState('')
  const [cta, setCta] = useState('')
  const [tone, setTone] = useState('Energisk')
  const [duration, setDuration] = useState('30')
  const [perspective, setPerspective] = useState<'du' | 'jeg'>('du')

  const [script, setScript] = useState('')
  const [voiceId, setVoiceId] = useState(DEFAULT_VOICE_ID)
  const [musicFile, setMusicFile] = useState<string | null>(null)
  const [musicLibrary, setMusicLibrary] = useState<Array<{ filename: string; name: string; folder?: string; url: string; size: number }>>([])
  const [selectedMusicFolder, setSelectedMusicFolder] = useState('global')
  const [jingleFile, setJingleFile] = useState<string | null>(null)

  const [generating, setGenerating] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [jobId, setJobId] = useState<string | null>(null)
  const [playingVoice, setPlayingVoice] = useState<string | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [emotion, setEmotion] = useState('nøytral')

  type Segment = { text: string; audioUrl: string | null; audioBlob: Blob | null; generating: boolean; emotion: string }
  const [segments, setSegments] = useState<Segment[]>([])
  const [segmentMode, setSegmentMode] = useState(false)
  const [uploadingSegments, setUploadingSegments] = useState(false)

  const splitToSegments = (text: string, defaultEmotion: string): Segment[] => {
    const sentences = text.match(/[^.!?]+[.!?]+(?:\s|$)/g) || [text]
    const pairs: Segment[] = []
    for (let i = 0; i < sentences.length; i += 2) {
      const seg = [sentences[i], sentences[i + 1]].filter(Boolean).join(' ').trim()
      if (seg) pairs.push({ text: seg, emotion: defaultEmotion, audioUrl: null, audioBlob: null, generating: false })
    }
    return pairs
  }

  const generateSegmentAudio = async (index: number) => {
    const seg = segments[index]
    if (!seg || seg.generating) return
    setSegments(prev => prev.map((s, i) => i === index ? { ...s, generating: true } : s))
    try {
      const res = await fetch('/api/avatar/preview-voice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ script: seg.text, voiceId, emotion: seg.emotion }),
      })
      if (!res.ok) throw new Error('Feilet')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      setSegments(prev => prev.map((s, i) => i === index ? { ...s, generating: false, audioBlob: blob, audioUrl: url } : s))
    } catch {
      setSegments(prev => prev.map((s, i) => i === index ? { ...s, generating: false } : s))
    }
  }

  const refreshMusicLibrary = () =>
    fetch('/api/music').then(r => r.json()).then(d => setMusicLibrary(d.files || [])).catch(() => {})

  useEffect(() => { refreshMusicLibrary() }, [])

  const handleGenerateScript = async () => {
    if (!topic.trim()) { setError('Fyll inn emnet først.'); return }
    setError(null)
    setGenerating(true)
    try {
      const res = await fetch('/api/content/produce/avatar-script', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic, targetAudience, problem, tone, cta, duration, perspective }),
      })
      if (!res.ok) throw new Error((await res.json()).error || 'Feil ved manus-generering')
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
    if (!script.trim()) { setError('Manus er påkrevd.'); return }
    setLoading(true)
    try {
      const { data: { session } } = await getSupabase().auth.getSession()
      if (!session?.access_token) { setError('Du er ikke innlogget.'); setLoading(false); return }

      let audioSegmentUrls: string[] | null = null
      let segmentEmotions: string[] | null = null
      if (segmentMode && segments.length > 0 && segments.every(s => s.audioBlob)) {
        setUploadingSegments(true)
        try {
          const tempId = crypto.randomUUID()
          audioSegmentUrls = []
          segmentEmotions = segments.map(s => s.emotion)
          for (let i = 0; i < segments.length; i++) {
            const fd = new FormData()
            fd.append('file', segments[i].audioBlob!, `seg_${i}.mp3`)
            fd.append('jobId', tempId)
            fd.append('segmentIndex', String(i))
            const r = await fetch('/api/avatar/upload-audio', { method: 'POST', body: fd })
            const d = await r.json()
            if (!r.ok) throw new Error(d.error || 'Segment-opplasting feilet')
            audioSegmentUrls.push(d.url)
          }
        } finally {
          setUploadingSegments(false)
        }
      }

      const res = await fetch('/api/productions/radio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({
          productId,
          campaignName: campaignName || topic || 'Radioreklame',
          script,
          voiceId: voiceId || DEFAULT_VOICE_ID,
          musicFile: musicFile || null,
          jingleFile: jingleFile || null,
          audioSegmentUrls,
          segmentEmotions,
          emotion,
        }),
      })
      if (!res.ok) throw new Error((await res.json()).error || 'Feil ved oppstart')
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
            <div className="text-4xl mb-4">🎙️</div>
            <h2 className="text-xl font-semibold text-green-800 mb-2">Produksjon startet!</h2>
            <p className="text-green-700 text-sm mb-1">
              Job ID: <code className="bg-green-100 px-1 rounded font-mono">{jobId}</code>
            </p>
            <p className="text-green-700 text-sm mb-6">
              MP3-filen er klar om ca. 30–60 sekunder. Last den ned fra{' '}
              <Link href={`/dashboard/products/${productId}`} className="underline font-medium">produktsiden</Link>.
            </p>
            <button onClick={() => { setJobId(null); setScript(''); setTopic('') }} className="text-sm text-[var(--ember-deep)] hover:underline">
              Lag en ny radioreklame
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
          <Link href={`/dashboard/products/${productId}`} className="text-[var(--ember-deep)] hover:text-[#1C1A16] text-sm mb-4 inline-block">
            ← Tilbake til produkt
          </Link>
          <h1 className="text-3xl font-bold text-gray-900">Radioreklame</h1>
          <p className="text-gray-500 mt-1">AI skriver manus, ElevenLabs leser det opp — output er en MP3-fil klar til nedlasting.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">

          {/* Section 1: Content */}
          <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
            <h2 className="text-xs font-bold text-gray-900 uppercase tracking-wide">Innhold</h2>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Navn på produksjon (valgfritt)</label>
              <input type="text" value={campaignName} onChange={(e) => setCampaignName(e.target.value)}
                placeholder="F.eks. «Sommarkampanje mai»"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--ember-deep)]" />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Emne / budskap <span className="text-red-500">*</span>
              </label>
              <textarea value={topic} onChange={(e) => setTopic(e.target.value)} rows={3}
                placeholder="F.eks. «Sommerens beste biltilbud — 0% rente og gratis service i ett år»"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--ember-deep)] resize-none" />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Målgruppe</label>
                <input type="text" value={targetAudience} onChange={(e) => setTargetAudience(e.target.value)}
                  placeholder="F.eks. «Bilkjøpere 30–55 år»"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--ember-deep)]" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Call-to-action</label>
                <input type="text" value={cta} onChange={(e) => setCta(e.target.value)}
                  placeholder="F.eks. «Ring oss på 815 00 000»"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--ember-deep)]" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Tone</label>
                <div className="flex flex-wrap gap-2">
                  {TONES.map((t) => (
                    <button key={t} type="button" onClick={() => setTone(t)}
                      className={`px-3 py-1.5 rounded-full border text-sm font-medium transition-colors ${
                        tone === t ? 'bg-green-600 text-white border-green-600' : 'bg-white text-gray-700 border-gray-300 hover:border-gray-400'
                      }`}>{t}</button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Perspektiv</label>
                <div className="flex gap-2">
                  {(['du', 'jeg'] as const).map((p) => (
                    <button key={p} type="button" onClick={() => setPerspective(p)}
                      className={`px-3 py-1.5 rounded-full border text-sm font-medium transition-colors ${
                        perspective === p ? 'bg-green-600 text-white border-green-600' : 'bg-white text-gray-700 border-gray-300 hover:border-gray-400'
                      }`}>{p === 'du' ? '"Du"' : '"Jeg"'}</button>
                  ))}
                </div>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Lengde</label>
              <div className="flex gap-2">
                {DURATIONS.map((d) => (
                  <button key={d.value} type="button" onClick={() => setDuration(d.value)}
                    className={`px-4 py-2 rounded-lg border text-sm font-medium transition-colors ${
                      duration === d.value ? 'bg-[var(--ember-deep)] text-white border-[var(--ember-deep)]' : 'bg-white text-gray-700 border-gray-300 hover:border-gray-400'
                    }`}>
                    {d.label}
                    <span className="block text-xs font-normal opacity-70">{d.hint}</span>
                  </button>
                ))}
              </div>
            </div>

            <button type="button" onClick={handleGenerateScript} disabled={generating || !topic.trim()}
              className="w-full border-2 border-[var(--ember-deep)] text-[var(--ember-deep)] hover:bg-[var(--ember-tint-bg)] disabled:border-gray-300 disabled:text-gray-400 font-semibold py-2.5 px-4 rounded-lg transition-colors text-sm">
              {generating ? 'Genererer manus…' : '✨ Generer manus'}
            </button>
          </div>

          {/* Section 2: Script */}
          <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-2">
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-bold text-gray-900 uppercase tracking-wide">Manus <span className="text-red-500">*</span></label>
              <span className="text-xs text-gray-400">{script.length} tegn</span>
            </div>
            <textarea id="radio-script-textarea" value={script} onChange={(e) => setScript(e.target.value)} rows={8}
              placeholder="Klikk «Generer manus» ovenfor, eller skriv direkte her…"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--ember-deep)] resize-none" />
          </div>

          {/* Section: Lysjekk per segment */}
          {script.trim() && (
            <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xs font-bold text-gray-900 uppercase tracking-wide">Lysjekk per segment</h2>
                  <p className="text-xs text-gray-400 mt-0.5">Generer og godkjenn tale per setningspar — regenerer de som ikke er optimale</p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (!segmentMode) setSegments(splitToSegments(script, emotion))
                    setSegmentMode(v => !v)
                  }}
                  className={`relative w-10 h-6 rounded-full transition-colors flex-shrink-0 ${segmentMode ? 'bg-[#D97706]' : 'bg-gray-200'}`}
                >
                  <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${segmentMode ? 'translate-x-4' : ''}`} />
                </button>
              </div>
              {segmentMode && (
                <div className="space-y-2">
                  {segments.map((seg, i) => (
                    <div key={i} className="border border-gray-100 rounded-lg p-3 bg-gray-50 space-y-2">
                      <div className="flex items-start gap-2">
                        <span className="text-xs text-gray-400 font-mono mt-1.5 w-5 flex-shrink-0">{i + 1}.</span>
                        <textarea
                          value={seg.text}
                          onChange={e => setSegments(prev => prev.map((s, j) => j === i ? { ...s, text: e.target.value, audioUrl: null, audioBlob: null } : s))}
                          rows={2}
                          className="flex-1 text-sm border border-gray-200 rounded px-2 py-1 resize-none bg-white focus:outline-none focus:ring-1 focus:ring-[#D97706]"
                        />
                      </div>
                      <div className="flex flex-wrap gap-1 pl-7">
                        {EMOTIONS.map(e => (
                          <button
                            key={e.id}
                            type="button"
                            onClick={() => setSegments(prev => prev.map((s, j) => j === i ? { ...s, audioUrl: null, audioBlob: null, emotion: e.id } : s))}
                            className={`px-2 py-0.5 rounded-full text-xs border transition-all ${seg.emotion === e.id ? 'border-[#D97706] bg-amber-50 text-[#D97706]' : 'border-gray-200 text-gray-500 hover:border-gray-300'}`}
                            title={e.label}
                          >
                            {e.emoji} {e.label}
                          </button>
                        ))}
                      </div>
                      <div className="flex items-center gap-2 pl-7">
                        <button
                          type="button"
                          onClick={() => generateSegmentAudio(i)}
                          disabled={seg.generating || !seg.text.trim()}
                          className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-[#D97706] text-white hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0"
                        >
                          {seg.generating ? '⏳ Genererer…' : seg.audioBlob ? '↻ Regenerer' : '▶ Generer tale'}
                        </button>
                        {seg.audioUrl && (
                          <>
                            <audio src={seg.audioUrl} controls className="h-7 flex-1 min-w-0" />
                            <span className="text-green-600 text-sm font-medium flex-shrink-0">✓</span>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                  <p className="text-xs text-gray-400 pt-1">
                    {segments.filter(s => s.audioBlob).length}/{segments.length} segmenter godkjent
                    {segments.length > 0 && segments.every(s => s.audioBlob) ? ' — klar til innsending ✓' : ''}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Section 3: Voice */}
          <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-3">
            <h2 className="text-xs font-bold text-gray-900 uppercase tracking-wide">Stemme</h2>
            <div className="grid grid-cols-2 gap-2 mb-3">
              {NORWEGIAN_VOICES.map((v) => {
                const isSelected = voiceId === v.id
                const isPlaying = playingVoice === v.id
                return (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => setVoiceId(v.id)}
                    className={`flex items-center gap-2 p-2.5 rounded-lg border-2 text-left transition-all ${isSelected ? 'border-[#D97706] bg-amber-50' : 'border-gray-200 hover:border-gray-300 bg-white'}`}
                  >
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        if (isPlaying) {
                          audioRef.current?.pause()
                          setPlayingVoice(null)
                        } else {
                          if (audioRef.current) audioRef.current.pause()
                          const audio = new Audio(v.preview)
                          audioRef.current = audio
                          audio.play()
                          setPlayingVoice(v.id)
                          audio.onended = () => setPlayingVoice(null)
                        }
                      }}
                      className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center transition-colors ${isPlaying ? 'bg-[#D97706] text-white' : 'bg-gray-100 hover:bg-amber-100 text-gray-600'}`}
                      title={isPlaying ? 'Stopp' : 'Hør stemmen'}
                    >
                      {isPlaying ? (
                        <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor"><rect x="1" y="1" width="3" height="8"/><rect x="6" y="1" width="3" height="8"/></svg>
                      ) : (
                        <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor"><polygon points="2,1 9,5 2,9"/></svg>
                      )}
                    </button>
                    <div className="min-w-0">
                      <div className={`text-sm font-medium leading-tight ${isSelected ? 'text-[#D97706]' : 'text-gray-900'}`}>{v.name}</div>
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
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[var(--ember-deep)]"
            />
            <p className="text-xs text-gray-400 mt-1">
              Velg stemme ovenfor, eller lim inn ID direkte fra{' '}
              <a href="https://elevenlabs.io/voice-library" target="_blank" rel="noopener noreferrer" className="text-[var(--ember-deep)] hover:underline">
                ElevenLabs voice library →
              </a>
            </p>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Emosjon / stemmeleie</label>
              <div className="flex flex-wrap gap-2">
                {EMOTIONS.map((e) => (
                  <button
                    key={e.id}
                    type="button"
                    onClick={() => setEmotion(e.id)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border-2 transition-all ${emotion === e.id ? 'border-[#D97706] bg-amber-50 text-[#D97706]' : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'}`}
                  >
                    <span>{e.emoji}</span> {e.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Section 4: Music */}
          <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-3">
            <h2 className="text-xs font-bold text-gray-900 uppercase tracking-wide">Bakgrunnsmusikk (valgfritt)</h2>
            <p className="text-xs text-gray-500">Musikken mikses inn på 15% volum bak voiceover-lyden.</p>

            <div className="border-2 border-dashed border-gray-200 rounded-lg p-4">
              <div className={`grid ${tenantInfo.slug === 'centerforge' ? 'grid-cols-2' : 'grid-cols-1'} gap-3`}>
                <label className="block">
                  <span className="text-xs font-medium text-gray-700 block mb-1">
                    {tenantInfo.vertical === 'music' ? 'Last opp egen låt (MP3, maks 50 MB)' : 'Last opp egen musikk (MP3, maks 50 MB)'}
                  </span>
                  <input type="file" accept=".mp3"
                    onChange={async (e) => {
                      const input = e.currentTarget
                      const file = input.files?.[0]
                      if (!file) return
                      if (!file.name.toLowerCase().endsWith('.mp3')) { alert('Kun MP3-filer støttes.'); input.value = ''; return }
                      try {
                        // Produkt-scopet, utenom Netlify-proxyen (413 over ~4,5 MB)
                        await uploadTrack(file, tracksFolder(productId))
                        await refreshMusicLibrary()
                        alert('Lastet opp!')
                      } catch (err) { alert(err instanceof Error ? err.message : 'Opplasting feilet.') }
                      input.value = ''
                    }}
                    className="block w-full text-sm text-gray-500 file:mr-2 file:rounded file:border-0 file:bg-[var(--ember-deep)] file:px-2 file:py-1 file:text-xs file:font-medium file:text-white hover:file:bg-[var(--ink)]"
                  />
                </label>
                {/* Legacy delt-mappe-opplasting: kun rot-tenanten (biblioteksvedlikehold) */}
                {tenantInfo.slug === 'centerforge' && (
                  <label className="block">
                    <span className="text-xs font-medium text-gray-700 block mb-1">Til delt mappe (rot)</span>
                    <div className="flex gap-2">
                      <select value={selectedMusicFolder} onChange={(e) => setSelectedMusicFolder(e.target.value)}
                        className="px-2 py-2 border border-gray-300 rounded-lg text-sm">
                        <option value="global">Global</option>
                        <option value="bildeal">BilDeal</option>
                        <option value="reforhandle">Reforhandle</option>
                        <option value="singlepicker">SinglePicker</option>
                      </select>
                      <input type="file" accept=".mp3"
                        onChange={async (e) => {
                          const input = e.currentTarget
                          const file = input.files?.[0]
                          if (!file) return
                          if (!file.name.toLowerCase().endsWith('.mp3')) { alert('Kun MP3-filer støttes.'); input.value = ''; return }
                          if (file.size > 4 * 1024 * 1024) { alert(`Filen er for stor. Maks 4 MB.`); input.value = ''; return }
                          const formData = new FormData()
                          formData.append('file', file)
                          try {
                            const res = await fetch(`/api/music/upload?folder=${selectedMusicFolder}`, { method: 'POST', body: formData })
                            if (res.ok) { await refreshMusicLibrary(); alert('Lastet opp!') }
                            else alert('Opplasting feilet: ' + await res.text())
                          } catch { alert('Opplasting feilet.') }
                          input.value = ''
                        }}
                        className="block w-full text-sm text-gray-500 file:mr-2 file:rounded file:border-0 file:bg-[var(--ember-deep)] file:px-2 file:py-1 file:text-xs file:font-medium file:text-white hover:file:bg-[var(--ink)]"
                      />
                    </div>
                  </label>
                )}
              </div>
            </div>

            {musicLibrary.length === 0 ? (
              <p className="text-sm text-gray-400">Laster musikk-bibliotek…</p>
            ) : (
              <div className="space-y-2">
                <button type="button" onClick={() => setMusicFile(null)}
                  className={`w-full text-left p-3 border-2 rounded-lg text-sm transition-colors ${
                    musicFile === null ? 'border-[var(--ember-deep)] bg-[var(--ember-tint-bg)] text-[var(--ember-deep)] font-medium' : 'border-gray-200 text-gray-500 hover:border-gray-300'
                  }`}>
                  Ingen musikk
                </button>
                {ownTracks(musicLibrary, productId).length > 0 && (
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wide pt-1">
                    {tenantInfo.vertical === 'music' ? '🎤 Låtene dine' : 'Egen musikk (dette produktet)'}
                  </p>
                )}
                {[...ownTracks(musicLibrary, productId), ...sharedMusic(musicLibrary)].map((m) => (
                  <div key={m.filename} onClick={() => setMusicFile(m.filename)}
                    className={`w-full text-left p-3 border-2 rounded-lg transition-colors cursor-pointer ${
                      musicFile === m.filename ? 'border-green-500 bg-green-50' : 'border-gray-200 hover:border-gray-300'
                    }`}>
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

          {/* Section 5: Jingle */}
          <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-3">
            <h2 className="text-xs font-bold text-gray-900 uppercase tracking-wide">Jingle (valgfritt)</h2>
            <p className="text-xs text-gray-500">En kort lydlogo som spilles av på slutten av spoten.</p>

            <div className="border-2 border-dashed border-gray-200 rounded-lg p-4">
              <label className="block">
                <span className="text-xs font-medium text-gray-700 block mb-1">Last opp jingle (MP3)</span>
                <input type="file" accept=".mp3"
                  onChange={async (e) => {
                    const input = e.currentTarget
                    const file = input.files?.[0]
                    if (!file) return
                    if (!file.name.toLowerCase().endsWith('.mp3')) { alert('Kun MP3-filer støttes.'); input.value = ''; return }
                    if (file.size > 4 * 1024 * 1024) { alert('Filen er for stor. Maks 4 MB.'); input.value = ''; return }
                    const formData = new FormData()
                    formData.append('file', file)
                    try {
                      const res = await fetch(`/api/music/upload?folder=jingles-${productId}`, { method: 'POST', body: formData })
                      if (res.ok) { await refreshMusicLibrary(); alert('Lastet opp!') }
                      else alert('Opplasting feilet: ' + await res.text())
                    } catch { alert('Opplasting feilet.') }
                    input.value = ''
                  }}
                  className="block w-full text-sm text-gray-500 file:mr-2 file:rounded file:border-0 file:bg-amber-600 file:px-2 file:py-1 file:text-xs file:font-medium file:text-white hover:file:bg-amber-700"
                />
              </label>
            </div>

            {(() => {
              // Kun produktets egne jingler; gamle felles-jingler kun på rot-tenanten
              const jingles = musicLibrary.filter(m => m.folder === `jingles-${productId}` || (m.folder === 'jingles' && tenantInfo.slug === 'centerforge'))
              return jingles.length === 0 ? (
              <p className="text-sm text-gray-400">Ingen jingles lastet opp ennå.</p>
            ) : (
              <div className="space-y-2">
                <button type="button" onClick={() => setJingleFile(null)}
                  className={`w-full text-left p-3 border-2 rounded-lg text-sm transition-colors ${
                    jingleFile === null ? 'border-[var(--ember-deep)] bg-[var(--ember-tint-bg)] text-[var(--ember-deep)] font-medium' : 'border-gray-200 text-gray-500 hover:border-gray-300'
                  }`}>
                  Ingen jingle
                </button>
                {jingles.map((j) => (
                  <button key={j.filename} type="button" onClick={() => setJingleFile(j.filename)}
                    className={`w-full text-left p-3 border-2 rounded-lg transition-colors ${
                      jingleFile === j.filename ? 'border-amber-500 bg-amber-50' : 'border-gray-200 hover:border-gray-300'
                    }`}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium text-gray-900">{j.name}</span>
                      <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded">jingle</span>
                    </div>
                    <audio controls className="w-full h-6" src={`/api/music/${encodeURIComponent(j.filename)}`} onClick={(e) => e.stopPropagation()} />
                  </button>
                ))}
              </div>
            )
            })()}
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">{error}</div>
          )}

          <button type="submit"
            disabled={loading || uploadingSegments || !script.trim() || (segmentMode && segments.length > 0 && !segments.every(s => s.audioBlob))}
            className="w-full bg-[var(--ember-deep)] hover:bg-[#1C1A16] disabled:bg-gray-300 text-white font-semibold py-3 px-4 rounded-lg transition-colors">
            {uploadingSegments ? 'Laster opp segmenter…' : loading ? 'Starter produksjon…' : '🎙️ Produser radioreklame'}
          </button>

          <p className="text-xs text-gray-400 text-center">
            MP3-filen er klar om ca. 30–60 sekunder og kan lastes ned fra produktsiden.
          </p>
        </form>
      </div>
    </div>
  )
}
