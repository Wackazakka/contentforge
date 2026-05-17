'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { getSupabase } from '@/lib/supabaseClient'

const DEFAULT_VOICE_ID = 'nPczCjzI2devNBz1zQrb'

const TONES = ['Vennlig', 'Energisk', 'Profesjonell', 'Rolig']
const DURATIONS = [
  { value: '15', label: '15 sek', hint: '~35 ord' },
  { value: '30', label: '30 sek', hint: '~70 ord' },
  { value: '60', label: '60 sek', hint: '~135 ord' },
]

export default function RadioAdPage() {
  const params = useParams()
  const productId = params.id as string

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
            <button onClick={() => { setJobId(null); setScript(''); setTopic('') }} className="text-sm text-[#185FA5] hover:underline">
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
          <Link href={`/dashboard/products/${productId}`} className="text-[#185FA5] hover:text-[#0C447C] text-sm mb-4 inline-block">
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
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#185FA5]" />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Emne / budskap <span className="text-red-500">*</span>
              </label>
              <textarea value={topic} onChange={(e) => setTopic(e.target.value)} rows={3}
                placeholder="F.eks. «Sommerens beste biltilbud — 0% rente og gratis service i ett år»"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#185FA5] resize-none" />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Målgruppe</label>
                <input type="text" value={targetAudience} onChange={(e) => setTargetAudience(e.target.value)}
                  placeholder="F.eks. «Bilkjøpere 30–55 år»"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#185FA5]" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Call-to-action</label>
                <input type="text" value={cta} onChange={(e) => setCta(e.target.value)}
                  placeholder="F.eks. «Ring oss på 815 00 000»"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#185FA5]" />
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
                      duration === d.value ? 'bg-[#185FA5] text-white border-[#185FA5]' : 'bg-white text-gray-700 border-gray-300 hover:border-gray-400'
                    }`}>
                    {d.label}
                    <span className="block text-xs font-normal opacity-70">{d.hint}</span>
                  </button>
                ))}
              </div>
            </div>

            <button type="button" onClick={handleGenerateScript} disabled={generating || !topic.trim()}
              className="w-full border-2 border-[#185FA5] text-[#185FA5] hover:bg-[#EBF4FF] disabled:border-gray-300 disabled:text-gray-400 font-semibold py-2.5 px-4 rounded-lg transition-colors text-sm">
              {generating ? 'Genererer manus…' : '✨ Generer manus'}
            </button>
          </div>

          {/* Section 2: Script */}
          <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-2">
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-bold text-gray-900 uppercase tracking-wide">Manus <span className="text-red-500">*</span></label>
              <span className="text-xs text-gray-400">{script.length} tegn</span>
            </div>
            <textarea value={script} onChange={(e) => setScript(e.target.value)} rows={8}
              placeholder="Klikk «Generer manus» ovenfor, eller skriv direkte her…"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#185FA5] resize-none" />
          </div>

          {/* Section 3: Voice */}
          <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-3">
            <h2 className="text-xs font-bold text-gray-900 uppercase tracking-wide">Stemme</h2>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Voice ID (ElevenLabs)</label>
              <input type="text" value={voiceId} onChange={(e) => setVoiceId(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#185FA5]" />
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
            <p className="text-xs text-gray-500">Musikken mikses inn på 15% volum bak voiceover-lyden.</p>

            <div className="border-2 border-dashed border-gray-200 rounded-lg p-4">
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-xs font-medium text-gray-700 block mb-1">Mappe</span>
                  <select value={selectedMusicFolder} onChange={(e) => setSelectedMusicFolder(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
                    <option value="global">Global</option>
                    <option value="bildeal">BilDeal</option>
                    <option value="reforhandle">Reforhandle</option>
                    <option value="singlepicker">SinglePicker</option>
                  </select>
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-gray-700 block mb-1">Last opp MP3</span>
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
                    className="block w-full text-sm text-gray-500 file:mr-2 file:rounded file:border-0 file:bg-[#185FA5] file:px-2 file:py-1 file:text-xs file:font-medium file:text-white hover:file:bg-[#0C447C]"
                  />
                </label>
              </div>
            </div>

            {musicLibrary.length === 0 ? (
              <p className="text-sm text-gray-400">Laster musikk-bibliotek…</p>
            ) : (
              <div className="space-y-2">
                <button type="button" onClick={() => setMusicFile(null)}
                  className={`w-full text-left p-3 border-2 rounded-lg text-sm transition-colors ${
                    musicFile === null ? 'border-[#185FA5] bg-[#EBF4FF] text-[#185FA5] font-medium' : 'border-gray-200 text-gray-500 hover:border-gray-300'
                  }`}>
                  Ingen musikk
                </button>
                {musicLibrary.map((m) => (
                  <button key={m.filename} type="button" onClick={() => setMusicFile(m.filename)}
                    className={`w-full text-left p-3 border-2 rounded-lg transition-colors ${
                      musicFile === m.filename ? 'border-green-500 bg-green-50' : 'border-gray-200 hover:border-gray-300'
                    }`}>
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
                      const res = await fetch('/api/music/upload?folder=jingles', { method: 'POST', body: formData })
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
              const jingles = musicLibrary.filter(m => m.folder === 'jingles')
              return jingles.length === 0 ? (
              <p className="text-sm text-gray-400">Ingen jingles lastet opp ennå.</p>
            ) : (
              <div className="space-y-2">
                <button type="button" onClick={() => setJingleFile(null)}
                  className={`w-full text-left p-3 border-2 rounded-lg text-sm transition-colors ${
                    jingleFile === null ? 'border-[#185FA5] bg-[#EBF4FF] text-[#185FA5] font-medium' : 'border-gray-200 text-gray-500 hover:border-gray-300'
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

          <button type="submit" disabled={loading || !script.trim()}
            className="w-full bg-[#185FA5] hover:bg-[#0C447C] disabled:bg-gray-300 text-white font-semibold py-3 px-4 rounded-lg transition-colors">
            {loading ? 'Starter produksjon…' : '🎙️ Produser radioreklame'}
          </button>

          <p className="text-xs text-gray-400 text-center">
            MP3-filen er klar om ca. 30–60 sekunder og kan lastes ned fra produktsiden.
          </p>
        </form>
      </div>
    </div>
  )
}
