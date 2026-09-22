'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import {
  FASETTER, KJOENN, KREVER_SAMTYKKE, VOKABULAR, type Fasett,
} from '@/lib/castingAttributes'

// Søknadsskjemaet (Claude Design 5C, 21.09.2026).
//
// Samtykketeksten fryses på søknadsraden (consent_text) — endres formuleringen,
// vet vi fortsatt nøyaktig hva hver søker samtykket til. Teksten hentes fra
// meldingsfila, og det er den SAMME strengen som vises og som fryses: raden
// skal bevare ordlyden søkeren faktisk leste, ikke en oversettelse av den.
//
// 🔑 CASTINGFELTENE HØRER HJEMME HER, ikke i adminen. Et tomt felt er ikke
// «alle» — det er USYNLIG i katalogen. Og spilleområde er art. 9 og skal være
// SELVERKLÆRT: fyller forvalteren det inn, er det en tredjepart som
// klassifiserer et menneske.
//
// ⚠️ Designmocken viser ikke castingfeltene — den ble tegnet uten dem. De er
// løsbærende og beholdes; layouten er designets, innholdet er vårt.

const MONO = 'var(--font-cfmono), ui-monospace, monospace'
const DISPLAY = 'var(--font-archivo), system-ui, sans-serif'

const MAX_FILE_MB = 10
const AUDIO_TYPES = ['audio/mpeg', 'audio/wav', 'audio/x-wav', 'audio/x-m4a', 'audio/mp4']

type Tilbud = 'stemme' | 'ansikt' | 'begge'

const felt: React.CSSProperties = {
  width: '100%', padding: '13px 14px', fontSize: 15,
  border: '1px solid var(--ds-border-strong)', background: 'var(--paper)',
  color: 'var(--ink)', borderRadius: 0, fontFamily: 'inherit',
}

function Etikett({ children }: { children: React.ReactNode }) {
  return (
    <span style={{ display: 'block', fontFamily: MONO, fontSize: 10.5, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--text-faint)', marginBottom: 7 }}>
      {children}
    </span>
  )
}

export default function ApplyForm() {
  const t = useTranslations('apply')
  const tc = useTranslations('casting')
  const consentText = t('consent')
  // Art. 9-teksten fryses for seg: den dekker noe annet enn stemmesamtykket,
  // og en søker kan si ja til det ene og nei til det andre.
  const appearanceConsentText = t('appearance_consent_text')

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [bio, setBio] = useState('')
  const [files, setFiles] = useState<File[]>([])
  // Bildene til ansiktsmodellen (091). Foer dette maatte de komme utenom
  // systemet, til et produkt som selger sporbarhet.
  const [photos, setPhotos] = useState<File[]>([])
  const [tilbud, setTilbud] = useState<Tilbud>('stemme')
  const [consent, setConsent] = useState(false)
  const [website, setWebsite] = useState('') // honeypot
  const [kjoenn, setKjoenn] = useState('')
  const [aldFra, setAldFra] = useState('')
  const [aldTil, setAldTil] = useState('')
  const [hoyde, setHoyde] = useState('')
  const [attr, setAttr] = useState<Record<string, string[]>>({})
  const [appearanceConsent, setAppearanceConsent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // De tre segmentene er én beslutning for søkeren, men to kolonner i basen.
  const offersVoice = tilbud !== 'ansikt'
  const wantsFace = tilbud !== 'stemme'

  const veksle = (f: Fasett, v: string) => setAttr((p) => {
    const naa = p[f] ?? []
    return { ...p, [f]: naa.includes(v) ? naa.filter((x) => x !== v) : [...naa, v] }
  })

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!name.trim() || !email.includes('@')) { setError(t('err_name')); return }
    // 🔑 LYDPROEVE ER IKKE LENGER ET KRAV (Lars 22.09). Vi screener ikke paa
    // stemmen foerst — vi gaar ut fra at den som soeker har en stemme. Hoeringen
    // flyttes til opptaksloeypa (095), der vi uansett hoerer dem ordentlig i
    // tretti minutter framfor gjennom et telefonklipp. Kravet stengte nettopp
    // den soekeren loeypa ble bygget for: hen uten hjemmestudio.
    // Filen er fortsatt velkommen — en skuespiller med reel faar en bedre
    // profil fra dag én — men den er et tilbud, ikke en terskel.
    if (wantsFace && photos.length < 10) { setError('Ansiktsmodellen trenger minst 10 bilder — 15–25 gir merkbart bedre likhet.'); return }
    if (!consent) { setError(t('err_consent')); return }
    const tallOk = (v: string) => v === '' || /^\d{1,3}$/.test(v)
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
      fd.append('website', website) // honeypot
      fd.append('gender', kjoenn)
      fd.append('playingAgeFrom', aldFra)
      fd.append('playingAgeTo', aldTil)
      fd.append('heightCm', hoyde)
      fd.append('attributes', JSON.stringify(attr))
      fd.append('appearanceConsent', appearanceConsent ? '1' : '0')
      if (appearanceConsent) fd.append('appearanceConsentText', appearanceConsentText)
      files.slice(0, 2).forEach((f) => fd.append('samples', f))
      photos.slice(0, 30).forEach((f) => fd.append('photos', f))
      const res = await fetch('/api/voice-bank/apply', { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || t('err_generic'))
      setDone(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('err_generic'))
    } finally {
      setBusy(false)
    }
  }

  if (done) {
    return (
      <div style={{ border: '1px solid var(--ds-border-strong)', background: 'var(--paper-raised)', padding: 32 }}>
        <h2 style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 21, letterSpacing: '-0.02em', margin: '0 0 8px' }}>{t('done_title')}</h2>
        <p style={{ fontSize: 15, lineHeight: 1.55, color: 'var(--ink-soft)', margin: 0 }}>{t('done_body', { email: email.trim() })}</p>
      </div>
    )
  }

  return (
    <form onSubmit={submit} style={{ border: '1px solid var(--ds-border-strong)', background: 'var(--paper-raised)', padding: 'clamp(24px, 3vw, 34px)' }}>
      <h2 style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 24, letterSpacing: '-0.025em', margin: '0 0 22px' }}>{t('form_h')}</h2>

      <label style={{ display: 'block', marginBottom: 16 }}>
        <Etikett>{t('f_name')}</Etikett>
        <input value={name} onChange={(e) => setName(e.target.value)} disabled={busy} placeholder={t('name_ph')} style={felt} />
      </label>
      <label style={{ display: 'block', marginBottom: 16 }}>
        <Etikett>{t('f_email')}</Etikett>
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} disabled={busy} placeholder={t('email_ph')} style={felt} />
      </label>
      <label style={{ display: 'block', marginBottom: 20 }}>
        <Etikett>{t('f_phone')} <span style={{ color: 'var(--text-faint)', letterSpacing: 0, textTransform: 'none' }}>{t('phone_opt')}</span></Etikett>
        <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} disabled={busy} placeholder={t('phone_ph')} style={felt} />
      </label>

      {/* Tre segmenter, ikke to avkryssingsbokser: for søkeren er dette ÉN
          beslutning, selv om den blir to kolonner i basen. */}
      <div style={{ marginBottom: 20 }}>
        <Etikett>{t('offer_label')}</Etikett>
        <div style={{ display: 'flex', border: '1px solid var(--ds-border-strong)' }}>
          {(['stemme', 'ansikt', 'begge'] as Tilbud[]).map((v, i) => {
            const paa = tilbud === v
            return (
              <button key={v} type="button" disabled={busy} onClick={() => setTilbud(v)} aria-pressed={paa}
                style={{
                  flex: 1, padding: '11px 8px', fontSize: 14.5, cursor: 'pointer',
                  fontFamily: DISPLAY, fontWeight: paa ? 700 : 500,
                  border: 'none', borderLeft: i === 0 ? 'none' : '1px solid var(--ds-border-strong)',
                  background: paa ? 'var(--ink)' : 'var(--paper)',
                  color: paa ? 'var(--paper)' : 'var(--ink-soft)',
                }}>
                {t(v === 'stemme' ? 'offer_voice' : v === 'ansikt' ? 'offer_face' : 'offer_both')}
              </button>
            )
          })}
        </div>
      </div>

      {offersVoice && (
        <div style={{ marginBottom: 20 }}>
          <Etikett>{t('samples_h')}</Etikett>
          <label style={{ display: 'block', border: '1.5px dashed var(--ds-border-strong)', background: 'var(--paper)', padding: '22px 16px', textAlign: 'center', cursor: busy ? 'default' : 'pointer' }}>
            <span style={{ display: 'block', fontSize: 14.5, color: 'var(--ink-soft)', marginBottom: 4 }}>
              {files.length > 0 ? files.map((f) => f.name).join(', ') : t('drop_h')}
            </span>
            <span style={{ fontFamily: MONO, fontSize: 11, color: 'var(--text-faint)' }}>{t('samples_note', { mb: MAX_FILE_MB })}</span>
            <input type="file" accept=".mp3,.wav,.m4a,audio/mpeg,audio/wav,audio/mp4" multiple disabled={busy}
              style={{ display: 'none' }}
              onChange={(e) => {
                const valgte = Array.from(e.target.files || []).slice(0, 2)
                for (const f of valgte) {
                  if (f.size > MAX_FILE_MB * 1024 * 1024) { setError(t('err_too_big', { name: f.name, mb: MAX_FILE_MB })); e.target.value = ''; return }
                  if (f.type && !AUDIO_TYPES.includes(f.type)) { setError(t('err_type', { name: f.name })); e.target.value = ''; return }
                }
                setError(null)
                setFiles(valgte)
              }} />
          </label>
        </div>
      )}

      {/* Bildene til ansiktsmodellen. Staar her, i soeknaden, og ikke i en
          e-post: da kommer de fra soekeren selv, med et tidsstempel og en rad
          aa henge dem paa. */}
      {wantsFace && (
        <div style={{ marginBottom: 20 }}>
          <Etikett>Bilder til ansiktsmodellen</Etikett>
          <label style={{ display: 'block', border: '1.5px dashed var(--ds-border-strong)', background: 'var(--paper)', padding: '22px 16px', textAlign: 'center', cursor: busy ? 'default' : 'pointer' }}>
            <span style={{ display: 'block', fontSize: 14.5, color: 'var(--ink-soft)', marginBottom: 4 }}>
              {photos.length > 0 ? `${photos.length} bilder valgt` : 'Velg 15–25 bilder'}
            </span>
            <span style={{ fontFamily: MONO, fontSize: 11, color: 'var(--text-faint)' }}>
              JPG, PNG eller WebP — minst 10, helst 15–25. Deg alene, ulike vinkler, uttrykk og lys
            </span>
            <input type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={busy}
              style={{ display: 'none' }}
              onChange={(e) => {
                const valgte = Array.from(e.target.files || []).slice(0, 20)
                for (const f of valgte) {
                  if (f.size > MAX_FILE_MB * 1024 * 1024) { setError(t('err_too_big', { name: f.name, mb: MAX_FILE_MB })); e.target.value = ''; return }
                }
                setError(null)
                setPhotos(valgte)
              }} />
          </label>
          <p style={{ fontSize: 13, lineHeight: 1.55, color: 'var(--text-muted)', margin: '8px 0 0' }}>
            Når modellen er trent, får du den tilsendt for godkjenning: du ser tre bilder
            laget med den, og svarer ja eller nei. Den kan ikke brukes til noe før du har sagt ja.
          </p>
        </div>
      )}


      <label style={{ display: 'block', marginBottom: 24 }}>
        <Etikett>{t('f_bio')}</Etikett>
        <textarea value={bio} onChange={(e) => setBio(e.target.value)} rows={3} disabled={busy}
          placeholder={t('bio_placeholder')} style={{ ...felt, resize: 'vertical' }} />
      </label>

      {/* Castingfeltene. Står her og ikke i adminen — se toppkommentaren. */}
      <div style={{ borderTop: '1px solid var(--ds-border)', paddingTop: 22, marginBottom: 22 }}>
        <p style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 16, margin: '0 0 6px' }}>{t('casting_h')}</p>
        <p style={{ fontSize: 13.5, lineHeight: 1.55, color: 'var(--text-muted)', margin: '0 0 18px' }}>{t('casting_intro')}</p>

        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
          <label style={{ flex: '1 1 130px' }}>
            <Etikett>{tc('f_gender')}</Etikett>
            <select value={kjoenn} onChange={(e) => setKjoenn(e.target.value)} disabled={busy} style={felt}>
              <option value="">—</option>
              {KJOENN.map((g) => <option key={g} value={g}>{tc(`gender_${g}`)}</option>)}
            </select>
          </label>
          <div style={{ flex: '1 1 160px' }}>
            <Etikett>{tc('f_age')}</Etikett>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <input value={aldFra} onChange={(e) => setAldFra(e.target.value)} disabled={busy} inputMode="numeric" placeholder={tc('age_from')} aria-label={tc('age_from')} style={{ ...felt, width: 70 }} />
              <span style={{ color: 'var(--text-faint)' }}>–</span>
              <input value={aldTil} onChange={(e) => setAldTil(e.target.value)} disabled={busy} inputMode="numeric" placeholder={tc('age_to')} aria-label={tc('age_to')} style={{ ...felt, width: 70 }} />
            </div>
          </div>
          <label style={{ flex: '0 1 120px' }}>
            <Etikett>{tc('f_height')}</Etikett>
            <input value={hoyde} onChange={(e) => setHoyde(e.target.value)} disabled={busy} inputMode="numeric" placeholder={tc('admin_cm')} style={felt} />
          </label>
        </div>
        <p style={{ fontSize: 12.5, lineHeight: 1.5, color: 'var(--text-faint)', margin: '0 0 18px' }}>{t('casting_age_hint')}</p>

        {FASETTER.filter((f) => !KREVER_SAMTYKKE.includes(f)).map((f) => (
          <div key={f} style={{ marginBottom: 14 }}>
            <Etikett>{tc(`f_${f}`)}</Etikett>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {VOKABULAR[f].map((v) => <Chip key={v} paa={(attr[f] ?? []).includes(v)} busy={busy} onClick={() => veksle(f, v)}>{tc(`${f}_${v}`)}</Chip>)}
            </div>
          </div>
        ))}

        {/* Spilleområde: EGET samtykke, gitt av søkeren selv. */}
        <div style={{ border: '1px solid var(--ds-border)', padding: 14, marginTop: 16 }}>
          <label style={{ display: 'flex', alignItems: 'flex-start', gap: 9, fontSize: 13.5, color: 'var(--ink-soft)' }}>
            <input type="checkbox" checked={appearanceConsent} disabled={busy} style={{ marginTop: 3 }}
              onChange={(e) => {
                setAppearanceConsent(e.target.checked)
                // Trekkes krysset, forsvinner valgene med det samme — ikke
                // først ved innsending.
                if (!e.target.checked) setAttr((p) => {
                  const n = { ...p }
                  for (const f of KREVER_SAMTYKKE) delete n[f]
                  return n
                })
              }} />
            <span>
              {t('appearance_consent')}
              <span style={{ display: 'block', color: 'var(--text-muted)', fontSize: 12.5, lineHeight: 1.5, marginTop: 5 }}>{appearanceConsentText}</span>
            </span>
          </label>
          {appearanceConsent ? (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 12 }}>
              {KREVER_SAMTYKKE.flatMap((f) => VOKABULAR[f].map((v) => (
                <Chip key={`${f}_${v}`} paa={(attr[f] ?? []).includes(v)} busy={busy} onClick={() => veksle(f, v)}>{tc(`${f}_${v}`)}</Chip>
              )))}
            </div>
          ) : (
            <p style={{ fontSize: 12.5, color: 'var(--text-faint)', margin: '10px 0 0' }}>{t('appearance_hint')}</p>
          )}
        </div>
      </div>

      <label style={{ display: 'flex', alignItems: 'flex-start', gap: 9, fontSize: 12.5, lineHeight: 1.55, color: 'var(--text-muted)', background: 'var(--paper)', border: '1px solid var(--ds-border)', padding: 14, marginBottom: 20 }}>
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} disabled={busy} style={{ marginTop: 2 }} />
        <span>{consentText}</span>
      </label>

      {/* Honeypot — skjult for mennesker */}
      <input value={website} onChange={(e) => setWebsite(e.target.value)} tabIndex={-1} aria-hidden="true"
        autoComplete="off" name="website" style={{ position: 'absolute', left: -9999, width: 1, height: 1 }} />

      {error && (
        <div style={{ border: '1px solid var(--ember-tint-border)', background: 'var(--ember-tint-bg)', color: 'var(--ember-deep)', padding: '12px 14px', fontSize: 14, marginBottom: 16 }}>{error}</div>
      )}

      <button type="submit" disabled={busy}
        style={{ width: '100%', padding: '15px 24px', fontFamily: DISPLAY, fontWeight: 700, fontSize: 16, background: 'var(--ember-deep)', color: 'var(--on-ember)', border: 'none', cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.6 : 1 }}>
        {busy ? t('sending') : t('submit')}
      </button>
      <p style={{ fontSize: 12.5, lineHeight: 1.5, color: 'var(--text-faint)', margin: '12px 0 0', textAlign: 'center' }}>{t('no_obligation')}</p>
    </form>
  )
}

function Chip({ paa, busy, onClick, children }: { paa: boolean; busy: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" disabled={busy} onClick={onClick} aria-pressed={paa}
      style={{
        fontSize: 13, padding: '5px 10px', cursor: busy ? 'default' : 'pointer',
        color: paa ? 'var(--on-ember)' : 'var(--ink-soft)',
        background: paa ? 'var(--ink)' : 'var(--paper)',
        border: '1px solid ' + (paa ? 'var(--ink)' : 'var(--ds-border-strong)'),
      }}>{children}</button>
  )
}
