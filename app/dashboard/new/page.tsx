"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

const TONES = [
  { value: "friendly", label: "Vennlig" },
  { value: "energetic", label: "Energisk" },
  { value: "professional", label: "Profesjonell" },
  { value: "calm", label: "Rolig" },
];

const MUSIC_STYLES = [
  { value: "upbeat", label: "Upbeat" },
  { value: "minimal", label: "Minimal" },
  { value: "cinematic", label: "Cinematisk" },
];

const SERVICES = [
  { value: "reforhandle", label: "Reforhandle" },
  { value: "singlepicker", label: "SinglePicker" },
  { value: "custom", label: "Egendefinert" },
];

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
  const [loading, setLoading] = useState(false);
  const [scriptLoading, setScriptLoading] = useState(false);
  const [campaignType, setCampaignType] = useState<"reklame" | "storytelling">("reklame");
  const [segments, setSegments] = useState<Segment[]>([]);
  const [musicLibrary, setMusicLibrary] = useState<Array<{ filename: string; name: string; url: string; size: number }>>([]);
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

  // Load music library from droplet server
  useEffect(() => {
    fetch('http://139.59.212.218:3002/music')
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
      console.error('Script generation feilet:', err);
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
      console.error('Produksjon feilet:', err);
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
          ← Tilbake
        </Link>
        <span className="text-gray-300">/</span>
        <h1 className="text-xl font-bold text-gray-900">Ny kampanje</h1>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-6">
        {/* Campaign type toggle */}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => { setCampaignType("reklame"); setSegments([]); }}
            className={`flex-1 py-2 px-4 rounded-lg font-medium transition-colors ${
              campaignType === "reklame"
                ? "bg-blue-600 text-white"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
          >
            📢 Reklame
          </button>
          <button
            type="button"
            onClick={() => setCampaignType("storytelling")}
            className={`flex-1 py-2 px-4 rounded-lg font-medium transition-colors ${
              campaignType === "storytelling"
                ? "bg-blue-600 text-white"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
          >
            ✨ Storytelling
          </button>
        </div>

        {/* Basic info */}
        <div className="rounded-2xl border border-gray-200 bg-white p-6 flex flex-col gap-4 shadow-sm">
          <h2 className="font-semibold text-gray-700 text-sm uppercase tracking-widest">
            {campaignType === "reklame" ? "Grunninfo" : "Historiekampanje"}
          </h2>

          <Field label="Kampanjenavn">
            <input
              required
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Reforhandle Vår 2026"
              className={inputClass}
            />
          </Field>

          <Field label="Tjeneste">
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

          <Field label="Produktnavn">
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
            {campaignType === "reklame" ? "Innhold" : "Historieelementer"}
          </h2>

          {campaignType === "reklame" && (
            <Field label={`Headline (maks 40 tegn) — ${form.headline.length}/40`}>
              <input
                required
                maxLength={40}
                value={form.headline}
                onChange={(e) =>
                  setForm((f) => ({ ...f, headline: e.target.value }))
                }
                placeholder="Spar tusenvis på strøm og internett"
                className={inputClass}
              />
            </Field>
          )}

          {campaignType === "storytelling" && (
            <Field label="Målgruppe">
              <input
                required
                value={form.targetAudience}
                onChange={(e) =>
                  setForm((f) => ({ ...f, targetAudience: e.target.value }))
                }
                placeholder="Huseiere, 35-55 år, bor i Norge"
                className={inputClass}
              />
            </Field>
          )}

          {campaignType === "storytelling" && (
            <Field label="Problem som løses">
              <input
                required
                value={form.problem}
                onChange={(e) =>
                  setForm((f) => ({ ...f, problem: e.target.value }))
                }
                placeholder="Betaler for mye på strøm og internett"
                className={inputClass}
              />
            </Field>
          )}

          <Field label="Stemme">
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
            <Field
              label={`Body copy (maks 125 tegn) — ${form.bodyCopy.length}/125`}
            >
              <textarea
                required
                maxLength={125}
                value={form.bodyCopy}
                onChange={(e) =>
                  setForm((f) => ({ ...f, bodyCopy: e.target.value }))
                }
                placeholder="Vi forhandler abonnementene dine — du betaler bare for resultater."
                rows={3}
                className={inputClass + " resize-none"}
              />
            </Field>
          )}

          <Field label="Call to action">
            <input
              required
              value={form.cta}
              onChange={(e) => setForm((f) => ({ ...f, cta: e.target.value }))}
              placeholder="Start gratis"
              className={inputClass}
            />
          </Field>

          {campaignType === "reklame" && (
            <Field label="Tone">
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
            Media
          </h2>

          <div className="flex gap-4">
            <Toggle
              label="Voiceover"
              checked={form.voiceover}
              onChange={(v) => setForm((f) => ({ ...f, voiceover: v }))}
            />
            <Toggle
              label="Bakgrunnsmusikk"
              checked={form.music}
              onChange={(v) => setForm((f) => ({ ...f, music: v }))}
            />
          </div>

          {form.music && (
            <Field label="Musikk-stil">
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

          <Field label="Formater">
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

          <Field label="Bakgrunnsmusikk">
            <div className="space-y-3">
              {musicLibrary.length > 0 ? (
                <>
                  <div className="grid gap-2">
                    {musicLibrary.map((music) => (
                      <button
                        key={music.filename}
                        type="button"
                        onClick={() => {
                          // Store selected music path for job submission
                          console.log('Selected music:', music.filename)
                        }}
                        className="text-left p-3 border border-gray-300 rounded-lg hover:border-blue-500 hover:bg-blue-50 transition-colors"
                      >
                        <div className="font-medium text-gray-900">{music.name}</div>
                        <div className="text-xs text-gray-500">
                          {(music.size / 1024 / 1024).toFixed(1)}MB
                        </div>
                        <audio
                          controls
                          className="mt-2 w-full h-6"
                          src={music.url}
                        />
                      </button>
                    ))}
                  </div>
                </>
              ) : (
                <p className="text-gray-500 text-sm">Laster musikk-bibliotek...</p>
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
            className="rounded-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-semibold py-3 text-sm transition-colors"
          >
            {scriptLoading ? "Genererer manus..." : "Generer manus"}
          </button>
        )}

        {/* Storytelling: Editable segments */}
        {campaignType === "storytelling" && segments.length > 0 && (
          <div className="rounded-2xl border border-blue-200 bg-blue-50 p-6 flex flex-col gap-5 shadow-sm">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-blue-800 text-sm uppercase tracking-widest">
                Manus — rediger om nødvendig
              </h2>
              <button
                type="button"
                onClick={handleGenerateScript}
                disabled={scriptLoading}
                className="text-xs text-blue-600 hover:text-blue-800 underline disabled:opacity-50"
              >
                {scriptLoading ? "Genererer..." : "Generer på nytt"}
              </button>
            </div>

            {segments.map((seg, i) => (
              <div key={i} className="flex flex-col gap-2">
                <span className="text-xs font-semibold text-blue-600 uppercase tracking-wide">
                  Segment {i + 1}
                </span>
                <Field label="Voiceover-tekst">
                  <textarea
                    value={seg.text}
                    onChange={(e) => updateSegment(i, "text", e.target.value)}
                    rows={2}
                    className={inputClass + " resize-none"}
                  />
                </Field>
                <Field label="Bildeprompt (DALL-E)">
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
            {loading ? "Starter produksjon..." : "Start produksjon"}
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
