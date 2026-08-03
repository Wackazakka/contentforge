'use client'

import { useState } from 'react'

// Samtykketeksten fryses på søknadsraden (consent_text) — endres formuleringen,
// vet vi fortsatt nøyaktig hva hver søker samtykket til.
export const CONSENT_TEXT =
  'Jeg samtykker til at stemmeprøvene mine vurderes for opptak i stemmebanken. ' +
  'Blir jeg med, lages en profesjonell stemmeklon som lagres hos plattformen og aldri utleveres. ' +
  'All bruk logges og honoreres etter avtale, og jeg kan når som helst trekke stemmen min tilbake. ' +
  'Stemmen min er biometriske data og behandles i tråd med personvernreglene.'

const MAX_FILE_MB = 10
const AUDIO_TYPES = ['audio/mpeg', 'audio/wav', 'audio/x-wav', 'audio/x-m4a', 'audio/mp4']

export default function ApplyForm({ appName }: { appName: string }) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [bio, setBio] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [offersVoice, setOffersVoice] = useState(true)
  const [wantsFace, setWantsFace] = useState(false)
  const [consent, setConsent] = useState(false)
  const [website, setWebsite] = useState('') // honeypot
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!name.trim() || !email.includes('@')) { setError('Fyll inn navn og en gyldig e-postadresse.'); return }
    if (!offersVoice && !wantsFace) { setError('Velg minst ett aktivum: stemme eller ansikt.'); return }
    if (offersVoice && files.length === 0) { setError('Last opp minst én lydprøve når du tilbyr stemmen.'); return }
    if (!consent) { setError('Du må samtykke for å sende søknaden.'); return }
    setBusy(true)
    try {
      const fd = new FormData()
      fd.append('name', name.trim())
      fd.append('email', email.trim())
      fd.append('phone', phone.trim())
      fd.append('bio', bio.trim())
      fd.append('wantsFace', wantsFace ? '1' : '0')
      fd.append('offersVoice', offersVoice ? '1' : '0')
      fd.append('consentText', CONSENT_TEXT)
      fd.append('website', website) // honeypot
      files.slice(0, 2).forEach((f) => fd.append('samples', f))
      const res = await fetch('/api/voice-bank/apply', { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Noe gikk galt — prøv igjen.')
      setDone(true)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  if (done) {
    return (
      <div className="min-h-screen bg-[var(--paper)] flex items-center justify-center px-6">
        <div className="max-w-md text-center bg-green-50 border border-green-200 rounded-2xl p-8">
          <h1 className="text-xl font-bold text-green-800 mb-2">Takk for søknaden!</h1>
          <p className="text-sm text-green-700">
            Vi hører på prøvene dine og tar kontakt på {email.trim()}.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[var(--paper)] px-6 py-12">
      <div className="max-w-lg mx-auto">
        <h1 className="text-3xl font-bold text-[var(--ink,#1C1A16)] mb-2">Bli en stemme hos {appName}</h1>
        <p className="text-sm text-gray-600 mb-8">
          Har du en stemme folk hører på? Send oss et par prøver — blir du med i banken,
          tjener du royalty hver gang stemmen din brukes, og du bestemmer selv hvem som
          får bruke den.
        </p>

        <form onSubmit={submit} className="bg-white rounded-2xl border border-gray-200 p-6 space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Navn *</label>
            <input value={name} onChange={(e) => setName(e.target.value)} disabled={busy}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">E-post *</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} disabled={busy}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Telefon</label>
            <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} disabled={busy}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Kort om deg og stemmen din</label>
            <textarea value={bio} onChange={(e) => setBio(e.target.value)} rows={3} disabled={busy}
              placeholder="F.eks. erfaring, dialekt, hva stemmen din passer til"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Lydprøver (1–2 filer){offersVoice ? ' *' : ' — valgfritt uten stemme'}</label>
            <input
              type="file"
              accept=".mp3,.wav,.m4a,audio/mpeg,audio/wav,audio/mp4"
              multiple
              disabled={busy}
              onChange={(e) => {
                const valgte = Array.from(e.target.files || []).slice(0, 2)
                for (const f of valgte) {
                  if (f.size > MAX_FILE_MB * 1024 * 1024) { setError(`«${f.name}» er for stor (maks ${MAX_FILE_MB} MB).`); e.target.value = ''; return }
                  if (f.type && !AUDIO_TYPES.includes(f.type)) { setError(`«${f.name}» må være MP3, WAV eller M4A.`); e.target.value = ''; return }
                }
                setError(null)
                setFiles(valgte)
              }}
              className="block w-full text-sm text-gray-500"
            />
            <p className="text-xs text-gray-400 mt-1">MP3, WAV eller M4A — maks {MAX_FILE_MB} MB per fil. 30–60 sekunder naturlig tale er perfekt.</p>
          </div>
          <div className="text-sm text-gray-700">
            <span className="block font-medium mb-1">Hva tilbyr du?</span>
            <label className="flex items-start gap-2 mb-1">
              <input type="checkbox" checked={offersVoice} onChange={(e) => setOffersVoice(e.target.checked)} disabled={busy} className="mt-0.5" />
              🎙️ Stemmen min
            </label>
            <label className="flex items-start gap-2">
              <input type="checkbox" checked={wantsFace} onChange={(e) => setWantsFace(e.target.checked)} disabled={busy} className="mt-0.5" />
              🧑 Ansiktet mitt (for video-avatarer)
            </label>
          </div>
          <label className="flex items-start gap-2 text-xs text-gray-600 bg-gray-50 border border-gray-200 rounded-lg p-3">
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} disabled={busy} className="mt-0.5" />
            <span>{CONSENT_TEXT}</span>
          </label>

          {/* Honeypot — skjult for mennesker */}
          <input value={website} onChange={(e) => setWebsite(e.target.value)} tabIndex={-1} aria-hidden="true"
            autoComplete="off" name="website" style={{ position: 'absolute', left: -9999, width: 1, height: 1 }} />

          {error && <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">{error}</div>}

          <button type="submit" disabled={busy}
            className="w-full py-3 rounded-lg font-semibold text-[var(--on-ember)] bg-[var(--ember-deep)] hover:opacity-90 disabled:opacity-50">
            {busy ? 'Sender …' : 'Send søknad'}
          </button>
        </form>
      </div>
    </div>
  )
}
