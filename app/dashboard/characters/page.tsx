'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { getSupabase } from '@/lib/supabaseClient'
import { useDashboardRole } from '@/lib/useDashboardRole'

interface UserCharacter {
  id: string
  name: string
  trigger_word: string
  status: 'training' | 'ready' | 'failed'
  created_at: string
  // Maaleinstrumentet (093): hvilken trener som laget modellen.
  trainer: string | null
  // Settet den ble laget fra (094). Uten den kan den ikke trenes paa nytt.
  training_set_url: string | null
}

export default function CharactersPage() {
  const [chars, setChars] = useState<UserCharacter[]>([])
  const [name, setName] = useState('')
  const [files, setFiles] = useState<FileList | null>(null)
  // null = ingen erklaering avgitt ennaa. Se samtykkeporten lenger nede.
  const [consent, setConsent] = useState<'self' | 'other_consented' | 'not_a_person' | null>(null)
  // Hvem som skal godkjenne modellen (091). Kreves naar bildene viser en
  // ANNEN person: uten adressen kan hen ikke se modellen av seg selv, og
  // godkjenningen blir en formalitet vi krysser av paa hennes vegne.
  const [subjectEmail, setSubjectEmail] = useState('')
  // Trenervalget er ADMIN-styrt: en kunde kan ikke vurdere spoersmaalet, og
  // et galt valg gir daarligere likhet hen faar skylden for selv.
  const role = useDashboardRole()
  const [trainer, setTrainer] = useState<'portrait' | 'flux2'>('portrait')
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

  // Tren paa nytt fra det LAGREDE settet — ingen nedlasting, ingen ny zip.
  // Lager en NY rad, aldri overskriving: en sammenlikning trenger begge, og
  // en overskriving ville drept en modell rettighetshaveren har godkjent.
  const retrain = async (c: UserCharacter, medTrener: 'portrait' | 'flux2') => {
    setError(null)
    setBusy('Starter trening…')
    try {
      const res = await fetch('/api/characters/retrain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify({ characterId: c.id, trainer: medTrener }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'Retrening feilet')
      await refresh()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setBusy(null)
    }
  }

  const train = async () => {
    setError(null)
    if (!name.trim()) { setError('Gi karakteren et navn.'); return }
    if (!files || files.length < 10) { setError('Last opp minst 10 bilder — 15–25 gir merkbart bedre ansiktslikhet.'); return }
    if (files.length > 30) { setError('Maks 30 bilder.'); return }
    if (!consent) { setError('Velg hvem bildene viser før du starter treningen.'); return }
    if (consent === 'other_consented' && !subjectEmail.includes('@')) {
      setError('Fyll inn e-posten til personen på bildene — hun skal godkjenne modellen før den kan brukes.'); return
    }

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
      // Bildene gaar til en PRIVAT boette. Se /api/characters/upload-url for
      // hvorfor: den gamle veien la dem fritt lesbare i en offentlig R2-boette.
      const { uploadUrl, path, error: upErr } = await fetch('/api/characters/upload-url', { headers: await authHeaders() }).then((r) => r.json())
      if (!uploadUrl || !path) throw new Error(upErr || 'Fikk ikke opplastings-URL')
      const put = await fetch(uploadUrl, { method: 'PUT', headers: { 'Content-Type': 'application/zip' }, body: blob })
      if (!put.ok) throw new Error('Opplasting til lagring feilet (' + put.status + ')')

      setBusy('Starter trening…')
      const res = await fetch('/api/characters/train', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify({ name, zipPath: path, consentSubject: consent, subjectEmail: subjectEmail || null, trainer }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Trening feilet')

      setName(''); setFiles(null); setConsent(null); setSubjectEmail('')
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

          <label className="block text-sm font-medium text-gray-700 mb-1">Bilder (10-30 stk)</label>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            onChange={(e) => setFiles(e.target.files)}
            className="block w-full text-sm text-gray-500 mb-1 file:mr-2 file:rounded file:border-0 file:bg-[var(--ember-deep)] file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-[var(--on-ember)]"
          />
          <p className="text-xs text-gray-400 mb-4">Tips: 15–25 skarpe bilder av samme person, ulike vinkler, uttrykk og lys — helst uten andre personer i bildet. Antallet betyr mer for likheten enn noe annet du kan justere.</p>

          {/* Samtykkeporten (089). Var ett avkryss som aldri forlot nettleseren.
              Nå er det tre valg, fordi «har du lov?» er ett spørsmål med tre
              helt ulike begrunnelser — og svaret lagres på karakteren med navn
              og dato. Det siste er ikke pynt: en erklæring som ikke beholdes,
              er ingen erklæring. */}
          <fieldset className="mb-4">
            <legend className="text-sm font-medium text-gray-700 mb-2">Hvem viser bildene?</legend>
            {([
              ['self', 'Meg selv'],
              ['other_consented', 'En annen person, som har sagt ja til at det lages en AI-modell av ansiktet'],
              ['not_a_person', 'Ingen virkelig person — fiktiv eller generert'],
            ] as const).map(([verdi, tekst]) => (
              <label key={verdi} className="flex items-start gap-2 mb-2 text-sm text-gray-700 cursor-pointer">
                <input
                  type="radio"
                  name="consentSubject"
                  checked={consent === verdi}
                  onChange={() => setConsent(verdi)}
                  className="mt-0.5 h-4 w-4"
                />
                <span>{tekst}</span>
              </label>
            ))}
            {/* Gjelder det en annen person, maa hen kunne se modellen av seg
                selv. Feltet staar inne i valget, ikke ved siden av, saa det er
                tydelig at det HOERER til det svaret. */}
            {consent === 'other_consented' && (
              <div className="mt-2 mb-1 pl-6">
                <label className="block text-sm font-medium text-gray-700 mb-1">E-post til personen på bildene</label>
                <input type="email" value={subjectEmail} onChange={(e) => setSubjectEmail(e.target.value)}
                  placeholder="hen@eksempel.no"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                <p className="text-xs text-gray-500 mt-1">
                  Hun får se tre bilder laget med modellen og svarer ja eller nei.
                  <strong> Modellen er stengt til hun har sagt ja.</strong>
                </p>
              </div>
            )}

            <p className="text-xs text-gray-500 mt-2">
              Svaret lagres på karakteren sammen med hvem som avga det og når. Er
              ansiktet en annen persons, kan hen når som helst be om at det stenges.
            </p>
          </fieldset>

          {/* Trenervalg — kun admin. Hensikten er aa KUNNE MAALE: tren samme
              bildesett paa begge og sammenlikn. Standard staar paa den billige
              til maalingen er gjort. */}
          {role.admin && (
            <fieldset className="mb-4 p-3 rounded-lg border border-gray-300">
              <legend className="text-sm font-medium text-gray-700 px-1">Trener (admin)</legend>
              {([
                ['portrait', 'Flux 1, portrett-spesialisert', '~20 kr'],
                ['flux2', 'Flux 2 dev, generell', '~96 kr'],
              ] as const).map(([v, tekst, pris]) => (
                <label key={v} className="flex items-start gap-2 mb-1.5 text-sm text-gray-700 cursor-pointer">
                  <input type="radio" name="trainer" checked={trainer === v}
                    onChange={() => setTrainer(v)} className="mt-0.5 h-4 w-4" />
                  <span>{tekst} <span className="text-gray-400">— {pris} råkost</span></span>
                </label>
              ))}
              <p className="text-xs text-gray-500 mt-1">
                Fem ganger prisen er ikke bevist verdt det. Tren samme bildesett på begge
                og sammenlikn før du bytter standard.
              </p>
            </fieldset>
          )}

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
                  <div className="text-xs text-gray-400">
                    {new Date(c.created_at).toLocaleDateString('nb-NO')}
                    {c.trainer && <> · {c.trainer.includes('flux-2') ? 'Flux 2' : 'Flux 1 portrett'}</>}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                {/* Retrening er admin-styrt: den bruker vaar fal-noekkel og kan
                    koste 96 kr. Vises bare naar settet faktisk er sporet. */}
                {role.admin && c.status === 'ready' && c.training_set_url && (
                  <>
                    <button onClick={() => retrain(c, 'portrait')} disabled={!!busy}
                      className="text-xs px-2.5 py-1 rounded-lg border border-gray-300 text-gray-600 hover:border-[var(--ember-deep)] hover:text-[var(--ember-deep)] disabled:opacity-40">
                      Tren på nytt · Flux 1
                    </button>
                    <button onClick={() => retrain(c, 'flux2')} disabled={!!busy}
                      className="text-xs px-2.5 py-1 rounded-lg border border-gray-300 text-gray-600 hover:border-[var(--ember-deep)] hover:text-[var(--ember-deep)] disabled:opacity-40">
                      Flux 2 · ~96 kr
                    </button>
                  </>
                )}
                <span className={`text-xs px-3 py-1 rounded-full font-medium ${
                  c.status === 'ready' ? 'bg-green-100 text-green-800'
                  : c.status === 'training' ? 'bg-amber-100 text-amber-800'
                  : 'bg-red-100 text-red-700'
                }`}>
                  {c.status === 'ready' ? '✓ Klar' : c.status === 'training' ? '⏳ Trener…' : '✗ Feilet'}
                </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
