"use client";

import { useState } from "react";
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

export default function NewCampaignPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    name: "",
    productName: "",
    headline: "",
    bodyCopy: "",
    cta: "",
    tone: "friendly",
    service: "reforhandle",
    voiceover: true,
    music: true,
    musicStyle: "upbeat",
    formats: ["16:9", "9:16", "1:1"] as string[],
  });

  function toggle(format: string) {
    setForm((f) => ({
      ...f,
      formats: f.formats.includes(format)
        ? f.formats.filter((x) => x !== format)
        : [...f.formats, format],
    }));
  }

  async function handleProduksjon() {
    console.log('Start produksjon klikket', form);
    setLoading(true);

    try {
      const res = await fetch('/api/content/produce/video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          campaignId: `campaign-${Date.now()}`,
          service: form.service,
          headline: form.headline,
          bodyCopy: form.bodyCopy,
          tone: form.tone,
        }),
      });

      if (!res.ok) throw new Error('API error');
      const { jobId } = await res.json();
      
      console.log('Got jobId:', jobId);
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
        {/* Basic info */}
        <div className="rounded-2xl border border-gray-200 bg-white p-6 flex flex-col gap-4 shadow-sm">
          <h2 className="font-semibold text-gray-700 text-sm uppercase tracking-widest">
            Grunninfo
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
            Innhold
          </h2>

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

          <Field label="Call to action">
            <input
              required
              value={form.cta}
              onChange={(e) => setForm((f) => ({ ...f, cta: e.target.value }))}
              placeholder="Start gratis"
              className={inputClass}
            />
          </Field>

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
        </div>

        <button
          type="button"
          onClick={handleProduksjon}
          disabled={loading || form.formats.length === 0}
          className="rounded-full bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white font-semibold py-3 text-sm transition-colors"
        >
          {loading ? "Starter produksjon..." : "Start produksjon"}
        </button>
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
