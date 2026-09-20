'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import {
  FASETTER, KJOENN, KREVER_SAMTYKKE, VOKABULAR, type Fasett,
} from '@/lib/castingAttributes'

// Samtykketeksten fryses på søknadsraden (consent_text) — endres formuleringen,
// vet vi fortsatt nøyaktig hva hver søker samtykket til.
//
// TOSPRÅKLIG 20.09.2026: teksten hentes nå fra meldingsfila, og det er den
// SAMME strengen som vises og som fryses. Det er hele poenget: raden skal
// bevare ordlyden søkeren faktisk leste, ikke en norsk oversettelse av den.

const MAX_FILE_MB = 10
const AUDIO_TYPES = ['audio/mpeg', 'audio/wav', 'audio/x-wav', 'audio/x-m4a', 'audio/mp4']

export default function ApplyForm({ appName }: { appName: string }) {
  const t = useTranslations('apply')
  const tc = useTranslations('casting')
  const consentText = t('consent')
  // Art. 9-teksten fryses for seg: den daekker noe annet enn stemmesamtykket,
  // og en soeker kan si ja til det ene og nei til det andre.
  const appearanceConsentText = t('appearance_consent_text')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [bio, setBio] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [offersVoice, setOffersVoice] = useState(true)
  const [wantsFace, setWantsFace] = useState(false)
  const [consent, setConsent] = useState(false)
  // Castingfeltene. 🔑 De hoerer hjemme HER og ikke i adminen: et tomt felt er
  // ikke «alle», det er usynlig — og spilleomraade skal vaere SELVERKLAERT,
  // ikke satt av en tredjepart om et menneske.
  const [kjoenn, setKjoenn] = useState('')
  const [aldFra, setAldFra] = useState('')
  const [aldTil, setAldTil] = useState('')
  const [hoyde, setHoyde] = useState('')
  const [attr, setAttr] = useState<Record<string, string[]>>({})
  const [appearanceConsent, setAppearanceConsent] = useState(false)
  const [website, setWebsite] = useState('') // honeypot
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const veksle = (f: Fasett, v: string) => setAttr((p) => {
    const naa = p[f] ?? []
    return { ...p, [f]: naa.includes(v) ? naa.filter((x) => x !== v) : [...naa, v] }
  })

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!name.trim() || !email.includes('@')) { setError(t('err_name')); return }
    if (!offersVoice && !wantsFace) { setError(t('err_asset')); return }
    if (offersVoice && files.length === 0) { setError(t('err_sample')); return }
    if (!consent) { setError(t('err_consent')); return }
    const tallOk = (v: string) => v === '' || (/^\d{1,3}$/.test(v))
    if (!tallOk(aldFra) || !tallOk(aldTil) ||
        (aldFra !== '' && aldTil !== '' && Number(aldFra) > Number(aldTil))) {
      setError(t('err_age')); return
    }
    if (hoyde !== '' && (!/^\d{2,3}$/.test(hoyde) || Number(hoyde) < 50 || Number(hoyde) > 260)) {
      setError(t('err_height')); return
    }
    setBusy(true)
    try {
      const fd = new FormData()
      fd.append('name', name.trim())
      fd.append('email', email.trim())
      fd.append('phone', phone.trim())
      fd.append('bio', bio.trim())
      fd.append('wantsFace', wantsFace ? '1' : '0')
      fd.append('offersVoice', offersVoice ? '1' : '0')
      fd.append('consentText', consentText)
      fd.append('gender', kjoenn)
      fd.append('playingAgeFrom', aldFra)
      fd.append('playingAgeTo', aldTil)
      fd.append('heightCm', hoyde)
      fd.append('attributes', JSON.stringify(attr))
      fd.append('appearanceConsent', appearanceConsent ? '1' : '0')
      // Teksten foelger med bare naar den faktisk ble sagt ja til.
      if (appearanceConsent) fd.append('appearanceConsentText', appearanceConsentText)
      fd.append('website', website) // honeypot
      files.slice(0, 2).forEach((f) => fd.append('samples', f))
      const res = await fetch('/api/voice-bank/apply', { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || t('err_generic'))
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
          <h1 className="text-xl font-bold text-green-800 mb-2">{t('done_title')}</h1>
          <p className="text-sm text-green-700">
            {t('done_body', { email: email.trim() })}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[var(--paper)] px-6 py-12">
      <div className="max-w-lg mx-auto">
        <h1 className="text-3xl font-bold text-[var(--ink,#1C1A16)] mb-2">{t('h1', { tenant: appName })}</h1>
        <p className="text-sm text-gray-600 mb-8">
          {t('intro')}
        </p>

        <form onSubmit={submit} className="bg-white rounded-2xl border border-gray-200 p-6 space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('f_name')}</label>
            <input value={name} onChange={(e) => setName(e.target.value)} disabled={busy}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('f_email')}</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} disabled={busy}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('f_phone')}</label>
            <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} disabled={busy}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('f_bio')}</label>
            <textarea value={bio} onChange={(e) => setBio(e.target.value)} rows={3} disabled={busy}
              placeholder={t('bio_placeholder')}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('f_samples')}{offersVoice ? t('f_samples_req') : t('f_samples_opt')}</label>
            <input
              type="file"
              accept=".mp3,.wav,.m4a,audio/mpeg,audio/wav,audio/mp4"
              multiple
              disabled={busy}
              onChange={(e) => {
                const valgte = Array.from(e.target.files || []).slice(0, 2)
                for (const f of valgte) {
                  if (f.size > MAX_FILE_MB * 1024 * 1024) { setError(t('err_too_big', { name: f.name, mb: MAX_FILE_MB })); e.target.value = ''; return }
                  if (f.type && !AUDIO_TYPES.includes(f.type)) { setError(t('err_type', { name: f.name })); e.target.value = ''; return }
                }
                setError(null)
                setFiles(valgte)
              }}
              className="block w-full text-sm text-gray-500"
            />
            <p className="text-xs text-gray-400 mt-1">{t('samples_note', { mb: MAX_FILE_MB })}</p>
          </div>
          <div className="text-sm text-gray-700">
            <span className="block font-medium mb-1">{t('offer_label')}</span>
            <label className="flex items-start gap-2 mb-1">
              <input type="checkbox" checked={offersVoice} onChange={(e) => setOffersVoice(e.target.checked)} disabled={busy} className="mt-0.5" />
              {t('offer_voice')}
            </label>
            <label className="flex items-start gap-2">
              <input type="checkbox" checked={wantsFace} onChange={(e) => setWantsFace(e.target.checked)} disabled={busy} className="mt-0.5" />
              {t('offer_face')}
            </label>
          </div>
          {/* Castingfeltene. Star her, ikke i adminen: en rettighetshaver som
              slipper gjennom opptaket uten felt finnes ikke i katalogen. */}
          <div className="border-t border-gray-200 pt-5">
            <p className="text-sm font-semibold text-gray-900 mb-1">{t('casting_h')}</p>
            <p className="text-xs text-gray-500 mb-1">{t('casting_intro')}</p>
            <p className="text-xs text-gray-400 mb-4">{t('casting_optional')}</p>

            <div className="flex flex-wrap items-center gap-2 mb-3">
              <span className="text-sm text-gray-700 w-28">{tc('f_gender')}</span>
              <select value={kjoenn} onChange={(e) => setKjoenn(e.target.value)} disabled={busy}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white">
                <option value="">—</option>
                {KJOENN.map((g) => <option key={g} value={g}>{tc(`gender_${g}`)}</option>)}
              </select>
            </div>

            <div className="flex flex-wrap items-center gap-2 mb-1">
              <span className="text-sm text-gray-700 w-28">{tc('f_age')}</span>
              <input value={aldFra} onChange={(e) => setAldFra(e.target.value)} disabled={busy}
                inputMode="numeric" placeholder={tc('age_from')}
                className="w-20 px-2 py-1.5 border border-gray-300 rounded-lg text-sm" />
              <span className="text-gray-400">–</span>
              <input value={aldTil} onChange={(e) => setAldTil(e.target.value)} disabled={busy}
                inputMode="numeric" placeholder={tc('age_to')}
                className="w-20 px-2 py-1.5 border border-gray-300 rounded-lg text-sm" />
            </div>
            <p className="text-xs text-gray-400 mb-3 ml-28">{t('casting_age_hint')}</p>

            <div className="flex flex-wrap items-center gap-2 mb-4">
              <span className="text-sm text-gray-700 w-28">{tc('f_height')}</span>
              <input value={hoyde} onChange={(e) => setHoyde(e.target.value)} disabled={busy}
                inputMode="numeric" className="w-24 px-2 py-1.5 border border-gray-300 rounded-lg text-sm" />
              <span className="text-sm text-gray-500">{tc('admin_cm')}</span>
            </div>

            {FASETTER.filter((f) => !KREVER_SAMTYKKE.includes(f)).map((f) => (
              <div key={f} className="mb-3">
                <p className="text-sm text-gray-700 mb-1.5">{tc(`f_${f}`)}</p>
                <div className="flex flex-wrap gap-2">
                  {VOKABULAR[f].map((v) => {
                    const paa = (attr[f] ?? []).includes(v)
                    return (
                      <button key={v} type="button" disabled={busy} onClick={() => veksle(f, v)} aria-pressed={paa}
                        className="px-3 py-1.5 rounded-full text-sm border transition-colors"
                        style={paa
                          ? { borderColor: 'var(--ember-deep)', color: 'var(--ember-deep)', background: 'var(--ember-tint-bg)', fontWeight: 600 }
                          : { borderColor: '#d1d5db', color: '#6b7280' }}>
                        {tc(`${f}_${v}`)}
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}

            {/* Spilleomraade: EGET samtykke, gitt av soekeren selv. Star for seg
                fordi det daekker noe annet enn stemmesamtykket, og fordi man
                skal kunne si ja til det ene og nei til det andre. */}
            <div className="mt-4 rounded-lg border border-gray-200 p-3">
              <p className="text-sm text-gray-700 mb-1.5">{t('appearance_h')}</p>
              <label className="flex items-start gap-2 text-xs text-gray-600 mb-2">
                <input type="checkbox" checked={appearanceConsent} disabled={busy}
                  onChange={(e) => {
                    setAppearanceConsent(e.target.checked)
                    // Trekkes krysset, forsvinner valgene med det samme — ikke
                    // forst ved innsending.
                    if (!e.target.checked) setAttr((p2) => {
                      const n = { ...p2 }
                      for (const f of KREVER_SAMTYKKE) delete n[f]
                      return n
                    })
                  }}
                  className="mt-0.5" />
                <span>
                  {t('appearance_consent')}
                  <span className="block text-gray-500 mt-1">{appearanceConsentText}</span>
                </span>
              </label>
              {appearanceConsent ? (
                <div className="flex flex-wrap gap-2">
                  {KREVER_SAMTYKKE.flatMap((f) => VOKABULAR[f].map((v) => {
                    const paa = (attr[f] ?? []).includes(v)
                    return (
                      <button key={`${f}_${v}`} type="button" disabled={busy} onClick={() => veksle(f, v)} aria-pressed={paa}
                        className="px-3 py-1.5 rounded-full text-sm border transition-colors"
                        style={paa
                          ? { borderColor: 'var(--ember-deep)', color: 'var(--ember-deep)', background: 'var(--ember-tint-bg)', fontWeight: 600 }
                          : { borderColor: '#d1d5db', color: '#6b7280' }}>
                        {tc(`${f}_${v}`)}
                      </button>
                    )
                  }))}
                </div>
              ) : (
                <p className="text-xs text-gray-400">{t('appearance_hint')}</p>
              )}
            </div>
          </div>

          <label className="flex items-start gap-2 text-xs text-gray-600 bg-gray-50 border border-gray-200 rounded-lg p-3">
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} disabled={busy} className="mt-0.5" />
            <span>{consentText}</span>
          </label>

          {/* Honeypot — skjult for mennesker */}
          <input value={website} onChange={(e) => setWebsite(e.target.value)} tabIndex={-1} aria-hidden="true"
            autoComplete="off" name="website" style={{ position: 'absolute', left: -9999, width: 1, height: 1 }} />

          {error && <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">{error}</div>}

          <button type="submit" disabled={busy}
            className="w-full py-3 rounded-lg font-semibold text-[var(--on-ember)] bg-[var(--ember-deep)] hover:opacity-90 disabled:opacity-50">
            {busy ? t('sending') : t('submit')}
          </button>
        </form>
      </div>
    </div>
  )
}
