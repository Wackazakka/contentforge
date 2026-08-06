'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { getSupabase } from '@/lib/supabaseClient'

interface UserCharacter {
  id: string
  name: string
  trigger_word: string
  status: 'training' | 'ready' | 'failed'
  created_at: string
}

export default function CharactersPage() {
  const [chars, setChars] = useState<UserCharacter[]>([])
  const [name, setName] = useState('')
  const [files, setFiles] = useState<FileList | null>(null)
  const [consent, setConsent] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const authHeaders = async (): Promise<Record<string, string>> => {
    const { data: sess } = await getSupabase().auth.getSession()
    const token = sess?.session?.access_token
    return token ? { Authorization: `Bearer ${token}` } : {}
  }

  const refresh = async () => {
    try {
      const d = await fetch('/api/characters', { headers: await authHeaders() }).then((r) => r.json())
      setChars(d.characters || [])
    } catch { /* ignore */ }
  }

  useEffect(() => {
    refresh()
    const iv = setInterval(refresh, 20000) // trening tar ~6 min — poll til «ready»
    return () => clearInterval(iv)
  }, [])

  const train = async () => {
    setError(null)
    if (!name.trim()) { setError('Gi karakteren et navn.'); return }
    if (!files || files.length < 5) { setError('Last opp minst 5 bilder (gjerne 10-15).'); return }
    if (files.length > 20) { setError('Maks 20 bilder.'); return }
    if (!consent) { setError('Du må bekrefte at du har rett til å bruke bildene.'); return }

    try {
      setBusy('Pakker bilder…')
      const JSZip = (await import('jszip')).default
      const zip = new JSZip()
      for (let i = 0; i < files.length; i++) {
        const f = files[i]
        zip.file(`image_${i + 1}.${(f.name.split('.').pop() || 'jpg').toLowerCase()}`, await f.arrayBuffer())
      }
      const blob = await zip.generateAsync({ type: 'blob' })

      setBusy('Laster opp…')
      const { uploadUrl, publicUrl, error: upErr } = await fetch('/api/characters/upload-url').then((r) => r.json())
      if (!uploadUrl) throw new Error(upErr || 'Fikk ikke opplastings-URL')
      const put = await fetch(uploadUrl, { method: 'PUT', headers: { 'Content-Type': 'application/zip' }, body: blob })
      if (!put.ok) throw new Error('Opplasting til lagring feilet (' + put.status + ')')

      setBusy('Starter trening…')
      const res = await fetch('/api/characters/train', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify({ name, zipUrl: publicUrl }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Trening feilet')

      setName(''); setFiles(null); setConsent(false)
      await refresh()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="min-h-screen bg-[var(--paper)]">
      <div className="max-w-2xl mx-auto px-4 py-8">
        <Link href="/dashboard" className="text-[var(--ember-deep)] hover:text-[var(--ink)] mb-4 inline-block">← Tilbake</Link>
        <h1 className="text-3xl font-bold text-gray-900 mb-2">🧑‍🎤 Karakterer</h1>
        <p className="text-gray-600 mb-8">Tren din egen AI-karakter fra bilder. Karakteren kan så være vert i videoene dine — samme person i alle segmentbildene.</p>

        <div className="bg-[var(--paper-raised)] rounded-lg border border-gray-200 p-6 mb-8">
          <h2 className="font-semibold text-gray-900 mb-4">Lag ny karakter</h2>

          <label className="block text-sm font-medium text-gray-700 mb-1">Navn</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="F.eks. «Kari fra kundeservice»"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm mb-4"
          />

          <label className="block text-sm font-medium text-gray-700 mb-1">Bilder (5-20 stk)</label>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            onChange={(e) => setFiles(e.target.files)}
            className="block w-full text-sm text-gray-500 mb-1 file:mr-2 file:rounded file:border-0 file:bg-[var(--ember-deep)] file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-[var(--on-ember)]"
          />
          <p className="text-xs text-gray-400 mb-4">Tips: 10-15 skarpe bilder av samme person, ulike vinkler og uttrykk, helst uten andre personer i bildet.</p>

          <label className="flex items-start gap-2 mb-4 text-sm text-gray-700 cursor-pointer">
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 h-4 w-4" />
            <span>Jeg bekrefter at jeg har rett til å bruke disse bildene, og at personen på bildene har samtykket til at det lages en AI-karakter av dem.</span>
          </label>

          {error && <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">{error}</div>}

          <button
            onClick={train}
            disabled={!!busy}
            className="px-5 py-2.5 rounded-lg font-semibold text-[var(--on-ember)] bg-[var(--ember-deep)] hover:bg-[var(--ink)] disabled:opacity-50 transition-colors"
          >
            {busy || 'Tren karakter (~6 min)'}
          </button>
        </div>

        <h2 className="font-semibold text-gray-900 mb-3">Dine karakterer</h2>
        {chars.length === 0 ? (
          <p className="text-gray-400 text-sm">Ingen egne karakterer ennå.</p>
        ) : (
          <div className="space-y-2">
            {chars.map((c) => (
              <div key={c.id} className="flex items-center justify-between bg-[var(--paper-raised)] border border-gray-200 rounded-lg px-4 py-3">
                <div>
                  <div className="font-medium text-gray-900">{c.name}</div>
                  <div className="text-xs text-gray-400">{new Date(c.created_at).toLocaleDateString('nb-NO')}</div>
                </div>
                <span className={`text-xs px-3 py-1 rounded-full font-medium ${
                  c.status === 'ready' ? 'bg-green-100 text-green-800'
                  : c.status === 'training' ? 'bg-amber-100 text-amber-800'
                  : 'bg-red-100 text-red-700'
                }`}>
                  {c.status === 'ready' ? '✓ Klar' : c.status === 'training' ? '⏳ Trener…' : '✗ Feilet'}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
