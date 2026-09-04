'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { useTranslations, useLocale } from 'next-intl'
import { getSupabase } from '@/lib/supabaseClient'
import { useTenant } from '@/lib/tenantContext'
import { campaignTemplates, type CampaignTemplate, type Locale } from '@/lib/campaignTemplates'

const VIDEO_FORMATS = [
  { value: '9:16', label: 'Portrait (TikTok)', color: 'blue' },
  { value: '16:9', label: 'Landscape', color: 'blue' },
  { value: '1:1', label: 'Square', color: 'blue' },
]

export default function NewDraftPage() {
  const router = useRouter()
  const params = useParams()
  const t = useTranslations('newDraft')
  const tenant = useTenant()
  const productId = params?.id as string

  const [topic, setTopic] = useState('')
  const [title, setTitle] = useState('')
  // Artister anbefales 8 scener (~5 s musikk per bilde, Lars 31/7);
  // øvrige vertikaler beholder 4. Tenant-konteksten kan komme async —
  // løft til 8 når vertikalen lander, men aldri over et aktivt brukervalg.
  const [segmentCount, setSegmentCount] = useState(tenant.vertical === 'music' ? 8 : 4)
  const [segmentCountTouched, setSegmentCountTouched] = useState(false)
  useEffect(() => {
    if (tenant.vertical === 'music' && !segmentCountTouched) setSegmentCount(8)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenant.vertical])
  const [targetAudience, setTargetAudience] = useState('')
  const [problem, setProblem] = useState('')
  const [tone, setTone] = useState('Energisk')
  const [character, setCharacter] = useState('')
  const [userChars, setUserChars] = useState<Array<{ id: string; name: string }>>([])
  const [faceActors, setFaceActors] = useState<Array<{ id: string; name: string; faceCharacterId: string; pricePerUseNok: number }>>([])
  useEffect(() => {
    (async () => {
      try {
        const { data: sess } = await getSupabase().auth.getSession()
        const token = sess?.session?.access_token
        const d = await fetch('/api/characters', token ? { headers: { Authorization: `Bearer ${token}` } } : undefined).then((r) => r.json())
        setUserChars((d.characters || []).filter((c: any) => c.status === 'ready'))
      } catch { /* karakterer utilgjengelige */ }
    })()
    ;(async () => {
      try {
        const { data: sess } = await getSupabase().auth.getSession()
        const token = sess?.session?.access_token
        const d = await fetch('/api/face-actors', token ? { headers: { Authorization: `Bearer ${token}` } } : undefined).then((r) => r.json())
        setFaceActors((d.faces || []).filter((f: any) => f.faceCharacterId))
      } catch { /* ansiktsbank utilgjengelig */ }
    })()
      .catch(() => {})
  }, [])
  const [perspective, setPerspective] = useState<'du' | 'jeg' | 'vi'>('du')
  const [perspectiveTouched, setPerspectiveTouched] = useState(false)
  // Artister snakker som seg selv (Lars 31/7): band → vi-form, solo →
  // jeg-form. Gjett fra artistprofilen (navn + beskrivelse); artistens
  // eget valg overstyres aldri.
  useEffect(() => {
    if (tenant.vertical !== 'music' || perspectiveTouched) return
    ;(async () => {
      try {
        const { data } = await getSupabase()
          .from('products')
          .select('name, description')
          .eq('id', productId)
          .single()
        if (perspectiveTouched) return
        const tekst = `${data?.name || ''} ${data?.description || ''}`.toLowerCase()
        const bandish = /\b(band|bandet|trio|duo|kvartett|kvintett|gruppe|gruppa|kollektiv|orkester|ensemble|medlemmer|brødre|søstre|we|our|members)\b/.test(tekst)
          || /\b(vi|oss|våre)\b/.test(tekst)
        setPerspective(bandish ? 'vi' : 'jeg')
      } catch { setPerspective('jeg') /* soloartist er tryggeste gjett */ }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenant.vertical])
  const [cta, setCta] = useState('')
  const locale = (useLocale() === 'en' ? 'en' : 'no') as Locale
  // Anledninger (celebration): «produktet» ER det videoen skal handle om, så
  // det brukeren skrev i «Ny anledning» gjenbrukes som utgangspunkt (Lars 4/9:
  // «bruk infoen som allerede er oppgitt»). Bare tomme felt fylles — alt
  // brukeren rakk å skrive før hentingen landet, beholdes.
  useEffect(() => {
    if (tenant.vertical !== 'celebration') return
    ;(async () => {
      try {
        const { data } = await getSupabase()
          .from('products')
          .select('name, description, category')
          .eq('id', productId)
          .single()
        if (!data) return
        const name = (data.name || '').trim()
        const description = (data.description || '').trim()
        if (name) setTitle((prev) => prev || name)
        if (description) setTopic((prev) => prev || description)
        // Standardoppfordring per anledningstype — invitasjon vs. hilsen.
        const cat = (data.category || '').toLowerCase()
        const defaultCta: Record<string, Record<Locale, string>> = {
          bursdag: { no: 'Kom og feir med oss!', en: 'Come celebrate with us!' },
          bryllup: { no: 'Svar på invitasjonen innen …', en: 'RSVP by …' },
          jubileum: { no: 'Bli med på feiringen!', en: 'Join the celebration!' },
          daap: { no: 'Velkommen til dåpen!', en: 'Welcome to the christening!' },
          konfirmasjon: { no: 'Velkommen til feiringen!', en: 'Welcome to the celebration!' },
          bedrift: { no: 'Velkommen innom!', en: 'Come by and see us!' },
        }
        const fallback: Record<Locale, string> = { no: 'Si fra om du kommer!', en: 'Let us know if you are coming!' }
        setCta((prev) => prev || (defaultCta[cat] || fallback)[locale])
        setTone((prev) => (prev === 'Energisk' ? 'Vennlig' : prev))
        if (!perspectiveTouched) setPerspective('vi')
      } catch { /* anledningen utilgjengelig — skjemaet fungerer tomt */ }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenant.vertical, productId])
  // Kampanjemaler (vertikal-gatet): forhåndsfyller brief-feltene som stillas.
  const templates = campaignTemplates(tenant.vertical)
  const [templateKey, setTemplateKey] = useState<string | null>(null)
  const applyTemplate = (tpl: CampaignTemplate) => {
    setTemplateKey(tpl.key)
    setTitle(tpl.prefill.title[locale])
    setTopic(tpl.prefill.topic[locale])
    setTargetAudience(tpl.prefill.targetAudience[locale])
    setProblem(tpl.prefill.problem[locale])
    setCta(tpl.prefill.cta[locale])
  }
  const [videoFormat, setVideoFormat] = useState('9:16')
  const [imageStyle, setImageStyle] = useState('editorial')
  const [includeOutroCard, setIncludeOutroCard] = useState(true)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

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
          tone,
          perspective,
          cta,
          videoFormat,
          includeOutroCard,
        }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Error creating draft')
      }

      const data = await response.json()
      router.push(`/dashboard/products/${productId}/video/draft/${data.draftId}?imageStyle=${imageStyle}&format=${encodeURIComponent(videoFormat)}&outro=${includeOutroCard ? '1' : '0'}&character=${encodeURIComponent(character)}`)
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
        <Link href={`/dashboard/products/${productId}`} className="text-[var(--ember-deep)] hover:text-[var(--ink)] mb-4 inline-block">
          {t('backToProduct')}
        </Link>

        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">{t('title')}</h1>
          <p className="text-gray-600 mt-2">{t('subtitle')}</p>
        </div>

        {/* Form */}
        <div className="bg-[var(--paper-raised)] rounded-lg border border-gray-200 p-8 space-y-8">
          <form onSubmit={handleSubmit} className="space-y-8">
            {/* Error */}
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
                {error}
              </div>
            )}

            {/* Kampanjemaler (kun vertikaler med maler, f.eks. music) */}
            {templates.length > 0 && (
              <div>
                <h2 className="text-xs font-bold text-gray-900 uppercase tracking-wide mb-1 block">
                  {locale === 'en' ? 'What are you promoting?' : 'Hva skal du promotere?'}
                </h2>
                <p className="text-sm text-gray-500 mb-4">
                  {locale === 'en'
                    ? 'Pick a template — the fields below get a starting point you edit freely.'
                    : 'Velg en mal — feltene under fylles ut som et utgangspunkt du redigerer fritt.'}
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {templates.map((tpl) => (
                    <button
                      key={tpl.key}
                      type="button"
                      onClick={() => applyTemplate(tpl)}
                      className={`text-left rounded-lg border p-3 transition-colors ${
                        templateKey === tpl.key
                          ? 'border-[var(--ember-deep)] bg-[var(--ember-tint-bg)]'
                          : 'border-gray-200 hover:border-[var(--ember-tint-border)]'
                      }`}
                    >
                      <div className="text-lg leading-none mb-1.5">{tpl.emoji}</div>
                      <div className="text-sm font-semibold text-gray-900">{tpl.label[locale]}</div>
                      <div className="text-xs text-gray-500 mt-0.5">{tpl.hint[locale]}</div>
                    </button>
                  ))}
                </div>
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
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[var(--ember-deep)] focus:border-transparent"
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
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[var(--ember-deep)] focus:border-transparent"
                    rows={4}
                  />
                </div>

                {/* Segment Count */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">{t('segmentsLabel')}</label>
                  <select
                    value={segmentCount}
                    onChange={(e) => { setSegmentCountTouched(true); setSegmentCount(Number(e.target.value)) }}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[var(--ember-deep)] focus:border-transparent"
                  >
                    <option value={2}>{t('seg2')}</option>
                    <option value={3}>{t('seg3')}</option>
                    <option value={4}>{t('seg4')}</option>
                    <option value={5}>{t('seg5')}</option>
                    <option value={6}>{t('seg6')}</option>
                    <option value={8}>{t('seg8')}</option>
                    <option value={10}>{t('seg10')}</option>
                  </select>
                  {/* Musikk-vertikalen: forklar HVORFOR mange korte scener
                      (Lars 31/7: ~5 s per bilde; stille scener er helt fint) */}
                  {tenant.vertical === 'music' && (
                    <p className="mt-1 text-xs text-gray-500">{t('segmentsHint')}</p>
                  )}
                </div>

                {/* Target Audience */}
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">{t('targetAudienceLabel')}</label>
                  <input
                    type="text"
                    value={targetAudience}
                    onChange={(e) => setTargetAudience(e.target.value)}
                    placeholder={t('targetAudiencePlaceholder')}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[var(--ember-deep)] focus:border-transparent"
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
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[var(--ember-deep)] focus:border-transparent"
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
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[var(--ember-deep)] focus:border-transparent"
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
                            : 'bg-[var(--paper-raised)] text-gray-700 border-gray-300 hover:border-gray-400'
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
                      onClick={() => { setPerspectiveTouched(true); setPerspective('du') }}
                      className={`px-4 py-2 rounded-full border text-sm font-medium transition-colors ${
                        perspective === 'du'
                          ? 'bg-green-600 text-white border-green-600'
                          : 'bg-[var(--paper-raised)] text-gray-700 border-gray-300 hover:border-gray-400'
                      }`}
                    >
                      {t('perspectiveYou')} <span className="text-xs opacity-70 ml-1">{t('perspectiveYouExample')}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => { setPerspectiveTouched(true); setPerspective('jeg') }}
                      className={`px-4 py-2 rounded-full border text-sm font-medium transition-colors ${
                        perspective === 'jeg'
                          ? 'bg-green-600 text-white border-green-600'
                          : 'bg-[var(--paper-raised)] text-gray-700 border-gray-300 hover:border-gray-400'
                      }`}
                    >
                      {t('perspectiveI')} <span className="text-xs opacity-70 ml-1">{t('perspectiveIExample')}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => { setPerspectiveTouched(true); setPerspective('vi') }}
                      className={`px-4 py-2 rounded-full border text-sm font-medium transition-colors ${
                        perspective === 'vi'
                          ? 'bg-green-600 text-white border-green-600'
                          : 'bg-[var(--paper-raised)] text-gray-700 border-gray-300 hover:border-gray-400'
                      }`}
                    >
                      {t('perspectiveWe')} <span className="text-xs opacity-70 ml-1">{t('perspectiveWeExample')}</span>
                    </button>
                  </div>
                  {tenant.vertical === 'music' && (
                    <p className="text-xs text-gray-400 mt-2">Soloartist? Velg jeg-form. Band? Velg vi-form. (Du kan finpusse teksten i segmentene etterpå.)</p>
                  )}
                </div>

                {/* Karakter (konsistent vert i alle segmentbilder via flux-lora).
                    For music-vertikalen forklares forskjellen fra artistbildet
                    eksplisitt (Lars' funn 2026-07-30: «jeg har jo allerede
                    lastet opp et artistbilde») — de er to ulike ting. */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    🧑‍🎤 {tenant.vertical === 'music' ? 'En person i videobildene (valgfritt)' : 'Karakter (valgfritt)'}
                  </label>
                  <select
                    value={character}
                    onChange={(e) => setCharacter(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-[var(--paper-raised)]"
                  >
                    <option value="">{tenant.vertical === 'music' ? 'Ingen — jeg bruker egne bilder' : 'Ingen — vanlige AI-bilder'}</option>
                    {/* Adam er eksklusiv for rot-tenanten (lib/characters.ts håndhever server-side) */}
                    {tenant.slug === 'centerforge' && <option value="adam">Adam (Reforhandle)</option>}
                    <option value="lawrence">Lawrence (Peregrine)</option>
                    {userChars.map((c) => (
                      <option key={c.id} value={c.id}>{c.name} (egen)</option>
                    ))}
                    {faceActors.length > 0 && (
                      <optgroup label="🧑 Skuespiller-ansikter (per bruk)">
                        {faceActors.map((f) => (
                          <option key={f.faceCharacterId} value={f.faceCharacterId}>{f.name} — {f.pricePerUseNok.toLocaleString('nb-NO')} kr per produksjon</option>
                        ))}
                      </optgroup>
                    )}
                  </select>
                  <p className="text-xs text-gray-400 mt-1">
                    {tenant.vertical === 'music'
                      ? <>Ikke det samme som artistbildet ditt (det brukes på sluttplakaten). Dette er en AI-versjon av et menneske som kan opptre i selve scenene — den lages fra flere bilder. <a href="/dashboard/characters" className="text-[var(--ember-deep)] hover:underline">Lag en AI-versjon av deg selv →</a></>
                      : <>Samme vert i alle videobildene (AI-persona). <a href="/dashboard/characters" className="text-[var(--ember-deep)] hover:underline">Lag din egen karakter →</a></>}
                  </p>
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
                            : 'bg-[var(--paper-raised)] text-gray-700 border-gray-300 hover:border-gray-400'
                        }`}
                      >
                        {fmt.label}
                      </button>
                    ))}
                  </div>
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
                        : 'border-gray-200 bg-[var(--paper-raised)] text-gray-600 hover:border-gray-400'
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
                  className="mt-1 h-4 w-4 text-[var(--ember-deep)] border-gray-300 rounded focus:ring-[var(--ember-deep)]"
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

            </div>

            {/* Buttons */}
            <div className="flex gap-3 pt-4">
              <button
                type="submit"
                disabled={loading}
                className={`flex-1 px-6 py-3 rounded-lg font-semibold text-[var(--on-ember)] transition-colors ${
                  loading ? 'bg-gray-400 cursor-not-allowed' : 'bg-[var(--ember-deep)] hover:bg-[var(--ink)]'
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
