"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useTranslations } from "next-intl";

const norwegianVoices = [
  { id: 'nhvaqgRyAq6BmFs3WcdX', name: 'Norsk stemme 1' },
  { id: 's2xtA7B2CTXPPlJzch1v', name: 'Norsk stemme 2' },
  { id: '2dhHLsmg0MVma2t041qT', name: 'Norsk stemme 3' },
  { id: 'BGEU6wFi2uNm6Kje1Yhk', name: 'Norsk stemme 4' },
  { id: 'CMbvLbbccSd611KtwxV3', name: 'Norsk stemme 5' },
  { id: 'vUmLiNBm6MDcy1NUHaVr', name: 'Norsk stemme 6' },
  { id: 'uNsWM1StCcpydKYOjKyu', name: 'Norsk stemme 7' },
];

interface Segment {
  text: string;
  imagePrompt: string;
}

export default function NewCampaignPage() {
  const router = useRouter();
  const t = useTranslations('newCampaign');

  const TONES = [
    { value: "friendly", label: t('toneFriendly') },
    { value: "energetic", label: t('toneEnergetic') },
    { value: "professional", label: t('toneProfessional') },
    { value: "calm", label: t('toneCalm') },
  ];

  const MUSIC_STYLES = [
    { value: "upbeat", label: t('musicUpbeat') },
    { value: "minimal", label: t('musicMinimal') },
    { value: "cinematic", label: t('musicCinematic') },
  ];

  const SERVICES = [
    { value: "reforhandle", label: "Reforhandle" },
    { value: "singlepicker", label: "SinglePicker" },
    { value: "custom", label: t('serviceCustom') },
  ];

  const [productId, setProductId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [scriptLoading, setScriptLoading] = useState(false);

  // Extract productId from URL on client side
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setProductId(params.get('productId'));
  }, []);
  const [campaignType, setCampaignType] = useState<"reklame" | "storytelling">("reklame");
  const [segments, setSegments] = useState<Segment[]>([]);
  const [musicLibrary, setMusicLibrary] = useState<Array<{ filename: string; name: string; folder?: string; url: string; size: number }>>([]);
  const [selectedMusicFolder, setSelectedMusicFolder] = useState('global');
  const [selectedMusic, setSelectedMusic] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "",
    productName: "",
    headline: "",
    bodyCopy: "",
    cta: "",
    tone: "friendly",
    service: "reforhandle",
    voiceId: 'nhvaqgRyAq6BmFs3WcdX',
    voiceover: true,
    music: true,
    musicStyle: "upbeat",
    formats: ["16:9", "9:16", "1:1"] as string[],
    targetAudience: "",
    problem: "",
  });

  // Load music library via API proxy
  useEffect(() => {
    fetch('/api/music')
      .then((res) => res.json())
      .then((data) => {
        if (data.files && Array.isArray(data.files)) {
          setMusicLibrary(data.files)
        }
      })
      .catch((err) => console.error('Failed to load music library:', err))
  }, [])

  function toggle(format: string) {
    setForm((f) => ({
      ...f,
      formats: f.formats.includes(format)
        ? f.formats.filter((x) => x !== format)
        : [...f.formats, format],
    }));
  }

  function updateSegment(index: number, field: keyof Segment, value: string) {
    setSegments((prev) =>
      prev.map((seg, i) => (i === index ? { ...seg, [field]: value } : seg))
    );
  }

  async function handleGenerateScript() {
    setScriptLoading(true);
    setSegments([]);
    try {
      const res = await fetch('/api/content/generate-script', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetAudience: form.targetAudience,
          problem: form.problem,
          productName: form.productName,
          service: form.service,
          cta: form.cta,
        }),
      });
      if (!res.ok) throw new Error('Script generation failed');
      const { segments: generated } = await res.json();
      setSegments(generated);
    } catch (err) {
      console.error('Script generation failed:', err);
    } finally {
      setScriptLoading(false);
    }
  }

  async function handleProduksjon() {
    setLoading(true);
    try {
      const payload: Record<string, unknown> = {
        campaignId: `campaign-${Date.now()}`,
        service: form.service,
        voiceId: form.voiceId,
        cta: form.cta,
        formats: form.formats, // Include selected formats
        musicFile: selectedMusic, // Include selected music
        productId: productId || undefined, // Include product ID if available
      };

      if (campaignType === "storytelling" && segments.length > 0) {
        payload.segments = segments;
      } else {
        payload.headline = form.headline;
        payload.bodyCopy = form.bodyCopy;
        payload.tone = form.tone;
      }

      const res = await fetch('/api/content/produce/video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) throw new Error('API error');
      const { jobId } = await res.json();
      router.push(`/dashboard/${jobId}`);
    } catch (err) {
      console.error('Production failed:', err);
      setLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    handleProduksjon();
  }

  const storytellingReady =
    campaignType === "storytelling" && segments.length > 0;

  return (
    <div className="max-w-2xl">
      <div className="flex items-center gap-3 mb-8">
        <Link
          href="/dashboard"
          className="text-gray-500 hover:text-gray-900 text-sm transition-colors"
        >
          {t('back')}
        </Link>
        <span className="text-gray-300">/</span>
        <h1 className="text-xl font-bold text-gray-900">{t('title')}</h1>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-6">
        {/* Campaign type toggle */}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => { setCampaignType("reklame"); setSegments([]); }}
            className={`flex-1 py-2 px-4 rounded-lg font-medium transition-colors ${
              campaignType === "reklame"
                ? "bg-[var(--ember-deep)] text-[var(--on-ember)]"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
          >
            {t('typeAd')}
          </button>
          <button
            type="button"
            onClick={() => setCampaignType("storytelling")}
            className={`flex-1 py-2 px-4 rounded-lg font-medium transition-colors ${
              campaignType === "storytelling"
                ? "bg-[var(--ember-deep)] text-[var(--on-ember)]"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
          >
            {t('typeStorytelling')}
          </button>
        </div>

        {/* Basic info */}
        <div className="rounded-2xl border border-gray-200 bg-white p-6 flex flex-col gap-4 shadow-sm">
          <h2 className="font-semibold text-gray-700 text-sm uppercase tracking-widest">
            {campaignType === "reklame" ? t('sectionBasic') : t('sectionStory')}
          </h2>

          <Field label={t('campaignNameLabel')}>
            <input
              required
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Reforhandle Spring 2026"
              className={inputClass}
            />
          </Field>

          <Field label={t('serviceLabel')}>
            <select
              value={form.service}
              onChange={(e) =>
                setForm((f) => ({ ...f, service: e.target.value }))
              }
              className={inputClass}
            >
              {SERVICES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </Field>

          <Field label={t('productNameLabel')}>
            <input
              required
              value={form.productName}
              onChange={(e) =>
                setForm((f) => ({ ...f, productName: e.target.value }))
              }
              placeholder="Reforhandle"
              className={inputClass}
            />
          </Field>
        </div>

        {/* Copy */}
        <div className="rounded-2xl border border-gray-200 bg-white p-6 flex flex-col gap-4 shadow-sm">
          <h2 className="font-semibold text-gray-700 text-sm uppercase tracking-widest">
            {campaignType === "reklame" ? t('sectionContent') : t('sectionStoryElements')}
          </h2>

          {campaignType === "reklame" && (
            <Field label={t('headlineLabel', { count: form.headline.length })}>
              <input
                required
                maxLength={40}
                value={form.headline}
                onChange={(e) =>
                  setForm((f) => ({ ...f, headline: e.target.value }))
                }
                placeholder="Save thousands on electricity and internet"
                className={inputClass}
              />
            </Field>
          )}

          {campaignType === "storytelling" && (
            <Field label={t('targetAudienceLabel')}>
              <input
                required
                value={form.targetAudience}
                onChange={(e) =>
                  setForm((f) => ({ ...f, targetAudience: e.target.value }))
                }
                placeholder={t('targetAudiencePlaceholder')}
                className={inputClass}
              />
            </Field>
          )}

          {campaignType === "storytelling" && (
            <Field label={t('problemLabel')}>
              <input
                required
                value={form.problem}
                onChange={(e) =>
                  setForm((f) => ({ ...f, problem: e.target.value }))
                }
                placeholder={t('problemPlaceholder')}
                className={inputClass}
              />
            </Field>
          )}

          <Field label={t('voiceLabel')}>
            <select
              value={form.voiceId}
              onChange={(e) => setForm(f => ({ ...f, voiceId: e.target.value }))}
              className={inputClass}
            >
              {norwegianVoices.map(v => (
                <option key={v.id} value={v.id}>{v.name}</option>
              ))}
            </select>
          </Field>

          {campaignType === "reklame" && (
            <Field label={t('bodyLabel', { count: form.bodyCopy.length })}>
              <textarea
                required
                maxLength={125}
                value={form.bodyCopy}
                onChange={(e) =>
                  setForm((f) => ({ ...f, bodyCopy: e.target.value }))
                }
                placeholder="We negotiate your subscriptions — you only pay for results."
                rows={3}
                className={inputClass + " resize-none"}
              />
            </Field>
          )}

          <Field label={t('ctaLabel')}>
            <input
              required
              value={form.cta}
              onChange={(e) => setForm((f) => ({ ...f, cta: e.target.value }))}
              placeholder="Start for free"
              className={inputClass}
            />
          </Field>

          {campaignType === "reklame" && (
            <Field label={t('toneLabel')}>
              <div className="flex flex-wrap gap-2">
                {TONES.map((t) => (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, tone: t.value }))}
                    className={`rounded-full px-4 py-1.5 text-sm font-medium border transition-colors ${
                      form.tone === t.value
                        ? "bg-green-600 border-green-600 text-white"
                        : "border-gray-300 text-gray-600 hover:border-gray-400 bg-white"
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </Field>
          )}
        </div>

        {/* Media options */}
        <div className="rounded-2xl border border-gray-200 bg-white p-6 flex flex-col gap-4 shadow-sm">
          <h2 className="font-semibold text-gray-700 text-sm uppercase tracking-widest">
            {t('sectionMedia')}
          </h2>

          <div className="flex gap-4">
            <Toggle
              label={t('voiceoverLabel')}
              checked={form.voiceover}
              onChange={(v) => setForm((f) => ({ ...f, voiceover: v }))}
            />
            <Toggle
              label={t('backgroundMusicLabel')}
              checked={form.music}
              onChange={(v) => setForm((f) => ({ ...f, music: v }))}
            />
          </div>

          {form.music && (
            <Field label={t('musicStyleLabel')}>
              <div className="flex flex-wrap gap-2">
                {MUSIC_STYLES.map((m) => (
                  <button
                    key={m.value}
                    type="button"
                    onClick={() =>
                      setForm((f) => ({ ...f, musicStyle: m.value }))
                    }
                    className={`rounded-full px-4 py-1.5 text-sm font-medium border transition-colors ${
                      form.musicStyle === m.value
                        ? "bg-green-600 border-green-600 text-white"
                        : "border-gray-300 text-gray-600 hover:border-gray-400 bg-white"
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </Field>
          )}

          <Field label={t('formatsLabel')}>
            <div className="flex gap-2">
              {(["16:9", "9:16", "1:1"] as const).map((fmt) => (
                <button
                  key={fmt}
                  type="button"
                  onClick={() => toggle(fmt)}
                  className={`rounded-full px-4 py-1.5 text-sm font-medium border transition-colors ${
                    form.formats.includes(fmt)
                      ? "bg-green-600 border-green-600 text-white"
                      : "border-gray-300 text-gray-600 hover:border-gray-400 bg-white"
                  }`}
                >
                  {fmt}
                </button>
              ))}
            </div>
          </Field>

          <Field label={t('musicLibraryLabel')}>
            <div className="space-y-4">
              {/* Upload form */}
              <div className="border-2 border-dashed border-gray-300 rounded-lg p-4">
                <div className="grid grid-cols-2 gap-3 mb-3">
                  <label className="block">
                    <span className="text-xs font-medium text-gray-700 block mb-1">{t('folderLabel')}</span>
                    <select
                      id="musicFolder"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                      value={selectedMusicFolder}
                      onChange={(e) => setSelectedMusicFolder(e.target.value)}
                    >
                      <option value="global">{t('folderGlobal')}</option>
                      <option value="bildeal">BilDeal</option>
                      <option value="reforhandle">Reforhandle</option>
                      <option value="singlepicker">SinglePicker</option>
                    </select>
                  </label>
                  <label className="block">
                    <span className="text-xs font-medium text-gray-700 block mb-1">{t('fileLabel')}</span>
                    <input
                      type="file"
                      accept=".mp3"
                      onChange={async (e) => {
                        const file = e.currentTarget.files?.[0]
                        if (!file) return
                        
                        // Validate file type
                        if (!file.name.toLowerCase().endsWith('.mp3')) {
                          alert(t('alertMp3Only'))
                          e.currentTarget.value = ''
                          return
                        }
                        
                        // Validate file size (4MB limit)
                        const maxSize = 4 * 1024 * 1024 // 4MB
                        if (file.size > maxSize) {
                          alert(t('alertFileTooLarge', { size: (file.size / 1024 / 1024).toFixed(1) }))
                          e.currentTarget.value = ''
                          return
                        }
                        
                        const folder = (document.getElementById('musicFolder') as HTMLSelectElement)?.value || 'global'
                        const formData = new FormData()
                        formData.append('file', file)
                        
                        try {
                          // Upload via Netlify proxy (within 4.5MB limit)
                          const res = await fetch('/api/music/upload?' + new URLSearchParams({ folder }).toString(), {
                            method: 'POST',
                            body: formData,
                          })
                          if (res.ok) {
                            // Reload music library
                            const data = await fetch('/api/music').then(r => r.json())
                            if (data.files) setMusicLibrary(data.files)
                            alert(t('alertMusicUploaded'))
                            e.currentTarget.value = ''
                          } else {
                            const error = await res.text()
                            console.error('Upload error:', error)
                            alert(`Upload failed: ${error}`)
                          }
                        } catch (err) {
                          console.error('Upload error:', err)
                          alert('Upload failed: ' + (err instanceof Error ? err.message : 'Unknown error'))
                        }
                      }}
                      className="block w-full text-sm text-gray-500 file:mr-2 file:rounded file:border-0 file:bg-[var(--ember-deep)] file:px-2 file:py-1 file:text-xs file:font-medium file:text-[var(--on-ember)] hover:file:bg-[var(--ink)]"
                    />
                  </label>
                </div>
              </div>

              {/* Music library - filtered by selected folder (always include global) */}
              {musicLibrary.length > 0 ? (
                <>
                  {(() => {
                    const filteredMusic = musicLibrary.filter(track => 
                      track.folder === 'global' || track.folder === selectedMusicFolder
                    )
                    return (
                      <div className="grid gap-2">
                        {filteredMusic.map((music: any) => (
                    <button
                      key={music.filename}
                      type="button"
                      onClick={() => {
                        // Store selected music path for job submission
                        setSelectedMusic(music.filename)
                      }}
                      className={`text-left p-3 border-2 rounded-lg transition-colors ${
                        selectedMusic === music.filename
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
                      <audio
                        controls
                        className="mt-2 w-full h-6"
                        src={`/api/music/${encodeURIComponent(music.filename)}`}
                      />
                        </button>
                        ))}
                      </div>
                    )
                  })()}
                </>
              ) : (
                <p className="text-gray-500 text-sm">{t('loadingMusic')}</p>
              )}
            </div>
          </Field>
        </div>

        {/* Storytelling: Generate script button */}
        {campaignType === "storytelling" && segments.length === 0 && (
          <button
            type="button"
            onClick={handleGenerateScript}
            disabled={
              scriptLoading ||
              !form.targetAudience ||
              !form.problem ||
              !form.productName ||
              !form.cta
            }
            className="rounded-full bg-[var(--ember-deep)] hover:bg-[var(--ink)] disabled:opacity-50 text-[var(--on-ember)] font-semibold py-3 text-sm transition-colors"
          >
            {scriptLoading ? t('generatingScript') : t('generateScript')}
          </button>
        )}

        {/* Storytelling: Editable segments */}
        {campaignType === "storytelling" && segments.length > 0 && (
          <div className="rounded-2xl border border-blue-200 bg-blue-50 p-6 flex flex-col gap-5 shadow-sm">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-[var(--ink)] text-sm uppercase tracking-widest">
                {t('scriptTitle')}
              </h2>
              <button
                type="button"
                onClick={handleGenerateScript}
                disabled={scriptLoading}
                className="text-xs text-[var(--ember-deep)] hover:text-[var(--ink)] underline disabled:opacity-50"
              >
                {scriptLoading ? t('regenerating') : t('regenerate')}
              </button>
            </div>

            {segments.map((seg, i) => (
              <div key={i} className="flex flex-col gap-2">
                <span className="text-xs font-semibold text-[var(--ember-deep)] uppercase tracking-wide">
                  {t('segmentLabel', { index: i + 1 })}
                </span>
                <Field label={t('voiceoverTextLabel')}>
                  <textarea
                    value={seg.text}
                    onChange={(e) => updateSegment(i, "text", e.target.value)}
                    rows={2}
                    className={inputClass + " resize-none"}
                  />
                </Field>
                <Field label={t('imagePromptLabel')}>
                  <textarea
                    value={seg.imagePrompt}
                    onChange={(e) =>
                      updateSegment(i, "imagePrompt", e.target.value)
                    }
                    rows={2}
                    className={inputClass + " resize-none"}
                  />
                </Field>
              </div>
            ))}
          </div>
        )}

        {/* Start produksjon — shown for reklame always, for storytelling only after segments */}
        {(campaignType === "reklame" || storytellingReady) && (
          <button
            type="button"
            onClick={handleProduksjon}
            disabled={loading || form.formats.length === 0}
            className="rounded-full bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white font-semibold py-3 text-sm transition-colors"
          >
            {loading ? t('startingProduction') : t('startProduction')}
          </button>
        )}
      </form>
    </div>
  );
}

const inputClass =
  "w-full rounded-lg bg-white border border-gray-300 px-4 py-2.5 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-green-500 text-sm";

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-sm font-semibold text-gray-700 mb-1.5">{label}</label>
      {children}
    </div>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium border transition-colors ${
        checked
          ? "bg-green-600 border-green-600 text-white"
          : "border-gray-300 text-gray-600 hover:border-gray-400 bg-white"
      }`}
    >
      <span
        className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
          checked ? "border-white bg-white" : "border-gray-400"
        }`}
      >
        {checked && (
          <span className="w-2 h-2 rounded-full bg-green-600 block" />
        )}
      </span>
      {label}
    </button>
  );
}
